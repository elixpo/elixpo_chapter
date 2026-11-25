"""Declarative audit and bounded reconciliation for Elixpo repositories."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml


def load_policy(path: Path) -> dict[str, Any]:
    policy = yaml.safe_load(path.read_text()) or {}
    if policy.get("schema_version") != 1 or not policy.get("owner"):
        raise ValueError("invalid repository standard policy")
    if not isinstance(policy.get("defaults", {}).get("settings"), dict):
        raise ValueError("repository standard has no default settings")
    if not isinstance(policy.get("defaults", {}).get("ruleset"), dict):
        raise ValueError("repository standard has no default ruleset")
    return policy


def managed_repositories(root: Path, policy: dict[str, Any]) -> list[str]:
    manifest_path = root / str(policy.get("repository_manifest") or "config/elixpoo_rollout.yaml")
    manifest = yaml.safe_load(manifest_path.read_text()) or {}
    return sorted(
        (str(name) for name in (manifest.get("repositories") or {})),
        key=str.casefold,
    )


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def desired_for(policy: dict[str, Any], repository: str) -> dict[str, Any]:
    return _merge(policy["defaults"], (policy.get("overrides") or {}).get(repository) or {})


def settings_drift(live: dict[str, Any], desired: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        key: {"actual": live.get(key), "expected": expected}
        for key, expected in desired.items()
        if live.get(key) != expected
    }


def _rule(rules: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    return next((rule for rule in rules if rule.get("type") == kind), None)


def ruleset_drift(live: dict[str, Any] | None, desired: dict[str, Any]) -> dict[str, Any]:
    if live is None:
        return {"ruleset": {"actual": None, "expected": "present"}}

    drift: dict[str, Any] = {}
    if live.get("name") not in desired["names"]:
        drift["name"] = {"actual": live.get("name"), "expected": desired["names"]}
    for key in ("enforcement", "target"):
        if live.get(key) != desired[key]:
            drift[key] = {"actual": live.get(key), "expected": desired[key]}

    includes = sorted(((live.get("conditions") or {}).get("ref_name") or {}).get("include") or [])
    expected_includes = sorted(desired["include"])
    if includes != expected_includes:
        drift["include"] = {"actual": includes, "expected": expected_includes}

    rules = list(live.get("rules") or [])
    live_types = {str(rule.get("type")) for rule in rules}
    missing = sorted(set(desired["required_rules"]) - live_types)
    if missing:
        drift["missing_rules"] = missing

    pull_request = _rule(rules, "pull_request")
    if pull_request is None:
        return drift
    parameters = pull_request.get("parameters") or {}
    for key in (
        "allowed_merge_methods",
        "required_approving_review_count",
        "dismiss_stale_reviews_on_push",
        "required_review_thread_resolution",
        "require_code_owner_review",
        "require_last_push_approval",
        "require_extra_approval_for_unattributed_changes",
    ):
        actual = sorted(parameters.get(key) or []) if key == "allowed_merge_methods" else parameters.get(key)
        expected = sorted(desired[key]) if key == "allowed_merge_methods" else desired[key]
        if actual != expected:
            drift[f"pull_request.{key}"] = {"actual": actual, "expected": expected}

    expected_checks = sorted(desired.get("required_status_checks") or [])
    status_rule = _rule(rules, "required_status_checks")
    actual_checks = sorted(
        str(item.get("context"))
        for item in ((status_rule or {}).get("parameters") or {}).get("required_status_checks", [])
    )
    if actual_checks != expected_checks:
        drift["required_status_checks"] = {"actual": actual_checks, "expected": expected_checks}
    if expected_checks:
        strict = ((status_rule or {}).get("parameters") or {}).get("strict_required_status_checks_policy")
        if strict != desired["strict_required_status_checks_policy"]:
            drift["strict_required_status_checks_policy"] = {
                "actual": strict,
                "expected": desired["strict_required_status_checks_policy"],
            }
    return drift


async def _main_ruleset(api, owner: str, repository: str, desired: dict[str, Any]) -> dict[str, Any] | None:
    summaries = await api._request("GET", f"/repos/{owner}/{repository}/rulesets")
    candidates = [item for item in summaries if item.get("name") in desired["names"]]
    if not candidates:
        candidates = [item for item in summaries if item.get("target") == "branch"]
    if not candidates:
        return None
    return await api._request("GET", f"/repos/{owner}/{repository}/rulesets/{candidates[0]['id']}")


async def audit_repository(api, owner: str, repository: str, desired: dict[str, Any]) -> dict[str, Any]:
    metadata, ruleset = await asyncio.gather(
        api.get_repo(owner, repository),
        _main_ruleset(api, owner, repository, desired["ruleset"]),
    )
    if metadata.get("archived"):
        return {"repository": f"{owner}/{repository}", "status": "excluded", "reason": "archived"}
    settings = settings_drift(metadata, desired["settings"])
    rules = ruleset_drift(ruleset, desired["ruleset"])
    return {
        "repository": f"{owner}/{repository}",
        "status": "drifted" if settings or rules else "current",
        "settings": settings,
        "ruleset": rules,
    }


async def audit(
    api,
    root: Path,
    policy: dict[str, Any],
    *,
    only_repo: str = "",
    concurrency: int = 5,
) -> dict[str, Any]:
    owner = str(policy["owner"])
    names = [
        name
        for name in managed_repositories(root, policy)
        if not only_repo or only_repo in {name, f"{owner}/{name}"}
    ]
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def one(name: str) -> dict[str, Any]:
        async with semaphore:
            try:
                return await audit_repository(api, owner, name, desired_for(policy, name))
            except Exception as exc:
                return {
                    "repository": f"{owner}/{name}",
                    "status": "failed",
                    "error": f"{type(exc).__name__}: {exc}",
                }

    results = await asyncio.gather(*(one(name) for name in names))
    return {
        "schema_version": 1,
        "read_only": True,
        "results": sorted(results, key=lambda item: item["repository"].casefold()),
    }


async def apply_settings(api, policy: dict[str, Any], audit_result: dict[str, Any]) -> list[dict[str, Any]]:
    """Apply repository metadata only; rulesets remain review-only by design."""
    owner = str(policy["owner"])
    results: list[dict[str, Any]] = []
    for item in audit_result["results"]:
        name = str(item["repository"]).split("/", 1)[1]
        drift = item.get("settings") or {}
        if item.get("status") == "failed":
            results.append(item)
            continue
        if not drift:
            results.append({"repository": item["repository"], "status": "current"})
            continue
        desired = desired_for(policy, name)["settings"]
        payload = {key: desired[key] for key in drift}
        await api._request("PATCH", f"/repos/{owner}/{name}", json=payload)
        results.append(
            {"repository": item["repository"], "status": "updated", "settings": sorted(payload)}
        )
    return results

from __future__ import annotations

from pathlib import Path

from agents.repository_standard.core import (
    desired_for,
    managed_repositories,
    ruleset_drift,
    settings_drift,
)


def policy() -> dict:
    return {
        "owner": "elixpo",
        "repository_manifest": "config/elixpoo_rollout.yaml",
        "defaults": {
            "settings": {"default_branch": "main", "has_issues": True},
            "ruleset": {
                "names": ["Elixpo main standard"],
                "enforcement": "active",
                "target": "branch",
                "include": ["refs/heads/main"],
                "required_rules": ["deletion", "non_fast_forward", "pull_request"],
                "allowed_merge_methods": ["squash"],
                "required_approving_review_count": 0,
                "dismiss_stale_reviews_on_push": True,
                "required_review_thread_resolution": True,
                "require_code_owner_review": False,
                "require_last_push_approval": False,
                "require_extra_approval_for_unattributed_changes": False,
                "strict_required_status_checks_policy": True,
                "required_status_checks": [],
            },
        },
        "overrides": {"profile": {"settings": {"has_issues": False}}},
    }


def test_desired_repository_policy_merges_nested_overrides() -> None:
    desired = desired_for(policy(), "profile")
    assert desired["settings"] == {"default_branch": "main", "has_issues": False}
    assert desired["ruleset"]["allowed_merge_methods"] == ["squash"]


def test_managed_repositories_includes_caller_deferred_repositories(tmp_path: Path) -> None:
    folder = tmp_path / "config"
    folder.mkdir()
    (folder / "elixpoo_rollout.yaml").write_text(
        "repositories:\n  active: {triage: true}\n  later: {deferred: true}\n"
    )
    assert managed_repositories(tmp_path, policy()) == ["active", "later"]


def test_settings_drift_is_field_specific() -> None:
    assert settings_drift(
        {"default_branch": "master", "has_issues": True},
        {"default_branch": "main", "has_issues": True},
    ) == {"default_branch": {"actual": "master", "expected": "main"}}


def test_ruleset_drift_preserves_repository_specific_checks() -> None:
    desired = desired_for(policy(), "normal")["ruleset"]
    desired["required_status_checks"] = ["Quality"]
    live = {
        "name": "Elixpo main standard",
        "enforcement": "active",
        "target": "branch",
        "conditions": {"ref_name": {"include": ["refs/heads/main"]}},
        "rules": [
            {"type": "deletion"},
            {"type": "non_fast_forward"},
            {
                "type": "pull_request",
                "parameters": {
                    "allowed_merge_methods": ["squash"],
                    "required_approving_review_count": 0,
                    "dismiss_stale_reviews_on_push": True,
                    "required_review_thread_resolution": True,
                    "require_code_owner_review": False,
                    "require_last_push_approval": False,
                    "require_extra_approval_for_unattributed_changes": False,
                },
            },
            {
                "type": "required_status_checks",
                "parameters": {
                    "strict_required_status_checks_policy": True,
                    "required_status_checks": [{"context": "Wrong check"}],
                },
            },
        ],
    }
    assert ruleset_drift(live, desired)["required_status_checks"] == {
        "actual": ["Wrong check"],
        "expected": ["Quality"],
    }

#!/usr/bin/env python3
"""Generate interconnect characterization and flagship bootstrap assets for the paper.

Inputs (all retained, untracked measurement data):

* Stage 1 Bridge RPC campaigns (schedutil and performance governor, idle and CPU-loaded)
  under ``data/processed/campaigns`` with raw samples under ``data/raw/campaigns``.
* Stage 1 concurrency campaigns under ``data/processed/concurrency`` and
  ``data/raw/concurrency``.
* The Stage 11 flagship replay inputs listed in the source manifest of
  ``data/processed/stage11/stage11-evaluation-01/evaluation.json``.

Every processed percentile used here is first recomputed from the raw JSONL samples, and the
Stage 11 flagship replay is re-executed and checked against the audited summary before any
bootstrap is computed. A mismatch aborts generation instead of emitting unverifiable numbers.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import math
import random
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "paper/generated"

CAMPAIGNS = {
    ("schedutil", "idle"): "data/processed/campaigns/idle/stage1b-directional-idle",
    ("schedutil", "loaded"): "data/processed/campaigns/cpu-loaded/stage1b-directional-cpu-loaded",
    ("performance", "idle"): "data/processed/campaigns/idle-performance/stage1-performance-idle",
    ("performance", "loaded"): (
        "data/processed/campaigns/cpu-loaded-performance/stage1-performance-cpu-loaded"
    ),
}
CONCURRENCY = {
    "idle": "data/processed/concurrency/idle/stage1-concurrency-idle",
    "loaded": "data/processed/concurrency/cpu-loaded/stage1-concurrency-cpu-loaded",
}
WORKERS = (1, 2, 4, 8)
# Linux-initiated experiments used by docs/stage-1-findings.md for the load-effect ranges.
LINUX_INITIATED = (("clock", "clock-sample"), ("matrix", "matrix-update"))

STAGE11 = ROOT / "data/processed/stage11/stage11-evaluation-01/evaluation.json"
BOOTSTRAP_SEED = 20261027
RESAMPLES = 10_000
CONFIDENCE = 0.95


# --------------------------------------------------------------------------- helpers


def macro(name: str, value: object) -> str:
    return rf"\newcommand{{\{name}}}{{{value}}}" + "\n"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def percentile(values: list[float], percentage: float) -> float:
    """Linear-interpolation percentile identical to qfabric.profiling.percentile."""
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * percentage / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def sorted_percentile(ordered: list[float], percentage: float) -> float:
    position = (len(ordered) - 1) * percentage / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def pct_change(new: float, old: float) -> float:
    return (new - old) / old * 100


def ms(ns: float) -> float:
    return ns / 1_000_000


def raw_path(processed: Path) -> Path:
    relative = processed.relative_to(ROOT / "data/processed")
    return ROOT / "data/raw" / relative.with_suffix(".jsonl")


def verify_against_raw(processed: Path, groups: list[dict], sources: set[Path]) -> int:
    """Recompute every group's percentiles from the raw JSONL and require exact agreement."""
    raw = raw_path(processed)
    sources.add(raw)
    samples: dict[str, list[int]] = {}
    failures: dict[str, int] = {}
    with raw.open(encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row["outcome"] == "ok":
                samples.setdefault(row["run_id"], []).append(int(row["latency_ns"]))
            else:
                failures[row["run_id"]] = failures.get(row["run_id"], 0) + 1
    for group in groups:
        values = samples[group["run_id"]]
        if len(values) != group["count"] or failures.get(group["run_id"], 0) != group["failures"]:
            raise SystemExit(f"sample count mismatch for {group['run_id']} in {raw}")
        for key, level in (("p50_ns", 50), ("p95_ns", 95), ("p99_ns", 99)):
            if not math.isclose(percentile(values, level), group[key], rel_tol=1e-12):
                raise SystemExit(f"{key} mismatch for {group['run_id']} in {raw}")
        if not math.isclose(statistics.fmean(values), group["mean_ns"], rel_tol=1e-12):
            raise SystemExit(f"mean mismatch for {group['run_id']} in {raw}")
    return sum(len(samples[group["run_id"]]) for group in groups)


def repetitions(campaign: str) -> list[Path]:
    paths = sorted((ROOT / campaign).glob("repetition-*"))
    if len(paths) != 3:
        raise SystemExit(f"expected three repetitions in {campaign}, found {len(paths)}")
    return paths


# --------------------------------------------------------------- Task 1: interconnect


def campaign_means(campaign: str, kind: str, sources: set[Path], counter: list[int]) -> dict:
    """Mean of repetition-level statistics, keyed by payload bytes (the findings-doc rule)."""
    per_payload: dict[int, list[dict]] = {}
    for repetition in repetitions(campaign):
        path = repetition / f"{kind}.json"
        sources.add(path)
        groups = load(path)["groups"]
        counter[0] += verify_against_raw(path, groups, sources)
        for group in groups:
            per_payload.setdefault(int(group["payload_bytes"]), []).append(group)
    summary = {}
    for payload, groups in sorted(per_payload.items()):
        if len(groups) != 3:
            raise SystemExit(f"{campaign}/{kind}: payload {payload} lacks three repetitions")
        summary[payload] = {
            key: statistics.fmean(float(group[key]) for group in groups)
            for key in ("p50_ns", "p95_ns", "p99_ns", "sequential_calls_per_second")
        }
        summary[payload]["failures"] = sum(group["failures"] for group in groups)
    return summary


def interconnect(sources: set[Path]) -> tuple[str, dict]:
    counter = [0]
    echo = {
        key: campaign_means(path, "roundtrip", sources, counter) for key, path in CAMPAIGNS.items()
    }
    other = {
        (key, name): campaign_means(path, kind, sources, counter)[0]
        for key, path in CAMPAIGNS.items()
        for kind, name in LINUX_INITIATED
    }
    payloads = sorted(echo[("schedutil", "idle")])

    columns = []
    for governor, prefix in (("schedutil", ""), ("performance", "perf_")):
        for condition in ("idle", "loaded"):
            columns.append((f"{prefix}{condition}_p50_ms", governor, condition, "p50_ns"))
            columns.append((f"{prefix}{condition}_p95_ms", governor, condition, "p95_ns"))
            columns.append(
                (
                    f"{prefix}{condition}_calls_per_s",
                    governor,
                    condition,
                    "sequential_calls_per_second",
                )
            )
    with (OUT / "interconnect-payload.dat").open("w", encoding="utf-8") as handle:
        handle.write("payload_bytes " + " ".join(column[0] for column in columns) + "\n")
        for payload in payloads:
            cells = []
            for _name, governor, condition, key in columns:
                value = echo[(governor, condition)][payload][key]
                cells.append(
                    f"{value:.6f}" if key == "sequential_calls_per_second" else f"{ms(value):.6f}"
                )
            handle.write(f"{payload} " + " ".join(cells) + "\n")

    concurrency: dict[str, dict[int, dict]] = {}
    for condition, campaign in CONCURRENCY.items():
        concurrency[condition] = {}
        for workers in WORKERS:
            groups = []
            for repetition in repetitions(campaign):
                path = repetition / f"workers-{workers:02d}.json"
                sources.add(path)
                group = load(path)["groups"]
                counter[0] += verify_against_raw(path, group, sources)
                groups.extend(group)
            concurrency[condition][workers] = {
                key: statistics.fmean(float(group[key]) for group in groups)
                for key in ("p50_ns", "p95_ns", "p99_ns", "concurrent_successes_per_second")
            }
            concurrency[condition][workers]["maximum_ns"] = max(g["maximum_ns"] for g in groups)
            concurrency[condition][workers]["failures"] = sum(g["failures"] for g in groups)
    with (OUT / "interconnect-concurrency.dat").open("w", encoding="utf-8") as handle:
        handle.write(
            "workers idle_p50_ms idle_p95_ms idle_p99_ms idle_calls_per_s "
            "loaded_p50_ms loaded_p95_ms loaded_p99_ms loaded_calls_per_s\n"
        )
        for workers in WORKERS:
            cells = []
            for condition in ("idle", "loaded"):
                row = concurrency[condition][workers]
                cells.extend(
                    [
                        f"{ms(row['p50_ns']):.6f}",
                        f"{ms(row['p95_ns']):.6f}",
                        f"{ms(row['p99_ns']):.6f}",
                        f"{row['concurrent_successes_per_second']:.6f}",
                    ]
                )
            handle.write(f"{workers} " + " ".join(cells) + "\n")

    # Headline values.
    def load_effect(governor: str) -> list[float]:
        changes = [
            pct_change(
                echo[(governor, "loaded")][p]["p95_ns"], echo[(governor, "idle")][p]["p95_ns"]
            )
            for p in payloads
        ]
        changes += [
            pct_change(
                other[((governor, "loaded"), n)]["p95_ns"], other[((governor, "idle"), n)]["p95_ns"]
            )
            for _kind, n in LINUX_INITIATED
        ]
        return changes

    def governor_effect(condition: str) -> list[float]:
        return [
            pct_change(
                echo[("performance", condition)][p]["p95_ns"],
                echo[("schedutil", condition)][p]["p95_ns"],
            )
            for p in payloads
        ]

    idle = echo[("schedutil", "idle")]
    loaded = echo[("schedutil", "loaded")]
    maximum = payloads[-1]
    sched_load = load_effect("schedutil")
    perf_load = load_effect("performance")
    gov_idle = governor_effect("idle")
    gov_loaded = governor_effect("loaded")
    conc_idle = concurrency["idle"]
    conc_loaded = concurrency["loaded"]
    loaded_tput_gain = [
        pct_change(
            conc_loaded[w]["concurrent_successes_per_second"],
            conc_idle[w]["concurrent_successes_per_second"],
        )
        for w in WORKERS
    ]
    headline = {
        "payloads": payloads,
        "zero_byte_idle_calls_per_s": idle[0]["sequential_calls_per_second"],
        "zero_byte_loaded_calls_per_s": loaded[0]["sequential_calls_per_second"],
        "max_payload_idle_calls_per_s": idle[maximum]["sequential_calls_per_second"],
        "max_payload_loaded_calls_per_s": loaded[maximum]["sequential_calls_per_second"],
        "schedutil_load_p95_change_pct": [min(sched_load), max(sched_load)],
        "performance_load_p95_change_pct": [min(perf_load), max(perf_load)],
        "governor_idle_p95_change_pct": [min(gov_idle), max(gov_idle)],
        "governor_loaded_p95_change_pct": [min(gov_loaded), max(gov_loaded)],
        "concurrency_eight_over_one": (
            conc_idle[8]["concurrent_successes_per_second"]
            / conc_idle[1]["concurrent_successes_per_second"]
        ),
        "loaded_concurrency_throughput_gain_pct": [min(loaded_tput_gain), max(loaded_tput_gain)],
        "raw_samples_verified": counter[0],
    }

    f2 = lambda value: f"{value:.2f}"  # noqa: E731
    f1 = lambda value: f"{value:.1f}"  # noqa: E731
    signed = lambda value: f"${value:+.1f}$"  # noqa: E731
    text = "".join(
        [
            macro("IcMaxPayloadBytes", maximum),
            macro("IcZeroByteIdleCallsPerSec", f1(idle[0]["sequential_calls_per_second"])),
            macro("IcZeroByteLoadedCallsPerSec", f1(loaded[0]["sequential_calls_per_second"])),
            macro("IcMaxPayloadIdleCallsPerSec", f1(idle[maximum]["sequential_calls_per_second"])),
            macro(
                "IcMaxPayloadLoadedCallsPerSec",
                f1(loaded[maximum]["sequential_calls_per_second"]),
            ),
            macro("IcZeroByteIdlePfifty", f2(ms(idle[0]["p50_ns"]))),
            macro("IcZeroByteIdlePninetyfive", f2(ms(idle[0]["p95_ns"]))),
            macro("IcZeroByteLoadedPninetyfive", f2(ms(loaded[0]["p95_ns"]))),
            macro("IcMaxPayloadIdlePfifty", f2(ms(idle[maximum]["p50_ns"]))),
            macro("IcMaxPayloadIdlePninetyfive", f2(ms(idle[maximum]["p95_ns"]))),
            macro("IcMaxPayloadLoadedPninetyfive", f2(ms(loaded[maximum]["p95_ns"]))),
            macro("IcSchedutilLoadPninetyfiveMin", f1(min(sched_load)) + r"\%"),
            macro("IcSchedutilLoadPninetyfiveMax", f1(max(sched_load)) + r"\%"),
            macro("IcPerformanceLoadPninetyfiveMin", f1(min(perf_load)) + r"\%"),
            macro("IcPerformanceLoadPninetyfiveMax", f1(max(perf_load)) + r"\%"),
            macro("IcGovernorIdlePninetyfiveMin", signed(min(gov_idle)) + r"\%"),
            macro("IcGovernorIdlePninetyfiveMax", signed(max(gov_idle)) + r"\%"),
            macro("IcGovernorLoadedPninetyfiveMin", signed(min(gov_loaded)) + r"\%"),
            macro("IcGovernorLoadedPninetyfiveMax", signed(max(gov_loaded)) + r"\%"),
            macro(
                "IcConcOneIdleCallsPerSec",
                f2(conc_idle[1]["concurrent_successes_per_second"]),
            ),
            macro(
                "IcConcEightIdleCallsPerSec",
                f2(conc_idle[8]["concurrent_successes_per_second"]),
            ),
            macro(
                "IcConcEightLoadedCallsPerSec",
                f2(conc_loaded[8]["concurrent_successes_per_second"]),
            ),
            macro("IcConcScaling", f2(headline["concurrency_eight_over_one"])),
            macro("IcConcOneIdlePninetyfive", f2(ms(conc_idle[1]["p95_ns"]))),
            macro("IcConcEightIdlePninetyfive", f2(ms(conc_idle[8]["p95_ns"]))),
            macro("IcConcOneLoadedPninetyfive", f2(ms(conc_loaded[1]["p95_ns"]))),
            macro("IcConcEightLoadedPninetyfive", f2(ms(conc_loaded[8]["p95_ns"]))),
            macro("IcConcLoadedGainMin", f1(min(loaded_tput_gain)) + r"\%"),
            macro("IcConcLoadedGainMax", f1(max(loaded_tput_gain)) + r"\%"),
            macro("IcConcLoadedMaxMs", f2(ms(max(r["maximum_ns"] for r in conc_loaded.values())))),
            macro("IcRawSamplesVerified", f"{counter[0]:,}".replace(",", "{,}")),
        ]
    )
    return text, headline


# ------------------------------------------------- Task 2: flagship bootstrap intervals


def profile_samples(report: dict, domain: str) -> list[int]:
    group = next(
        item
        for item in report["groups"]
        if item["domain"] == domain and item["instrumentation"] == "full"
    )
    return [
        int(sample["end_to_end_ns"])
        for sample in group["samples"]
        if sample["outcome"] == "ok" and sample["end_to_end_ns"] is not None
    ]


def kernel_runs(paths: list[Path]) -> list[list[int]]:
    return [
        [
            int(sample["end_to_end_ns"])
            for sample in load(path)["samples"]
            if sample.get("outcome") == "ok" and sample.get("end_to_end_ns") is not None
        ]
        for path in paths
    ]


def replay(
    app: dict,
    baseline: str,
    linux: list[int],
    rt: list[int],
    tuned: list[int],
    boundary_ns: int,
    observations: int,
    seed: int,
    switch: int,
) -> list[int]:
    """Re-execute the Stage 11 loaded flagship replay and return per-observation latency.

    This mirrors qfabric.evaluation._simulate (loaded=True) draw for draw so that the
    audited summary can be checked exactly; that function only persists summaries.
    """
    rng = random.Random(seed)
    nodes = app["nodes"]
    if baseline in {"ordinary-linux", "tuned-linux", "qfabric-static", "qfabric-recovery"}:
        placement = ["linux"] * len(nodes)
    elif baseline == "static-mcu-first":
        placement = ["linux" if node["linux_only"] else "rt" for node in nodes]
    elif baseline == "manual-expert":
        placement = list(app["manual_expert"])
    else:
        placement = None
    linux_source = tuned if baseline == "tuned-linux" else linux
    values = []
    for index in range(observations):
        domains = placement
        if baseline == "qfabric-recovery" and index >= switch:
            domains = ["linux" if node["linux_only"] else "rt" for node in nodes]
        draws = [(rng.choice(linux_source), rng.choice(rt)) for _node in nodes]
        if placement is None:
            choices = [("linux",) if node["linux_only"] else ("linux", "rt") for node in nodes]
            best = None
            for candidate in itertools.product(*choices):
                cost = sum(draws[i][0 if d == "linux" else 1] for i, d in enumerate(candidate))
                edges = zip(candidate, candidate[1:], strict=False)
                cost += sum(boundary_ns for a, b in edges if a != b)
                if best is None or (cost, candidate) < best:
                    best = (cost, candidate)
            domains = list(best[1])
        total = 0
        for i, domain in enumerate(domains):
            total += draws[i][0 if domain == "linux" else 1]
            if i and domains[i - 1] != domain:
                total += boundary_ns
        values.append(total)
    return values


def lag_autocorrelation(values: list[float], lag: int) -> float:
    mean = statistics.fmean(values)
    denominator = sum((v - mean) ** 2 for v in values)
    return (
        sum((values[i] - mean) * (values[i + lag] - mean) for i in range(len(values) - lag))
        / denominator
    )


def block_length(values: list[float]) -> int:
    """First lag whose sample autocorrelation lies inside the +/-2/sqrt(n) white-noise band."""
    band = 2 / math.sqrt(len(values))
    for lag in range(1, len(values) // 2):
        if abs(lag_autocorrelation(values, lag)) < band:
            return lag
    return len(values) // 2


def circular_block_resample(rng: random.Random, values: list[int], block: int) -> list[int]:
    n = len(values)
    if block <= 1:
        return rng.choices(values, k=n)
    doubled = values + values[:block]
    out: list[int] = []
    while len(out) < n:
        start = rng.randrange(n)
        out.extend(doubled[start : start + block])
    return out[:n]


def fast_replay(
    rng: random.Random,
    linux: list[int],
    rt: list[int],
    tuned: list[int],
    manual: list[str],
    boundary: int,
    observations: int,
    switch: int,
) -> dict[str, list[int]]:
    """Equivalent replay for the all-eligible four-node chain with fresh common draws."""
    k = observations * 4
    lin = rng.choices(linux, k=k)
    rts = rng.choices(rt, k=k)
    tun = rng.choices(tuned, k=k)
    all_linux = [sum(lin[i : i + 4]) for i in range(0, k, 4)]
    all_rt = [sum(rts[i : i + 4]) for i in range(0, k, 4)]
    all_tuned = [sum(tun[i : i + 4]) for i in range(0, k, 4)]
    manual_values = []
    oracle = []
    for i in range(0, k, 4):
        pair = (
            (lin[i], rts[i]),
            (lin[i + 1], rts[i + 1]),
            (lin[i + 2], rts[i + 2]),
            (lin[i + 3], rts[i + 3]),
        )
        total = 0
        for node, domain in enumerate(manual):
            total += pair[node][0 if domain == "linux" else 1]
            if node and manual[node - 1] != domain:
                total += boundary
        manual_values.append(total)
        best_l, best_r = pair[0]
        for node in (1, 2, 3):
            lo, ro = pair[node]
            best_l, best_r = (
                min(best_l, best_r + boundary) + lo,
                min(best_r, best_l + boundary) + ro,
            )
        oracle.append(min(best_l, best_r))
    recovery = all_linux[:switch] + all_rt[switch:]
    return {
        "ordinary-linux": all_linux,
        "tuned-linux": all_tuned,
        "static-mcu-first": all_rt,
        "manual-expert": manual_values,
        "qfabric-static": all_linux,
        "qfabric-recovery": recovery,
        "offline-oracle": oracle,
    }


def interval(values: list[float]) -> tuple[float, float]:
    ordered = sorted(values)
    alpha = (1 - CONFIDENCE) / 2
    return sorted_percentile(ordered, alpha * 100), sorted_percentile(ordered, (1 - alpha) * 100)


def flagship_ci(sources: set[Path]) -> dict:
    report = load(STAGE11)
    sources.add(STAGE11)
    manifest = {item["path"]: item["sha256"] for item in report["source_manifest"]}
    for relative, digest in manifest.items():
        if sha256(ROOT / relative) != digest:
            raise SystemExit(f"Stage 11 source digest mismatch: {relative}")
    applications = load(ROOT / "config/stage11-applications.json")
    app = applications["applications"][0]
    seed = int(applications["seed"]) + 1000
    stage4 = load(ROOT / "data/processed/stage4/profile-overhead.json")
    rt = profile_samples(stage4, "rt")
    loaded_paths = sorted(p for p in manifest if "perf-loaded" in p)
    runs = kernel_runs([ROOT / p for p in loaded_paths])
    linux = [value for run in runs for value in run]
    tuned = profile_samples(
        load(ROOT / "data/processed/stage11/stage11-evaluation-01/tuned-linux-loaded.json"),
        "linux",
    )
    for relative in manifest:
        sources.add(ROOT / relative)
    config = report["configuration"]
    boundary = int(config["cross_domain_edge_cost_ns"])
    observations = int(config["observations_per_cell"])
    deadline = int(report["flagship"]["results"][0]["deadline_ns"])
    switch = int(report["flagship"]["recovery_switch_observation"])
    if [node["linux_only"] for node in app["nodes"]] != [False] * 4:
        raise SystemExit("flagship graph is no longer an all-eligible four-node chain")

    audited = {row["baseline"]: row for row in report["flagship"]["results"]}
    order = config["baseline_order"]
    replayed = {}
    for baseline in order:
        values = replay(app, baseline, linux, rt, tuned, boundary, observations, seed, switch)
        row = audited[baseline]
        misses = sum(value > deadline for value in values)
        checks = (
            (percentile(values, 95), row["p95_ns"]),
            (percentile(values, 99), row["p99_ns"]),
            (statistics.fmean(values), row["mean_ns"]),
            (max(values), row["maximum_ns"]),
            (misses, row["misses"]),
        )
        if not all(math.isclose(a, b, rel_tol=1e-12) for a, b in checks):
            raise SystemExit(f"replay of {baseline} does not reproduce the audited summary")
        replayed[baseline] = values

    # The replay draws every node sample independently, so replay observations are i.i.d.
    # given the trace pools (checked below), except for the deterministic regime switch in
    # qfabric-recovery, which is resampled within its pre- and post-switch strata.
    replay_lag1 = {b: lag_autocorrelation(v, 1) for b, v in replayed.items() if len(set(v)) > 1}
    replay_ci = {}
    for baseline in order:
        # Re-seeding per baseline keeps resample indices paired across baselines.
        rng = random.Random(BOOTSTRAP_SEED)
        values = replayed[baseline]
        strata = [values[:switch], values[switch:]] if baseline == "qfabric-recovery" else [values]
        p95s, misses = [], []
        for _ in range(RESAMPLES):
            sample = [x for stratum in strata for x in rng.choices(stratum, k=len(stratum))]
            sample.sort()
            p95s.append(sorted_percentile(sample, 95))
            misses.append(sum(1 for x in sample if x > deadline) / len(sample) * 100)
        replay_ci[baseline] = (interval(p95s), interval(misses))

    # Trace-level bootstrap: the measured traces are time-ordered and autocorrelated, so they
    # are resampled with a circular block bootstrap (within each loaded run), then replayed.
    pools = {f"linux-loaded-run{i + 1}": run for i, run in enumerate(runs)}
    pools["tuned-linux-loaded"] = tuned
    pools["rt-idle"] = rt
    blocks = {name: block_length(values) for name, values in pools.items()}
    lag1 = {name: lag_autocorrelation(values, 1) for name, values in pools.items()}
    trace_rng = random.Random(BOOTSTRAP_SEED + 1)
    stats: dict[str, tuple[list[float], list[float]]] = {b: ([], []) for b in order}
    manual = list(app["manual_expert"])
    improvement: list[float] = []
    for _ in range(RESAMPLES):
        linux_star = [
            x
            for i, run in enumerate(runs)
            for x in circular_block_resample(trace_rng, run, blocks[f"linux-loaded-run{i + 1}"])
        ]
        tuned_star = circular_block_resample(trace_rng, tuned, blocks["tuned-linux-loaded"])
        rt_star = circular_block_resample(trace_rng, rt, blocks["rt-idle"])
        cells = fast_replay(
            trace_rng, linux_star, rt_star, tuned_star, manual, boundary, observations, switch
        )
        for baseline, values in cells.items():
            ordered = sorted(values)
            stats[baseline][0].append(sorted_percentile(ordered, 95))
            stats[baseline][1].append(sum(1 for x in ordered if x > deadline) / observations * 100)
        ordinary_p95 = stats["ordinary-linux"][0][-1]
        improvement.append((ordinary_p95 - stats["qfabric-recovery"][0][-1]) / ordinary_p95 * 100)
    improvement_ci = interval(improvement)
    trace_ci = {b: (interval(p), interval(m)) for b, (p, m) in stats.items()}

    structural_zero = {
        "tuned-linux": 4 * max(tuned) <= deadline,
        "static-mcu-first": 4 * max(rt) <= deadline,
        "offline-oracle": 4 * max(rt) <= deadline,
    }

    with (OUT / "flagship-ci.dat").open("w", encoding="utf-8") as handle:
        handle.write(
            "baseline p95_ms p95_lo_ms p95_hi_ms p95_err_minus p95_err_plus "
            "miss_rate_pct miss_lo_pct miss_hi_pct miss_err_minus miss_err_plus "
            "replay_p95_lo_ms replay_p95_hi_ms replay_miss_lo_pct replay_miss_hi_pct\n"
        )
        for baseline in order:
            row = audited[baseline]
            p95 = ms(row["p95_ns"])
            miss = row["miss_rate_pct"]
            (plo, phi), (mlo, mhi) = trace_ci[baseline]
            (rplo, rphi), (rmlo, rmhi) = replay_ci[baseline]
            handle.write(
                f"{baseline} {p95:.6f} {ms(plo):.6f} {ms(phi):.6f} "
                f"{p95 - ms(plo):.6f} {ms(phi) - p95:.6f} "
                f"{miss:.6f} {mlo:.6f} {mhi:.6f} {miss - mlo:.6f} {mhi - miss:.6f} "
                f"{ms(rplo):.6f} {ms(rphi):.6f} {rmlo:.6f} {rmhi:.6f}\n"
            )

    names = {
        "ordinary-linux": "OrdinaryLinux",
        "tuned-linux": "TunedLinux",
        "static-mcu-first": "McuFirst",
        "manual-expert": "ManualExpert",
        "qfabric-static": "QfabricStatic",
        "qfabric-recovery": "Recovery",
        "offline-oracle": "Oracle",
    }
    lines = [
        macro("FlagCiResamples", f"{RESAMPLES:,}".replace(",", "{,}")),
        macro("FlagCiLevel", f"{CONFIDENCE * 100:.0f}\\%"),
        macro("FlagCiSeed", BOOTSTRAP_SEED),
        macro("FlagCiLinuxBlockMin", min(v for k, v in blocks.items() if k.startswith("linux"))),
        macro("FlagCiLinuxBlockMax", max(v for k, v in blocks.items() if k.startswith("linux"))),
        macro("FlagCiTunedBlock", blocks["tuned-linux-loaded"]),
        macro("FlagCiRtBlock", blocks["rt-idle"]),
        macro("FlagCiImprovementLo", f"{improvement_ci[0]:.1f}\\%"),
        macro("FlagCiImprovementHi", f"{improvement_ci[1]:.1f}\\%"),
    ]
    for baseline in order:
        name = names[baseline]
        (plo, phi), (mlo, mhi) = trace_ci[baseline]
        (rplo, rphi), (rmlo, rmhi) = replay_ci[baseline]
        lines += [
            macro(f"FlagCi{name}PLo", f"{ms(plo):.2f}"),
            macro(f"FlagCi{name}PHi", f"{ms(phi):.2f}"),
            macro(f"FlagCi{name}MissLo", f"{mlo:.1f}\\%"),
            macro(f"FlagCi{name}MissHi", f"{mhi:.1f}\\%"),
            macro(f"FlagCiReplay{name}PLo", f"{ms(rplo):.2f}"),
            macro(f"FlagCiReplay{name}PHi", f"{ms(rphi):.2f}"),
            macro(f"FlagCiReplay{name}MissLo", f"{rmlo:.1f}\\%"),
            macro(f"FlagCiReplay{name}MissHi", f"{rmhi:.1f}\\%"),
        ]
    (OUT / "flagship-ci.tex").write_text("".join(lines), encoding="utf-8")

    details = {
        "method": {
            "primary": (
                "two-level percentile bootstrap: circular block bootstrap of each measured "
                "source trace (loaded Linux resampled within each of its three runs), followed "
                "by a fresh i.i.d. replay of the observation count with common draws across "
                "baselines"
            ),
            "secondary": (
                "replay-level percentile bootstrap of the audited per-observation replay "
                "values; i.i.d. except qfabric-recovery, resampled within pre- and "
                "post-switch strata; captures Monte Carlo replay error only"
            ),
            "block_length_rule": (
                "first lag whose sample autocorrelation lies within +/-2/sqrt(n) of zero"
            ),
            "resamples": RESAMPLES,
            "confidence": CONFIDENCE,
            "seed": BOOTSTRAP_SEED,
        },
        "block_lengths": blocks,
        "trace_lag1_autocorrelation": lag1,
        "replay_lag1_autocorrelation": replay_lag1,
        "structural_zero_miss": structural_zero,
        "recovery_p95_improvement_pct_ci": list(improvement_ci),
        "trace_sizes": {name: len(values) for name, values in pools.items()},
        "intervals": {
            baseline: {
                "p95_ms": ms(audited[baseline]["p95_ns"]),
                "trace_p95_ms": [ms(v) for v in trace_ci[baseline][0]],
                "replay_p95_ms": [ms(v) for v in replay_ci[baseline][0]],
                "miss_rate_pct": audited[baseline]["miss_rate_pct"],
                "trace_miss_pct": list(trace_ci[baseline][1]),
                "replay_miss_pct": list(replay_ci[baseline][1]),
            }
            for baseline in order
        },
    }
    return details


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sources: set[Path] = set()
    text, headline = interconnect(sources)
    (OUT / "interconnect-metrics.tex").write_text(text, encoding="utf-8")
    ci = flagship_ci(sources)
    manifest = {
        "schema_version": 1,
        "generator": "scripts/generate-interconnect-assets.py",
        "sources": {str(path.relative_to(ROOT)): sha256(path) for path in sorted(sources)},
        "outputs": [
            "interconnect-payload.dat",
            "interconnect-concurrency.dat",
            "interconnect-metrics.tex",
            "flagship-ci.dat",
            "flagship-ci.tex",
        ],
        "interconnect": headline,
        "flagship_ci": ci,
    }
    (OUT / "interconnect-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()

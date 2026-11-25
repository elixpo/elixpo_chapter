#!/usr/bin/env python3
"""Generate manuscript assets from the Stage 12 matched-load campaign."""

from __future__ import annotations

import hashlib
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from qfabric import stage12  # noqa: E402
from qfabric.profiling import percentile  # noqa: E402

CAMPAIGN = ROOT / "data/processed/stage12/stage12-kernels-01"
OUTPUT = ROOT / "paper/generated"
RESAMPLES = 2000
BLOCK = 50
SEED = 20261028
LOAD_LABEL = {"idle": "Idle", "cpu": "CPU load", "rt-contention": "RT contention"}
SHORT_LOAD_LABEL = {"idle": "Idle", "cpu": "CPU", "rt-contention": "RT"}
WORKLOAD_LABEL = {
    "add": "add",
    "crc32": "CRC-32",
    "fir-x1": "FIR$\\times$1",
    "fir-x64": "FIR$\\times$64",
    "fir-x512": "FIR$\\times$512",
}
OUTCOME_LABEL = {
    "rolled-back": "rolled back",
    "probation": "open at end",
    "committed": "committed",
}
BASELINE_LABEL = {
    "ordinary-linux": "Ordinary Linux",
    "tuned-linux": "Tuned Linux",
    "static-mcu-first": "MCU-first",
    "manual-expert": "Manual expert",
    "qfabric-static": "\\system static",
    "qfabric-recovery": "\\system recovery",
    "qfabric-recovery-tuned": "\\system recovery (tuned)",
    "offline-oracle": "Offline oracle",
}


def macro(name: str, value: object) -> str:
    return rf"\newcommand{{\{name}}}{{{value}}}" + "\n"


def ms(value: float, digits: int = 2) -> str:
    return f"{value / 1e6:.{digits}f}"


def block_bootstrap_p95(values: list[int], rng: random.Random) -> tuple[float, float]:
    """Circular block bootstrap preserving short-range autocorrelation."""
    n = len(values)
    estimates = []
    for _ in range(RESAMPLES):
        sample: list[int] = []
        while len(sample) < n:
            start = rng.randrange(n)
            sample.extend(values[(start + offset) % n] for offset in range(BLOCK))
        estimates.append(percentile(sample[:n], 95))
    estimates.sort()
    return estimates[int(0.025 * RESAMPLES)], estimates[int(0.975 * RESAMPLES) - 1]


def local_median(load: str, domain: str, workload: str) -> float:
    report = json.loads((CAMPAIGN / f"{load}-other-{domain}.json").read_text("utf-8"))
    entry = next(item for item in report["workloads"] if item["workload"] == workload)
    return entry["local_execution"]["p50_ns"]


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    workloads = [stage12.workload_name(task, passes) for task, passes in stage12.WORKLOADS]
    evaluation = stage12.evaluate_stage12(CAMPAIGN)
    rows = {(r["workload"], r["load"], r["baseline"]): r for r in evaluation["results"]}

    # Per-call table: ordinary-caller p95 with 95% block-bootstrap CI (single column).
    lines = [
        "\\begin{tabular}{llrr}",
        "\\toprule",
        "Load & Workload & Linux p95 [95\\% CI] & MCU p95 [95\\% CI] \\\\",
        "\\midrule",
    ]
    dat = [
        "workload "
        + " ".join(
            f"{load.replace('-', '')}_{d}" for load in stage12.LOADS for d in ("linux", "rt")
        )
    ]
    traces = {}
    for load in stage12.LOADS:
        for policy in stage12.POLICIES:
            for domain in ("linux", "rt"):
                for workload in workloads:
                    traces[load, policy, domain, workload] = stage12._trace(
                        CAMPAIGN, load, policy, domain, workload
                    )
    for load_index, load in enumerate(stage12.LOADS):
        if load_index:
            lines.append("\\midrule")
        for index, workload in enumerate(workloads):
            cells = []
            for domain in ("linux", "rt"):
                ordinary = traces[load, "other", domain, workload]
                low, high = block_bootstrap_p95(ordinary, rng)
                cells.append(f"{ms(percentile(ordinary, 95))} [{ms(low)}, {ms(high)}]")
            label = SHORT_LOAD_LABEL[load] if index == 0 else ""
            lines.append(f"{label} & {WORKLOAD_LABEL[workload]} & " + " & ".join(cells) + " \\\\")
    lines += ["\\bottomrule", "\\end{tabular}"]
    (OUTPUT / "stage12-percall-table.tex").write_text("\n".join(lines) + "\n", "utf-8")

    for workload in workloads:
        dat.append(
            workload
            + " "
            + " ".join(
                ms(percentile(traces[load, "other", domain, workload], 95), 4)
                for load in stage12.LOADS
                for domain in ("linux", "rt")
            )
        )
    (OUTPUT / "stage12-percall.dat").write_text("\n".join(dat) + "\n", "utf-8")

    # Cost decomposition at idle: local compute versus everything else.
    decomposition = [
        "\\begin{tabular}{lrrrr}",
        "\\toprule",
        " & \\multicolumn{2}{c}{Compute p50 ($\\mu$s)}"
        " & \\multicolumn{2}{c}{Residual p50 (ms)} \\\\",
        "\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}",
        "Workload & Linux & MCU & Linux & MCU \\\\",
        "\\midrule",
    ]
    ratios = {}
    for workload in workloads:
        compute = {d: local_median("idle", d, workload) for d in ("linux", "rt")}
        end_to_end = {
            d: percentile(traces["idle", "other", d, workload], 50) for d in ("linux", "rt")
        }
        ratios[workload] = compute["rt"] / max(compute["linux"], 1)
        decomposition.append(
            f"{WORKLOAD_LABEL[workload]} & {compute['linux'] / 1e3:.1f} & "
            f"{compute['rt'] / 1e3:.1f} & {ms(end_to_end['linux'] - compute['linux'], 3)} & "
            f"{ms(end_to_end['rt'] - compute['rt'], 2)} \\\\"
        )
    decomposition += ["\\bottomrule", "\\end{tabular}"]
    (OUTPUT / "stage12-decomposition-table.tex").write_text(
        "\n".join(decomposition) + "\n", "utf-8"
    )

    # Four-node chain results.
    chain = [
        "\\begin{tabular}{llrrrrrr}",
        "\\toprule",
        " & & & \\multicolumn{2}{c}{Ordinary Linux} & \\multicolumn{2}{c}{Tuned Linux}"
        " & MCU-first \\\\",
        "\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}\\cmidrule(lr){8-8}",
        "Load & Workload & $D_G$ & p95 & miss (\\%) & p95 & miss (\\%) & p95 \\\\",
        "\\midrule",
    ]
    switches = 0
    for load_index, load in enumerate(stage12.LOADS):
        if load_index:
            chain.append("\\midrule")
        for index, workload in enumerate(workloads):
            ordinary = rows[workload, load, "ordinary-linux"]
            tuned = rows[workload, load, "tuned-linux"]
            mcu = rows[workload, load, "static-mcu-first"]
            outcomes = {
                rows[workload, load, b]["recovery"]["outcome"]
                for b in ("qfabric-recovery", "qfabric-recovery-tuned")
            }
            switches += sum(
                rows[workload, load, b]["recovery"]["switch_window"] is not None
                for b in ("qfabric-recovery", "qfabric-recovery-tuned")
            )
            if outcomes != {"none"}:
                raise RuntimeError(f"recovery switched for {workload} under {load}: {outcomes}")
            label = SHORT_LOAD_LABEL[load] if index == 0 else ""
            chain.append(
                f"{label} & {WORKLOAD_LABEL[workload]} & {ms(ordinary['graph_deadline_ns'], 0)} & "
                f"{ms(ordinary['p95_ns'])} & {ordinary['miss_rate_pct']:.1f} & "
                f"{ms(tuned['p95_ns'])} & {tuned['miss_rate_pct']:.1f} & "
                f"{ms(mcu['p95_ns'], 1)} \\\\"
            )
    chain += ["\\bottomrule", "\\end{tabular}"]
    (OUTPUT / "stage12-chain-table.tex").write_text("\n".join(chain) + "\n", "utf-8")

    # Hysteresis ablation: switch on the first violating window.
    original_windows = stage12.VIOLATION_WINDOWS
    stage12.VIOLATION_WINDOWS = 1
    ablation_report = stage12.evaluate_stage12(CAMPAIGN)
    stage12.VIOLATION_WINDOWS = original_windows
    ablation = [
        "\\begin{tabular}{llrrrl}",
        "\\toprule",
        "Workload & Caller & Win. & p95 (ms) & Miss (\\%) & Outcome \\\\",
        "\\midrule",
    ]
    ablated_switches = 0
    rollbacks = 0
    worst_ratio = 0.0
    for row in ablation_report["results"]:
        if row["baseline"] not in {"qfabric-recovery", "qfabric-recovery-tuned"}:
            continue
        events = row["recovery"]
        if events["switch_window"] is None:
            continue
        ablated_switches += 1
        rollbacks += events["outcome"] == "rolled-back"
        base = rows[row["workload"], row["load"], row["baseline"]]
        worst_ratio = max(worst_ratio, row["p95_ns"] / base["p95_ns"])
        caller = "FIFO" if row["baseline"].endswith("tuned") else "ordinary"
        ablation.append(
            f"{WORKLOAD_LABEL[row['workload']]} & {caller} & {events['switch_window']} & "
            f"{ms(base['p95_ns'])}$\\rightarrow${ms(row['p95_ns'])} & "
            f"{base['miss_rate_pct']:.1f}$\\rightarrow${row['miss_rate_pct']:.1f} & "
            f"{OUTCOME_LABEL[events['outcome']]} \\\\"
        )
    ablation += ["\\bottomrule", "\\end{tabular}"]
    (OUTPUT / "stage12-ablation-table.tex").write_text("\n".join(ablation) + "\n", "utf-8")

    cells = len(workloads) * len(stage12.LOADS) * 2
    contention_rt_p99 = max(
        percentile(traces["rt-contention", "other", "rt", w], 99) for w in workloads
    )
    contention_linux_p99 = max(
        percentile(traces["rt-contention", "other", "linux", w], 99) for w in workloads
    )
    idle_rt_add = percentile(traces["idle", "other", "rt", "add"], 95)
    idle_linux_add = percentile(traces["idle", "other", "linux", "add"], 95)
    deadlines = evaluation["deadlines"]
    worst_linux_chain = max(
        rows[w, load, "ordinary-linux"]["p95_ns"] for w in workloads for load in stage12.LOADS
    )
    worst_linux_miss = max(
        rows[w, load, b]["miss_rate_pct"]
        for w in workloads
        for load in stage12.LOADS
        for b in ("ordinary-linux", "tuned-linux")
    )
    metrics = "".join(
        [
            macro("StageTwelveIterations", 2000),
            macro("StageTwelveWarmup", 100),
            macro("StageTwelveChainObservations", evaluation["observations"]),
            macro("StageTwelveCells", cells),
            macro("StageTwelveSwitches", switches),
            macro("StageTwelveAblatedSwitches", ablated_switches),
            macro("StageTwelveAblatedRollbacks", rollbacks),
            macro("StageTwelveAblationWorstRatio", f"{worst_ratio:.0f}"),
            macro("StageTwelveIdleRtAddP", ms(idle_rt_add)),
            macro("StageTwelveIdleLinuxAddP", ms(idle_linux_add, 3)),
            macro("StageTwelveIdleRatio", f"{idle_rt_add / idle_linux_add:.0f}"),
            macro("StageTwelveFirComputeRatio", f"{ratios['fir-x512']:.0f}"),
            macro("StageTwelveContentionRtPNinetyNine", ms(contention_rt_p99, 0)),
            macro("StageTwelveContentionLinuxPNinetyNine", ms(contention_linux_p99, 1)),
            macro("StageTwelveWorstLinuxChainP", ms(worst_linux_chain, 1)),
            macro("StageTwelveWorstLinuxMiss", f"{worst_linux_miss:.1f}\\%"),
            macro(
                "StageTwelveMinNodeDeadline",
                ms(min(d["per_node_deadline_ns"] for d in deadlines.values()), 0),
            ),
            macro(
                "StageTwelveMaxNodeDeadline",
                ms(max(d["per_node_deadline_ns"] for d in deadlines.values()), 0),
            ),
            macro("StageTwelveBootstrapResamples", f"{RESAMPLES:,}"),
            macro("StageTwelveBootstrapBlock", BLOCK),
        ]
    )
    (OUTPUT / "stage12-metrics.tex").write_text(metrics, "utf-8")

    digest = hashlib.sha256()
    for path in sorted(CAMPAIGN.glob("*.json")):
        if path.name != "evaluation.json":
            digest.update(path.read_bytes())
    (OUTPUT / "stage12-manifest.json").write_text(
        json.dumps(
            {
                "campaign": str(CAMPAIGN.relative_to(ROOT)),
                "inputs_sha256": digest.hexdigest(),
                "bootstrap": {"resamples": RESAMPLES, "block": BLOCK, "seed": SEED},
                "chain_observations": evaluation["observations"],
            },
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    print(f"Stage 12 assets written to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

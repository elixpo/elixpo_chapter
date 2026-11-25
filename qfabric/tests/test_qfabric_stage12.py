import json
import shutil
import subprocess
import tempfile
import unittest
import zlib
from pathlib import Path

from qfabric import stage12

ROOT = Path(__file__).resolve().parents[1]


def _write_campaign(directory: Path, latency) -> None:
    for load in stage12.LOADS:
        for policy in stage12.POLICIES:
            for domain in ("linux", "rt"):
                workloads = []
                for task, passes in stage12.WORKLOADS:
                    samples = [
                        {
                            "outcome": "ok",
                            "end_to_end_ns": latency(load, policy, domain, index),
                        }
                        for index in range(400)
                    ]
                    workloads.append(
                        {"workload": stage12.workload_name(task, passes), "samples": samples}
                    )
                (directory / f"{load}-{policy}-{domain}.json").write_text(
                    json.dumps({"workloads": workloads}), encoding="utf-8"
                )


class QFabricStage12Tests(unittest.TestCase):
    def test_reference_crc32_matches_zlib(self):
        block = stage12.make_block(3, 9)
        self.assertEqual(stage12.reference_crc32(block), zlib.crc32(block))

    def test_blocks_are_deterministic_and_bounded(self):
        self.assertEqual(stage12.make_block(1, 2), stage12.make_block(1, 2))
        self.assertNotEqual(stage12.make_block(1, 2), stage12.make_block(1, 3))
        self.assertEqual(len(stage12.make_block(1, 2)), stage12.BLOCK_BYTES)

    def test_fir_passes_perturb_result_and_unknown_task_is_rejected(self):
        block = stage12.make_block(5, 1)
        self.assertNotEqual(
            stage12.reference_result("fir", 2, block), stage12.reference_result("fir", 1, block)
        )
        with self.assertRaises(ValueError):
            stage12.reference_result("unknown", 1, block)

    @unittest.skipIf(shutil.which("g++") is None, "host C++ compiler unavailable")
    def test_linux_executor_matches_python_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "qf-stage12-host"
            subprocess.run(
                [
                    "g++",
                    "-std=c++20",
                    "-O2",
                    str(ROOT / "runtime/stage12/linux/qf_stage12_linux.cpp"),
                    "-o",
                    str(artifact),
                ],
                check=True,
            )
            executor = stage12.LinuxExecutor(artifact)
            try:
                for invocation_id, (task, passes) in enumerate(stage12.WORKLOADS, start=1):
                    block = stage12.make_block(11, invocation_id)
                    result, local_ns = executor.invoke(invocation_id, task, passes, block)
                    self.assertEqual(result, stage12.reference_result(task, passes, block))
                    self.assertGreaterEqual(local_ns, 0)
            finally:
                executor.close()

    def test_deadline_uses_slower_idle_domain(self):
        with tempfile.TemporaryDirectory() as directory:
            campaign = Path(directory)
            _write_campaign(
                campaign,
                lambda load, policy, domain, index: 1_000_000 if domain == "linux" else 8_000_000,
            )
            deadline = stage12.derive_stage12_deadline(campaign, "add")
            self.assertEqual(deadline["per_node_deadline_ns"], 10_000_000)
            self.assertEqual(deadline["graph_deadline_ns"], 40_000_000)

    def test_recovery_commits_when_rt_alternate_holds(self):
        def latency(load, policy, domain, index):
            if domain == "rt":
                return 8_000_000
            return 30_000_000 if load == "rt-contention" else 1_000_000

        with tempfile.TemporaryDirectory() as directory:
            campaign = Path(directory)
            _write_campaign(campaign, latency)
            report = stage12.evaluate_stage12(campaign, observations=300)
        rows = {(row["workload"], row["load"], row["baseline"]): row for row in report["results"]}
        recovery = rows[("add", "rt-contention", "qfabric-recovery-tuned")]
        self.assertEqual(recovery["recovery"]["outcome"], "committed")
        self.assertEqual(recovery["recovery"]["switch_window"], stage12.VIOLATION_WINDOWS)
        self.assertEqual(rows[("add", "rt-contention", "tuned-linux")]["miss_rate_pct"], 100.0)
        self.assertLess(recovery["miss_rate_pct"], 25.0)
        self.assertEqual(rows[("add", "idle", "qfabric-recovery")]["recovery"]["outcome"], "none")

    def test_recovery_rolls_back_when_rt_alternate_also_misses(self):
        def latency(load, policy, domain, index):
            if load != "rt-contention":
                return 8_000_000 if domain == "rt" else 1_000_000
            return 30_000_000 if domain == "linux" or index >= 100 else 8_000_000

        with tempfile.TemporaryDirectory() as directory:
            campaign = Path(directory)
            _write_campaign(campaign, latency)
            report = stage12.evaluate_stage12(campaign, observations=300)
        recovery = next(
            row
            for row in report["results"]
            if row["workload"] == "add"
            and row["load"] == "rt-contention"
            and row["baseline"] == "qfabric-recovery"
        )
        self.assertEqual(recovery["recovery"]["outcome"], "rolled-back")


if __name__ == "__main__":
    unittest.main()

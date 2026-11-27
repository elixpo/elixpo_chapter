"""Tests for the Falera Badge flash layout."""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLASH_SIZE = 16 * 1024 * 1024
MMAP_PAGE = 0x10000


def partitions():
    csv = ROOT / "firmware" / "boards" / "OREO_BADGE" / "partitions-oreo-badge.csv"
    rows = []
    for line in csv.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            name, kind, subtype, offset, size = [f.strip() for f in line.split(",")][:5]
            rows.append((name, kind, subtype, int(offset, 0), int(size, 0)))
    return rows


def by_name():
    return {name: (off, size) for name, _, _, off, size in partitions()}


class PartitionTest(unittest.TestCase):
    def test_layout_is_contiguous_and_fills_flash(self):
        rows = partitions()
        for (_, _, _, off, size), (_, _, _, nxt, _) in zip(rows, rows[1:]):
            self.assertEqual(off + size, nxt)
        _, _, _, off, size = rows[-1]
        self.assertEqual(off + size, FLASH_SIZE)

    def test_firmware_is_mmap_aligned(self):
        # The app partition must start on a 64 KiB MMU page.
        off, size = by_name()["factory"]
        self.assertEqual(off % MMAP_PAGE, 0)
        self.assertEqual(size % MMAP_PAGE, 0)

    def test_filesystem_follows_firmware_to_end_of_flash(self):
        # MicroPython finds its filesystem by the "vfs" label; it takes
        # everything after the firmware.
        parts = by_name()
        self.assertIn("vfs", parts)
        f_off, f_size = parts["factory"]
        v_off, v_size = parts["vfs"]
        self.assertEqual(v_off, f_off + f_size)
        self.assertEqual(v_off + v_size, FLASH_SIZE)
        self.assertEqual(partitions()[-1][0], "vfs")

    def test_only_firmware_and_filesystem_partitions(self):
        # No data partitions sit between the firmware and the filesystem.
        self.assertEqual(set(by_name()), {"nvs", "phy_init", "factory", "vfs"})


if __name__ == "__main__":
    unittest.main()

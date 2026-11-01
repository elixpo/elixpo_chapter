#!/usr/bin/env python3
"""Run the host test binary and compare every frame with Python's zlib."""
import struct
import subprocess
import sys
import zlib


def fnv1a(data):
    h = 2166136261
    for b in data:
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h


def main():
    binary, path = sys.argv[1], sys.argv[2]
    data = open(path, "rb").read()
    count = struct.unpack_from("<H", data, 10)[0]
    expected, offset = [], 12
    for _ in range(count):
        size = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        expected.append(fnv1a(zlib.decompress(data[offset:offset + size])))
        offset += size
    out = subprocess.run([binary, path], capture_output=True, text=True)
    sys.stderr.write(out.stderr)
    got = [int(line.split()[2], 16) for line in out.stdout.splitlines()
           if line.startswith("frame ")]
    if out.returncode != 0 or got != expected:
        mismatched = sum(a != b for a, b in zip(got, expected))
        sys.exit(f"host test failed: rc={out.returncode}, {len(got)}/{count} "
                 f"frames, {mismatched} mismatched")
    print(f"{count} frames match zlib")
    print("\n".join(l for l in out.stdout.splitlines() if not l.startswith("frame ")))


if __name__ == "__main__":
    main()

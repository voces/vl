#!/usr/bin/env python3
"""Rank a `deno test` log by per-test and per-file duration.

    scripts/perf/per-test-rank.py <deno.log> [top]

Deno prints one line per test ending `... ok (123ms)`; under `--parallel` the
line is prefixed `./tests/x_test.ts => `. Both forms are parsed. The per-file
column is the SUM of its tests' durations, so it excludes the worker's own
startup + seed load — `per-file-time.sh` measures that separately.
"""
import collections
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")
PAR = re.compile(r"^\./(tests/\S+?) => (.*?) \.\.\. ")
SER = re.compile(r"^running \d+ tests? from \./(tests/\S+)")
DUR = re.compile(r"\((\d+(?:\.\d+)?)(µs|ms|s|m)\)\s*$")
MULT = {"µs": 1e-3, "ms": 1.0, "s": 1e3, "m": 6e4}


def main(argv: list[str]) -> int:
    top = int(argv[2]) if len(argv) > 2 else 25
    per_file: collections.Counter[str] = collections.Counter()
    counts: collections.Counter[str] = collections.Counter()
    tests: list[tuple[float, str, str]] = []
    cur = "?"
    for raw in open(argv[1], errors="replace"):
        line = ANSI.sub("", raw).rstrip("\n")
        s = SER.match(line)
        if s:
            cur = s.group(1)
            continue
        d = DUR.search(line)
        if not d or " ... " not in line:
            continue
        ms = float(d.group(1)) * MULT[d.group(2)]
        p = PAR.match(line)
        f, name = (p.group(1), p.group(2)) if p else (cur, line.split(" ... ")[0])
        per_file[f] += ms
        counts[f] += 1
        tests.append((ms, f, name.strip()))

    tot = sum(per_file.values())
    print(f"{len(tests)} tests in {len(per_file)} files, summed test time {tot / 1000:.1f}s")
    print(f"\n{'sec':>8} {'n':>5} {'%':>6}  file")
    for f, ms in per_file.most_common(top):
        print(f"{ms / 1000:8.2f} {counts[f]:5d} {100 * ms / tot:5.1f}%  {f}")
    print(f"\n{'sec':>8}  file :: test")
    for ms, f, name in sorted(tests, reverse=True)[:top]:
        print(f"{ms / 1000:8.2f}  {f.split('/')[-1]} :: {name[:90]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

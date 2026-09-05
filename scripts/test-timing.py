#!/usr/bin/env python3
"""Grade Deno per-test times against a per-PURPOSE budget.

    python3 scripts/test-timing.py <log> [<log> ...]        # grade
    python3 scripts/test-timing.py --dist <log>             # distribution only
    python3 scripts/test-timing.py --json <log>             # machine output

A log is either a local `deno test` capture or `gh run view <id> --log`. Both
shapes are read: `--parallel` prints `<file> => <name> ... ok (Nms)`, a serial run
prints `running N tests from <file>` and then bare `<name> ... ok (Nms)`.

WHAT A PER-TEST NUMBER MEANS, AND WHEN IT MEANS NOTHING. Deno reports each test's
WALL time in its worker. In a `--parallel` step that saturates the box, that wall
is the SCHEDULE, not the test: `selfhost_native_diag_code_test.ts` reads 171-938 ms
per test on CI, 107-339 ms in the same parallel shape pinned to 4 CPUs, and 11-38 ms
run alone -- while its whole-file cost is 0.58 CPU-seconds. So a budget is only
meaningful against a stated CONDITION, and `--condition` names it. `alone` is the
only condition in which a per-test reading is the test's own work; the others carry
a measured divisor so one budget can be quoted everywhere.

Deno also ROUNDS at one second (`(1s)`, `(30s)`), so anything at or above 1000 ms
is quantised to whole seconds and a spread inside that band is not readable.

PURPOSES are declared by the test FILE, in a `// @test-timing <purpose>` line in its
first 60 lines. Undeclared files are `unit`. See `docs/internals/test-timing-2026-09.md`.
"""

import argparse
import collections
import json
import os
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")
STAMP = re.compile(r"^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ")
PARALLEL = re.compile(r"^(?P<file>\.?/?tests/[^ ]+\.ts) => (?P<name>.*?) \.\.\.(?P<rest>.*)$")
RUNNING = re.compile(r"^running \d+ tests? from (?P<file>\S+)$")
SERIAL = re.compile(r"^(?P<name>.*?) \.\.\.(?P<rest>.*)$")
RESULT = re.compile(r"(?P<status>ok|ignored|FAILED)\s+\((?P<v>[\d.]+)(?P<u>ms|s|µs|us)\)")
UNIT = {"ms": 1.0, "s": 1000.0, "µs": 0.001, "us": 0.001}

TAG = re.compile(
    r"^\s*//\s*@test-timing\s+(?P<purpose>[a-z]+)"
    r"(?:\s+n=(?P<n>\d+))?"
    r'(?:\s+name~"(?P<name>[^"]+)")?\s*$'
)

# Budgets in milliseconds, stated for CONDITION `alone` (one file, serially, on an
# unloaded box). Derived in docs/internals/test-timing-2026-09.md:
#   unit    an in-process call on a seed instance the file already holds. The whole
#           `diag-code` file runs 20 such tests in 0.37 s wall, none over 38 ms.
#   native  one `vl` spawn. The measured floor is 11 ms (`vl check` on a 1-line
#           program, warm `.cwasm`); 39 ms once the program imports std. 300 ms
#           leaves room for a handful of spawns on top of that floor.
#   opt     a `-O3` arm, which shells `wasm-opt` and is then read back with
#           `wasm-dis`: 40 ms + 155 ms measured, and a shape test compares three
#           arms. 1200 ms is three arms with room to run each.
#   sweep   exempt per test, because one test adjudicates N items; it must declare
#           `n=` and is graded on ms-per-item instead.
#   instrument  exempt: the runtime IS the measurement.
BUDGET = {"unit": 50.0, "native": 300.0, "opt": 1200.0, "sweep": None, "instrument": None}
SWEEP_PER_ITEM = 30.0  # ms per adjudicated item, for a `sweep` file

# How much a condition inflates a per-test reading over `alone`. MEDIAN of the
# per-test ratio over the ci-native file set, measured 2026-09-05 across 3,350
# tests (`docs/internals/test-timing-2026-09.md`, "Conditions"). The median and not
# the aggregate: one 30 s fixture skews the aggregate by 13%, and the divisor is
# meant to describe an ordinary test.
CONDITION = {
    "alone": 1.0,
    "local-parallel": 1.5,
    "local-4core": 1.4,
    "ci": 3.6,
}


def strip(line):
    body = ANSI.sub("", line.rstrip("\n"))
    parts = body.split("\t")
    job = step = None
    if len(parts) >= 3 and not parts[0].startswith(("running", "./tests", "tests")):
        job, step, body = parts[0], parts[1], "\t".join(parts[2:])
    return job, step, STAMP.sub("", body).strip()


def parse(path):
    """Every `ok`/`ignored`/`FAILED` line in `path`, as (job, step, file, name, status, ms)."""
    rows, cur = [], {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            job, step, body = strip(line)
            key = (job, step)
            m = RUNNING.match(body)
            if m:
                cur[key] = m.group("file").lstrip("./")
                continue
            m = PARALLEL.match(body)
            if m:
                f, name, rest = m.group("file").lstrip("./"), m.group("name"), m.group("rest")
            else:
                m = SERIAL.match(body)
                if not m or key not in cur:
                    continue
                f, name, rest = cur[key], m.group("name"), m.group("rest")
            r = RESULT.search(rest)
            if not r:
                continue
            rows.append((job, step, f, name, r.group("status"),
                         float(r.group("v")) * UNIT[r.group("u")]))
    return rows


def purposes(root):
    """Each test file's declared purposes, from its `// @test-timing` tags.

    A file may carry several. One with no `name~` sets the file's purpose; one WITH
    a `name~"substring"` applies to matching test names only, so a file that is
    mostly ordinary but holds one instrument test can say exactly that instead of
    exempting itself wholesale.
    """
    out = collections.defaultdict(list)
    tests = os.path.join(root, "tests")
    if not os.path.isdir(tests):
        return out
    for name in sorted(os.listdir(tests)):
        if not name.endswith("_test.ts"):
            continue
        with open(os.path.join(tests, name), encoding="utf-8", errors="replace") as fh:
            for i, line in enumerate(fh):
                if i >= 60:
                    break
                m = TAG.match(line)
                if m:
                    out["tests/" + name].append((
                        m.group("purpose"),
                        int(m.group("n")) if m.group("n") else None,
                        m.group("name"),
                    ))
    return out


def purpose_of(decl, f, name):
    """The purpose that governs one test: the most specific matching tag, else `unit`."""
    tags = decl.get(f, [])
    for purpose, n, sub in tags:
        if sub and sub in name:
            return purpose, n
    for purpose, n, sub in tags:
        if not sub:
            return purpose, n
    return "unit", None


def detect(rows):
    """The measurement condition a log was taken in, from its own shape.

    A `gh run view --log` capture carries a job column, so it is CI. Anything else
    is local, and local cannot be told apart from its text -- a serial single-file
    run and a `--parallel` sweep print the same lines once the shapes are merged.
    `local-parallel` is the safe default because it is the cheaper mistake: it
    under-divides, so a test is reported as an offender rather than hidden.
    """
    if any(j in ("ci", "ci-native", "ci-embed-seed") for j, _, _, _, _, _ in rows):
        return "ci"
    return "local-parallel"


def band_table(oks):
    total = sum(r[5] for r in oks) or 1.0
    bands = [(0, 100), (100, 500), (500, 2000), (2000, float("inf"))]
    lines = ["  %-18s %6s %12s %8s" % ("band (ms)", "n", "sum (ms)", "share")]
    for lo, hi in bands:
        sel = [r for r in oks if lo <= r[5] < hi]
        s = sum(r[5] for r in sel)
        label = "[%d, %s)" % (lo, "inf" if hi == float("inf") else int(hi))
        lines.append("  %-18s %6d %12.0f %7.1f%%" % (label, len(sel), s, 100 * s / total))
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("logs", nargs="+")
    ap.add_argument("--condition", choices=sorted(CONDITION), default=None,
                    help="measurement condition (default: detected from the log)")
    ap.add_argument("--dist", action="store_true", help="distribution only, no grading")
    ap.add_argument("--json", action="store_true", help="machine output")
    ap.add_argument("--top", type=int, default=25, help="offenders to list (default 25)")
    ap.add_argument("--root", default=os.path.join(os.path.dirname(__file__), ".."))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    decl = purposes(root)
    rows = []
    for log in args.logs:
        rows.extend(parse(log))
    oks = [r for r in rows if r[4] == "ok"]
    if not oks:
        print("no per-test lines parsed from %s" % ", ".join(args.logs), file=sys.stderr)
        return 2

    condition = args.condition or detect(rows)
    divisor = CONDITION[condition]

    offenders = []
    sweeps = collections.defaultdict(float)
    sweep_n = {}
    for job, step, f, name, _, ms in oks:
        purpose, n = purpose_of(decl, f, name)
        own = ms / divisor
        if purpose == "sweep":
            sweeps[f] += own
            sweep_n[f] = n
            continue  # graded per item, below
        budget = BUDGET.get(purpose, BUDGET["unit"])
        if budget is not None and own > budget:
            offenders.append((own, ms, budget, purpose, f, name, job, step))
    offenders.sort(reverse=True)

    if args.json:
        print(json.dumps({
            "condition": condition, "divisor": divisor, "tests": len(oks),
            "offenders": [{"file": o[4], "name": o[5], "own_ms": round(o[0], 1),
                           "raw_ms": o[1], "budget_ms": o[2], "purpose": o[3]}
                          for o in offenders],
            "sweeps": {f: round(v, 1) for f, v in sorted(sweeps.items())},
        }, indent=2))
        return 1 if offenders else 0

    print("condition %s (per-test readings divided by %.1f to estimate the test's own work)"
          % (condition, divisor))
    print("%d tests graded, %d files declare a purpose\n" % (len(oks), len(decl)))
    print("distribution of the RAW per-test readings:")
    print(band_table(oks))
    ge = [r for r in oks if r[5] >= 100]
    print("\n  >= 100 ms: %d of %d tests (%.1f%%), %.1f s of %.1f s of per-test time"
          % (len(ge), len(oks), 100 * len(ge) / len(oks),
             sum(r[5] for r in ge) / 1000, sum(r[5] for r in oks) / 1000))

    if args.dist:
        return 0

    if sweeps:
        print("\nsweep files (exempt per test; one test adjudicates many items):")
        for f, v in sorted(sweeps.items(), key=lambda kv: -kv[1]):
            n = sweep_n.get(f)
            per = ("%.1f ms/item over %d" % (v / n, n)) if n else "no n= declared"
            flag = "  OVER" if n and v / n > SWEEP_PER_ITEM else ""
            print("  %-52s %8.0f ms  %s%s" % (f, v, per, flag))

    print("\n%d offenders (own-work estimate over budget):" % len(offenders))
    if not offenders:
        print("  none")
        return 0
    print("  %8s %8s %8s  %-10s %s" % ("own(ms)", "raw(ms)", "budget", "purpose", "test"))
    for own, ms, budget, purpose, f, name, _, _ in offenders[:args.top]:
        print("  %8.0f %8.0f %8.0f  %-10s %s => %s"
              % (own, ms, budget, purpose, f.replace("tests/", ""), name[:70]))
    if len(offenders) > args.top:
        print("  ... %d more" % (len(offenders) - args.top))
    return 1


if __name__ == "__main__":
    sys.exit(main())

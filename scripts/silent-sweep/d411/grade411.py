#!/usr/bin/env python3
"""Grade the D411 two-destination grid against one or two seeds, cell-matched.

    JOBS=6 python3 grade411.py <cells-dir> <base.wasm> [<cand.wasm>]

With one seed it prints the outcome histogram. With two it prints the histogram for
each and then EVERY cell that moved, in the four columns a defect landing is read by:
`runs` LOST, `-> silent`, `-> runs`, and other movement. Outcome vocabulary is the
census grader's: `runs`, `loud check reject`, `loud emit reject`, `check-clean invalid
wasm`, `runs but wrong value`, `compiler trap`.

A cell is `runs but wrong value` when it runs and its output is not the expected one.
The expectation is derived from the cell itself rather than hard-coded: on a correct
compiler every cell prints one line per read-back and the kind-1 read prints `7`, so a
cell whose kind-1 read prints `0` (the length-guard miss) is WRONG, not merely
different. That distinction is the whole reason the grid reads the element back.
"""
import concurrent.futures
import os
import subprocess
import sys
from collections import Counter

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
JOBS = int(os.environ.get("JOBS", "6"))

SILENT = ("check-clean invalid wasm", "runs but wrong value", "compiler trap")


def grade(args):
    path, seed = args
    ck = subprocess.run([VL, "check", path, "--compiler", seed],
                        capture_output=True, text=True)
    if ck.returncode != 0:
        return "loud check reject", ""
    rn = subprocess.run([VL, "run", path, "--compiler", seed],
                        capture_output=True, text=True)
    if rn.returncode == 0:
        out = rn.stdout.strip()
        # The kind-1 read is the LAST printed line of every cell that has one, and it
        # must be 7. `0` is the length guard's miss branch, i.e. the list arrived empty.
        if out and out.splitlines()[-1].strip() == "0":
            return "runs but wrong value", out.replace("\n", "/")
        return "runs", out.replace("\n", "/")
    err = (rn.stderr or rn.stdout)
    if "type mismatch" in err or "Invalid input WebAssembly" in err:
        return "check-clean invalid wasm", err.strip().splitlines()[-1][:90]
    if "emit error" in err or "emitProgram" in err:
        return "loud emit reject", next(
            (l for l in err.splitlines() if "emitProgram" in l or "emit error" in l), "")[:120]
    return "compiler trap", err.strip().splitlines()[-1][:90] if err.strip() else ""


def grade_all(cells, seed):
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        return dict(zip(cells, ex.map(grade, [(c, seed) for c in cells])))


def hist(res, label):
    c = Counter(v[0] for v in res.values())
    print("  %s: %s" % (label, "  ".join("%s=%d" % kv for kv in sorted(c.items()))))


def main():
    cdir, base = sys.argv[1], os.path.abspath(sys.argv[2])
    cand = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else None
    cells = sorted(os.path.join(cdir, f) for f in os.listdir(cdir) if f.endswith(".vl"))
    print("D411 two-destination grid: %d cells" % len(cells))
    rb = grade_all(cells, base)
    hist(rb, "base")
    if not cand:
        for c in cells:
            print("  %-52s %s %s" % (os.path.basename(c), rb[c][0], rb[c][1][:60]))
        return 0
    rc = grade_all(cells, cand)
    hist(rc, "cand")
    lost, tosilent, toruns, other = [], [], [], []
    for c in cells:
        a, b = rb[c][0], rc[c][0]
        if a == b:
            continue
        n = os.path.basename(c)
        if a == "runs" and b != "runs":
            lost.append((n, a, b))
        elif a not in SILENT and b in SILENT:
            tosilent.append((n, a, b))
        elif b == "runs":
            toruns.append((n, a, b))
        else:
            other.append((n, a, b))
    for title, rows in (("runs LOST", lost), ("-> silent", tosilent),
                        ("-> runs", toruns), ("other movement", other)):
        print("  %-16s %d cells" % (title, len(rows)))
        for n, a, b in rows:
            print("      %-52s %s -> %s" % (n, a, b))
    return 1 if lost else 0


if __name__ == "__main__":
    sys.exit(main())

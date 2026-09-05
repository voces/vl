#!/usr/bin/env python3
"""Grade the DISTILLED census corpus against a seed and diff it cell-matched against the baseline.

The corpus has TWO halves and they are collapsed by different rules.

`cells/` is DERIVED: one representative per BEHAVIOURAL EQUIVALENCE CLASS of the 250,238-cell
census — two cells are in the same class when all 19 graded compiler snapshots in the census
history gave them the identical (outcome, message). 250,238 collapses to 1,477 that way, and
the collapse is measured, not assumed. `redistil.py` rebuilds it from scratch.

`named/` is CURATED and never auto-derived: the exact cells some real regression NAMED. It
exists because a collapse can only separate what its history separated. D272's 72-cell
runs-lost set proved that from both directions — a behavioural collapse of that grid (34 reps)
and an axis floor over its four axes (285 reps) each covered ZERO of the 72, because on today'"'"'s
compiler all 72 simply `run` like thousands of their neighbours. What makes them worth keeping
is not how they behave now but what a specific candidate DID to them. Nothing derived from
current behaviour can know that, so the named set is kept whole.

    python3 regress.py <seed.wasm> [--baseline F] [--write-baseline] [--json OUT]
    python3 regress.py <seed.wasm> --write-baseline --set <named-set>

`--set` is how a landing that adds `named/*.vl` files records them in `expected.jsonl` and
`baseline.jsonl` in ONE move; `index.py` owns that file and says what a missing row cost.

Exit code is 1 only when a cell went `runs` -> not-runs. Every other transition is
REPORTED, not blocking: a program that did not work before and does not work now has not
regressed in the sense a gate should stop, and ranking it as though it had is what made
this check cost 35 minutes instead of 9 seconds.
"""
import glob
import json
import os
import subprocess
import sys

from cellmap import dump_cells, load_cells
from index import DERIVED_BLOCKS, audit, complaint, prune, write_set

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRADER = os.path.join(ROOT, "scripts/silent-sweep/census/gradecensus.py")
CELLS = os.path.join(HERE, "cells")
NAMED = os.path.join(HERE, "named")

SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main():
    if len(sys.argv) < 2:
        print(__doc__.strip())
        return 2
    seed = sys.argv[1]
    baseline = arg("--baseline", os.path.join(HERE, "baseline.jsonl"))
    out = arg("--json", os.path.join(HERE, ".last.json"))

    # THE INDEX IS RECONCILED BEFORE THE GRADE, never after: a tree that is merely
    # mid-edit must not pay a minute to be told its index is short. Every cell graded
    # below carries an `expected.jsonl` row, so the reads of it further down have no
    # default left to take — a missing row used to mean block `A`, `represents` 0, and a
    # curated cell was then counted as a census representative standing for nothing.
    setname = arg("--set")
    gaps = audit()
    if "--write-baseline" in sys.argv and (gaps["orphan"] or gaps["missing"]):
        if gaps["orphan"]:
            print(f"distilled: index — pruned {len(prune())} row(s) whose cell is gone")
        if gaps["missing"] and not setname:
            print(complaint(gaps))
            return 2
        if gaps["missing"]:
            n = write_set(setname, gaps["missing"])
            print(f"distilled: index — wrote {n} curated row(s) at block {setname}")
        gaps = audit()
    short = complaint(gaps)
    if short:
        print(short)
        return 2

    env = dict(os.environ)
    env.setdefault("JOBS", "6")
    now = {}
    for part in (CELLS, NAMED):
        if not os.path.isdir(part) or not glob.glob(os.path.join(part, "*.vl")):
            continue
        tmp = out + "." + os.path.basename(part)
        rc = subprocess.run([sys.executable, GRADER, part, seed, tmp],
                            cwd=ROOT, env=env, stdout=subprocess.DEVNULL).returncode
        if rc != 0:
            print(f"distilled: the grader itself failed on {os.path.basename(part)}/ (rc={rc})")
            return rc
        now.update(json.load(open(tmp)))
    json.dump(now, open(out, "w"), indent=1, sort_keys=True)
    if "--write-baseline" in sys.argv:
        dump_cells(baseline, now)
        print(f"distilled: wrote baseline for {len(now)} cells from {seed}")
        return 0

    before = load_cells(baseline)
    idx = load_cells(os.path.join(HERE, "expected.jsonl"))

    lost, into_silent, other = [], [], []
    for c, v in sorted(now.items()):
        b = before.get(c)
        if b is None or (b["class"], b["msg"]) == (v["class"], v["msg"]):
            continue
        row = (c, b["class"], v["class"], idx[c]["represents"])
        if b["class"] == "runs":
            lost.append(row)
        elif v["class"] in SILENT and b["class"] not in SILENT:
            into_silent.append(row)
        else:
            other.append(row)

    pop = sum(idx[c]["represents"] for c in idx)

    def show(title, rows):
        n = sum(r[3] for r in rows)
        print(f"  {title:<28} {len(rows):>4} classes  ({n:>6} of {pop} census cells)")
        for c, was, is_, w in rows[:12]:
            print(f"      {c}  {was} -> {is_}   [{w} cells]")
        if len(rows) > 12:
            print(f"      … and {len(rows) - 12} more")

    ncur = sum(1 for c in now if idx[c]["block"] not in DERIVED_BLOCKS)
    print(f"distilled corpus: {len(now) - ncur} representatives standing for {pop} census "
          f"cells, plus {ncur} curated cells from named regression sets")
    show("runs -> NOT-RUNS  (blocking)", lost)
    show("-> silent  (report)", into_silent)
    show("other movement", other)
    if not (lost or into_silent or other):
        print("  no cell changed class ✅")

    if lost:
        print(f"\ndistilled: REGRESSION — {len(lost)} behavioural class(es) stopped running")
        return 1

    # ON MASTER THE BASELINE MUST DESCRIBE THE COMMITTED SEED EXACTLY, and nothing else
    # checks that. A movement is reported and (except runs-lost) not blocked, which is right
    # for a candidate branch — but it means a merge that forgets `--write-baseline` ships a
    # baseline that DISAGREES with its own seed, and the disagreement is silent in the one
    # direction that flatters: a cell recorded `loud check reject` that actually RUNS is a
    # `not-runs -> runs` movement, so the gate passes and `goal-scoreboard.py`, which reads
    # the baseline, under-reports `runs`.
    #
    # That shipped on 2026-08-31: six `d421c00*` cells closed by D721 were left recorded as
    # rejects, and master's scoreboard read `runs 4208 / total 113` when the truth was
    # `4214 / 107`. An agent found it while diffing its own corpus run, not the gate.
    #
    # `--verify-fresh` is the post-merge check: ANY disagreement is a failure, in either
    # direction. Run it on master after merging, never on a candidate branch, where a
    # disagreement is the whole point.
    if "--verify-fresh" in sys.argv:
        n = len(lost) + len(into_silent) + len(other)
        if n:
            print(f"\ndistilled: STALE BASELINE — {n} cell(s) disagree with this seed. "
                  f"The committed baseline does not describe the committed compiler; "
                  f"re-run with --write-baseline and commit the result.")
            return 1
        print("\ndistilled: baseline is fresh for this seed ✅")
        return 0

    print("\ndistilled: no runs lost ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Grade the D661 grid against a seed.

    python3 grade661.py <cells-dir> <seed.wasm> [--json OUT] [--jobs N]

Four outcomes, the census's own vocabulary:

  runs                        `vl run` rc 0 AND stdout equals the cell's `.want`, which
                              `gen661.py` COMPUTED rather than recorded off a compiler.
  wrong value                 rc 0 and stdout differs — the only outcome that is a silent
                              miscompile, and the reason the `.want` files exist.
  check-clean invalid wasm    `vl check` rc 0, `vl run` non-zero.
  loud check reject           `vl check` non-zero.

A cell whose `vl run` fails while `vl check` passed is reported with the run's first
error line, so the two-destination message can be told from any other refusal.
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")


def firstline(s):
    """The line that names the MECHANISM, not the first non-empty one.

    `vl` prints `Error: emit error` on its own line and the positioned diagnostic on the
    next; a wasm validation failure spends three lines on the engine's frame before the
    `type mismatch` line. Grouping on the first non-empty line therefore folds every emit
    reject into one bucket, which is the exact failure `CLAUDE.md` names ("a validator
    sentence is not a mechanism"). Take the LONGEST of the first four non-empty lines.
    """
    lines = [ln.strip() for ln in (s or "").splitlines() if ln.strip()][:4]
    if not lines:
        return ""
    return max(lines, key=len)[:200]


def grade_one(args):
    path, seed = args
    name = os.path.basename(path)[:-3]
    chk = subprocess.run([VL, "check", path, "--compiler", seed],
                         capture_output=True, text=True)
    if chk.returncode != 0:
        return name, "loud check reject", firstline(chk.stdout + chk.stderr)
    run = subprocess.run([VL, "run", path, "--compiler", seed],
                         capture_output=True, text=True)
    if run.returncode != 0:
        return name, "check-clean invalid wasm", firstline(run.stdout + run.stderr)
    want = open(path[:-3] + ".want").read().strip()
    got = run.stdout.strip()
    if got == want:
        return name, "runs", ""
    return name, "wrong value", "want %r got %r" % (want, got)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cells")
    ap.add_argument("seed")
    ap.add_argument("--json")
    ap.add_argument("--jobs", type=int, default=6)
    a = ap.parse_args()
    seed = os.path.abspath(a.seed)
    paths = sorted(os.path.join(a.cells, f) for f in os.listdir(a.cells) if f.endswith(".vl"))
    with ThreadPoolExecutor(max_workers=a.jobs) as ex:
        rows = list(ex.map(grade_one, [(p, seed) for p in paths]))
    out = {n: {"outcome": o, "msg": m} for n, o, m in rows}
    tally = {}
    for _, o, _ in rows:
        tally[o] = tally.get(o, 0) + 1
    for k in sorted(tally):
        print("%6d  %s" % (tally[k], k))
    print("%6d  TOTAL" % len(rows))
    if a.json:
        with open(a.json, "w") as fh:
            for n in sorted(out):
                fh.write(json.dumps({"cell": n, **out[n]}) + "\n")
        print("wrote %s" % a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())

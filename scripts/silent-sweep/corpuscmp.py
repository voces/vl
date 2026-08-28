#!/usr/bin/env python3
"""CORPUS BYTE-IDENTITY — build every corpus module with two seeds and `cmp` the wasm.

    JOBS=6 python3 scripts/silent-sweep/corpuscmp.py <base.wasm> <cand.wasm>

Prints one summary line plus every module whose bytes differ, whose build was LOST
(base built it, candidate does not) or GAINED. The whole point is that it reads the
BYTES: a rung can leave every `runs`/`not-runs` grade untouched, and every histogram
flat, while changing what a module compiles to — and a rung can also kill a real file
while the grade columns stay put, which is a failure only `cmp` sees.

Population: every `.vl` under `tests/cases/` and `std/`, minus the ones the BASE seed
cannot build at all (a `@check`-only fixture, an xfail). A module the base cannot build
is not evidence about the candidate, so it is excluded and counted, never scored.

READ `LOST` BEFORE BELIEVING IT IS A REGRESSION. A must-REJECT fixture added by the same
change is `LOST` by construction: the base was check-clean (that is the defect) and the
candidate refuses it. `tests/cases/unions/error-paren-place-write-retires.vl` is exactly
that. What `LOST` is for is the other kind — 33 modules, `std/buffer.vl` first, that a
`.length` intercept killed while every grid, every grade column and every histogram stayed
flat.
"""
import concurrent.futures
import hashlib
import os
import subprocess
import sys
import tempfile

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
JOBS = int(os.environ.get("JOBS", "6"))


def modules():
    out = []
    for root in (os.path.join(R, "tests/cases"), os.path.join(R, "std")):
        for dirpath, _dirs, files in os.walk(root):
            for f in sorted(files):
                if f.endswith(".vl"):
                    out.append(os.path.join(dirpath, f))
    return sorted(out)


def build(path, seed, tmp):
    o = os.path.join(tmp, hashlib.md5(path.encode()).hexdigest() + ".wasm")
    r = subprocess.run([VL, "build", path, "-o", o, "--compiler", seed],
                       capture_output=True, text=True,
                       env=dict(os.environ, VL_STD=os.path.join(R, "std")))
    if r.returncode != 0 or not os.path.exists(o):
        return None
    with open(o, "rb") as fh:
        d = hashlib.md5(fh.read()).hexdigest()
    os.unlink(o)
    return d


def one(args):
    path, base, cand = args
    with tempfile.TemporaryDirectory() as tmp:
        a = build(path, base, tmp)
        if a is None:
            return (path, "skip", None, None)
        b = build(path, cand, tmp)
        if b is None:
            return (path, "LOST", a, None)
        return (path, "same" if a == b else "DIFFER", a, b)


def main():
    base, cand = sys.argv[1], sys.argv[2]
    mods = modules()
    res = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        for r in ex.map(one, [(m, base, cand) for m in mods]):
            res.append(r)
    same = [r for r in res if r[1] == "same"]
    diff = [r for r in res if r[1] == "DIFFER"]
    lost = [r for r in res if r[1] == "LOST"]
    skip = [r for r in res if r[1] == "skip"]
    for r in diff:
        print("DIFFER  " + os.path.relpath(r[0], R))
    for r in lost:
        print("LOST    " + os.path.relpath(r[0], R))
    print("corpus cmp: %d modules · %d identical · %d DIFFER · %d LOST · %d not buildable by the base"
          % (len(res), len(same), len(diff), len(lost), len(skip)))
    return 1 if lost else 0


if __name__ == "__main__":
    sys.exit(main())

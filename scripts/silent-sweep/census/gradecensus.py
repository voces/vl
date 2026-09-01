#!/usr/bin/env python3
"""Grade a census cell directory against ONE named seed, on the full outcome vocabulary.

    runs                      check-clean, module loads, stdout == the generator's expectation
    runs but wrong value      check-clean, module loads, stdout != expectation
    trap_loads                check-clean, module LOADED and produced output, then trapped
    check-clean invalid wasm  check-clean, the ENGINE refused the module (validation)
    loud emit reject          check-clean, `vl run` failed with an emit-stage error
    loud check reject         `vl check` printed [ERROR] / returned non-zero
    compiler trap             the COMPILER itself died (no module written)

The expectation comes from the generator's manifest, never from the compiler.
A cell whose module is written but whose run fails is separated from one where no
module was written at all by a third `vl build` stage, exactly as
`scripts/silent-sweep/runcell.sh` does.

Usage:
    python3 gradecensus.py <celldir> <seed.wasm> <out.json> [--jobs N]

`JOBS` (env, default 4) caps concurrency; `scripts/silent-sweep/REPRODUCE.md` fixes the
bound at four concurrent `vl` invocations and nothing here raises it.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

VL = os.environ.get("VL", "scripts/vl-host/target/release/vl")
# THE `std:` A GRADE READS IS THIS CHECKOUT'S, NOT THE BINARY'S. The host resolves `std:`
# off the executable's ancestors, and an agent worktree symlinks
# `scripts/vl-host/target` at the MAIN repo — so without this every cell was graded against
# the main checkout's `std/` while claiming to grade the worktree's. It happens to be
# invisible whenever the two agree, which is most of the time and is exactly what makes it
# dangerous: a branch that touches `std/` grades as though it had not.
# `corpuscmp.py` and `d451/mkcells.py` already pin it; this was the outlier.
VL_ENV = dict(os.environ, VL_STD=os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))), "std"))
CELLS = sys.argv[1]
SEED = sys.argv[2]
OUTJSON = sys.argv[3]
JOBS = int(os.environ.get("JOBS", "4"))
if "--jobs" in sys.argv:
    JOBS = int(sys.argv[sys.argv.index("--jobs") + 1])

MANIFEST = json.load(open(os.path.join(CELLS, "manifest.json")))
EXPECT = MANIFEST["expect"]

INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")


def norm(msg):
    m = " ".join(msg.split())
    m = re.sub(r"offset \d+", "offset N", m)
    m = re.sub(r"function\[\d+\]", "function[N]", m)
    m = re.sub(r"\S*\.vl:\d+:\d+:?", "", m)
    return m.strip()[:220]


def one(name):
    f = os.path.join(CELLS, name + ".vl")
    exp = EXPECT[name]
    try:
        c = subprocess.run([VL, "check", f, "--compiler", SEED],
                           capture_output=True, text=True, timeout=120, env=VL_ENV)
    except subprocess.TimeoutExpired:
        return name, "compiler trap", "check timeout"
    cout = c.stdout + c.stderr
    if any(l.startswith("[ERROR]") for l in cout.splitlines()) or c.returncode != 0:
        return name, "loud check reject", norm(
            next((l for l in cout.splitlines() if l.startswith("[ERROR]")), cout))
    try:
        r = subprocess.run([VL, "run", f, "--compiler", SEED],
                           capture_output=True, text=True, timeout=120, env=VL_ENV)
    except subprocess.TimeoutExpired:
        return name, "compiler trap", "run timeout"
    if r.returncode == 0:
        got = r.stdout.strip()
        if got == exp:
            return name, "runs", ""
        return name, "runs but wrong value", "want %r got %r" % (exp, got[:80])
    rerr = r.stderr + r.stdout
    if any(m in rerr for m in EMIT):
        return name, "loud emit reject", norm(rerr)
    if any(m in rerr for m in INVALID):
        return name, "check-clean invalid wasm", norm(rerr)
    if any(m in rerr for m in TRAP):
        # A trap with NO module written is the COMPILER trapping while emitting,
        # not the emitted program trapping at run time.  Never merge the two.
        with tempfile.TemporaryDirectory() as td:
            w = os.path.join(td, "o.wasm")
            subprocess.run([VL, "build", f, "--compiler", SEED, "-o", w],
                           capture_output=True, text=True, timeout=120)
            wrote = os.path.exists(w) and os.path.getsize(w) > 0
        if not wrote:
            return name, "compiler trap", norm(rerr)
        return name, "trap_loads", norm(rerr)
    return name, "check-clean invalid wasm", norm(rerr)


def main():
    names = sorted(EXPECT)
    res = {}
    with ThreadPoolExecutor(max_workers=JOBS) as ex:
        for name, cls, msg in ex.map(one, names):
            res[name] = {"class": cls, "msg": msg}
    json.dump(res, open(OUTJSON, "w"), indent=0, sort_keys=True)
    c = Counter(v["class"] for v in res.values())
    print("%s  cells=%d  seed=%s" % (OUTJSON, len(res), SEED))
    for k in sorted(c):
        print("  %-26s %6d" % (k, c[k]))
    silent = sum(c[k] for k in ("runs but wrong value", "check-clean invalid wasm",
                                "compiler trap", "trap_loads"))
    print("  %-26s %6d" % ("SILENT TOTAL", silent))


main()

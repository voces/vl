#!/usr/bin/env python3
"""Grade every cell of the D88/D100 grid against ONE compiler seed.

Takes the seed as an argument rather than reading `build/vl-compiler.wasm`, so both
sides of an ablation are measured with one host binary and no tree switching — the
same discipline `scripts/silent-sweep/d52/sweep52.py` states. `JOBS` (default 6) caps
concurrency; do not widen it (`vl check` peaks around 650 MB RSS).

The expectation is computed by the GENERATOR, not by the compiler: every cell prints
exactly `7`, so a module that loads and answers wrong grades `runs but wrong value`
rather than `runs`.

    python3 scripts/silent-sweep/d88/gen88.py   /tmp/d88cells
    python3 scripts/silent-sweep/d88/grade88.py /tmp/d88cells <seed.wasm> /tmp/x.json
    python3 scripts/silent-sweep/d88/ablate88.py /tmp   # reads base/d88only/d100only/both
"""
import os, sys, subprocess, json
from concurrent.futures import ThreadPoolExecutor

VL = os.environ.get("VL", "scripts/vl-host/target/release/vl")
CELLS = sys.argv[1]
COMPILER = sys.argv[2]
OUTJSON = sys.argv[3]
JOBS = int(os.environ.get("JOBS", "6"))
EXPECT = "7"

def norm(msg):
    """Message identity: strip byte offsets so a seed-size shift is not a 'move'."""
    import re
    m = " ".join(msg.split())
    m = re.sub(r"offset \d+", "offset N", m)
    m = re.sub(r"function\[\d+\]", "function[N]", m)
    return m[:300]

def one(name):
    f = os.path.join(CELLS, name)
    try:
        c = subprocess.run([VL, "check", f, "--compiler", COMPILER],
                           capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return name, "compiler trap", "check timeout"
    cout = (c.stdout + c.stderr)
    if c.returncode != 0:
        if "panic" in cout.lower() or "unreachable" in cout.lower():
            return name, "compiler trap", norm(cout)
        return name, "loud check reject", norm(cout)
    try:
        r = subprocess.run([VL, "run", f, "--compiler", COMPILER],
                           capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return name, "compiler trap", "run timeout"
    rout = (r.stdout + r.stderr)
    if r.returncode == 0:
        if r.stdout.strip() == EXPECT:
            return name, "runs", ""
        return name, "runs but wrong value", norm(r.stdout.strip())
    low = rout.lower()
    if "emit error" in low or "emitprogram" in low:
        return name, "loud emit reject", norm(rout)
    if "invalid input webassembly" in low or "translation error" in low or "type mismatch" in low:
        return name, "check-clean invalid wasm", norm(rout)
    if "panic" in low or "unreachable" in low:
        return name, "compiler trap", norm(rout)
    return name, "check-clean invalid wasm", norm(rout)

names = sorted(n for n in os.listdir(CELLS) if n.endswith(".vl"))
res = {}
with ThreadPoolExecutor(max_workers=JOBS) as ex:
    for name, cls, msg in ex.map(one, names):
        res[name] = {"class": cls, "msg": msg}
json.dump(res, open(OUTJSON, "w"), indent=0, sort_keys=True)
from collections import Counter
c = Counter(v["class"] for v in res.values())
print(OUTJSON, "cells:", len(res))
for k in sorted(c): print("  %-26s %d" % (k, c[k]))

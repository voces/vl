#!/usr/bin/env python3
"""Grade the binding-storage-class grid against two seeds and print the transitions."""
import os, sys, subprocess, collections
from concurrent.futures import ThreadPoolExecutor

VL = "scripts/vl-host/target/release/vl"
CELLS = sys.argv[1]
A, B = sys.argv[2], sys.argv[3]
JOBS = int(os.environ.get("JOBS", "6"))
files = sorted(f for f in os.listdir(CELLS) if f.endswith(".vl"))


def grade(seed, f):
    p = os.path.join(CELLS, f)
    c = subprocess.run([VL, "check", p, "--compiler", seed], capture_output=True, text=True)
    if c.returncode != 0:
        return "loud_check_reject"
    r = subprocess.run([VL, "run", p, "--compiler", seed], capture_output=True, text=True)
    if r.returncode == 0:
        return "runs" if r.stdout.strip() == "7" else "wrong_value(" + r.stdout.strip() + ")"
    err = r.stderr
    if "Invalid input WebAssembly code" in err or "WebAssembly translation error" in err:
        return "silent_invalid_wasm"
    if "emit error" in err:
        return "loud_emit_reject"
    return "trap"


def both(f):
    return f, grade(A, f), grade(B, f)


rows = []
with ThreadPoolExecutor(max_workers=JOBS) as ex:
    for r in ex.map(both, files):
        rows.append(r)

ca = collections.Counter(r[1] for r in rows)
cb = collections.Counter(r[2] for r in rows)
print("cells:", len(rows))
print("  base  ", dict(ca))
print("  branch", dict(cb))
moved = [r for r in rows if r[1] != r[2]]
back = [r for r in moved if r[2] != "runs"]
print("moved:", len(moved), " backward:", len(back))
for f, a, b in sorted(moved):
    print(f"   {f:44s} {a} -> {b}")
print("--- residue (branch not runs) ---")
for f, a, b in sorted(rows):
    if b != "runs":
        print(f"   {f:44s} base={a} branch={b}")

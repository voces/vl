#!/usr/bin/env python3
"""Decode .res files and print a compact human view."""
import base64, os, sys, glob

def load(path):
    d = {"CELL": "", "CHECKRC": "", "RUNRC": "", "CHECKERR": "", "RUNOUT": "", "RUNERR": ""}
    for line in open(path).read().splitlines():
        if " " in line:
            k, v = line.split(" ", 1)
        else:
            k, v = line, ""
        if k in ("CHECKERR", "RUNOUT", "RUNERR"):
            d[k] = base64.b64decode(v).decode("utf-8", "replace") if v else ""
        else:
            d[k] = v
    return d

for path in sorted(glob.glob(os.path.join(sys.argv[1], "*.res"))):
    d = load(path)
    print("=" * 70)
    print(f"{d['CELL']}  checkrc={d['CHECKRC']} runrc={d['RUNRC']}")
    ce = [l for l in d["CHECKERR"].splitlines() if l.startswith("[ERROR]") or l.startswith("[WARNING]") or l.startswith("[HINT]")]
    if ce:
        print("  CHECK: " + " || ".join(ce[:4]))
    print("  OUT: " + repr(d["RUNOUT"]))
    if d["RUNERR"].strip():
        print("  ERR: " + " || ".join(d["RUNERR"].splitlines()[:4]))

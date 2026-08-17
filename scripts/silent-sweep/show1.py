#!/usr/bin/env python3
"""show1.py <resdir> <cell> [<cell>...] — print each cell's source and full verdicts."""
import base64, os, sys
resdir = sys.argv[1]
celldir = os.path.join(os.path.dirname(resdir.rstrip("/")), "cells")
if not os.path.isdir(celldir):
    celldir = sys.argv[2] if os.path.isdir(sys.argv[2]) else "scratch-silent/cells"
    args = sys.argv[3:]
else:
    args = sys.argv[2:]
for c in args:
    print("#" * 78)
    print("### " + c)
    src = os.path.join(celldir, c + ".vl")
    if os.path.exists(src):
        print(open(src).read())
    p = os.path.join(resdir, c + ".res")
    for line in open(p).read().splitlines():
        k, _, v = line.partition(" ")
        if k in ("CHECKERR", "RUNOUT", "RUNERR"):
            t = base64.b64decode(v).decode("utf-8", "replace") if v else ""
            t = "\n".join(l for l in t.splitlines()
                          if not l.startswith("[HINT]") and not l.startswith("[WARNING]"))
            print(f"--- {k}:\n{t}")
        else:
            print(f"--- {line}")

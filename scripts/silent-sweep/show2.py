#!/usr/bin/env python3
"""show2.py <celldir> <resdir> <cell>... — source + verdicts, hints/warnings stripped."""
import base64, os, sys
celldir, resdir = sys.argv[1], sys.argv[2]
for cell in sys.argv[3:]:
    print("#" * 78)
    print("### " + cell)
    print(open(os.path.join(celldir, cell + ".vl")).read())
    for line in open(os.path.join(resdir, cell + ".res")).read().splitlines():
        k, _, v = line.partition(" ")
        if k in ("CHECKERR", "RUNOUT", "RUNERR"):
            t = base64.b64decode(v).decode("utf-8", "replace") if v else ""
            t = "\n".join(l for l in t.splitlines()
                          if not l.startswith("[HINT]") and not l.startswith("[WARNING]"))
            if t.strip():
                print(f"--- {k}:\n{t}")
        else:
            print("--- " + line)

#!/usr/bin/env python3
"""summ.py <resdir> — one compact line per cell: rc's, the first real diagnostic, stdout."""
import base64, glob, os, sys
resdir = sys.argv[1]
for path in sorted(glob.glob(os.path.join(resdir, "*.res"))):
    d = {}
    for line in open(path).read().splitlines():
        k, _, v = line.partition(" ")
        d[k] = base64.b64decode(v).decode("utf-8", "replace") if k in (
            "CHECKERR", "RUNOUT", "RUNERR") and v else v
    name = d.get("CELL", "?")
    errs = [l for l in d.get("CHECKERR", "").splitlines() if l.startswith("[ERROR]")]
    rerr = [l.strip() for l in d.get("RUNERR", "").splitlines()
            if l.strip() and not l.strip().startswith("Error:")
            and not l.strip().startswith(("0:", "1:", "2:", "3:", "4:", "5:", "6:",
                                          "7:", "8:", "9:", "10:", "11:", "12:"))]
    out = d.get("RUNOUT", "").replace("\n", "/").rstrip("/")
    diag = ""
    if errs:
        diag = "CHECK " + errs[0][9:130]
    elif d.get("RUNRC") != "0" and rerr:
        diag = "RUN " + " ".join(rerr)[:130]
    bs = d.get("BUILDSIZE", "")
    print(f"{name:28s} c={d.get('CHECKRC'):1s} r={d.get('RUNRC'):1s} bsz={bs:>5s} "
          f"out={out[:48]:48s} {diag}")

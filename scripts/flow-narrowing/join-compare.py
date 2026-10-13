"""Compare two `join-grid.py` runs: grade transitions, and every cell that ran before and does
not now. `list <grade> <a|b>` prints the cells of one grade (X = TRAP, U = UNSOUND, W = WRONG).

usage: join-compare.py <before> <after> [list <grade> <a|b>]
"""
import json, sys
from collections import Counter
a = {json.loads(l)["name"]: json.loads(l) for l in open(sys.argv[1] + "/results.jsonl")}
b = {json.loads(l)["name"]: json.loads(l) for l in open(sys.argv[2] + "/results.jsonl")}
mode = sys.argv[3] if len(sys.argv) > 3 else "summary"
trans = Counter()
for k in a:
    trans[(a[k]["grade"], b[k]["grade"])] += 1
if mode == "summary":
    for t, n in sorted(trans.items()):
        print(t, n)
    lost = [k for k in a if a[k]["outcome"] == "runs" and b[k]["outcome"] != "runs"]
    print("runs lost:", len(lost), lost[:20])
elif mode == "list":
    g = {"X": "TRAP", "U": "UNSOUND", "W": "WRONG"}.get(sys.argv[4], sys.argv[4])
    side = a if sys.argv[5] == "a" else b
    for k in sorted(side):
        if side[k]["grade"] == g:
            print(k, "|", a[k]["grade"], "->", b[k]["grade"], "|", side[k]["stderr"][-160:].replace("\n", " "), "|", side[k]["stdout"].replace("\n", " "))

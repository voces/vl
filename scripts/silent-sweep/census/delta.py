#!/usr/bin/env python3
"""Compare ONE census block graded against TWO seeds, and answer the only question that can
invalidate a merged change: DID ANY CELL MOVE BACKWARD?

    python3 delta.py <celldir> <before.json> <after.json> [--limit N]

WHY THIS IS A SEPARATE SCRIPT, AND WHY IT LEADS WITH THE BACKWARD COUNT.

`gradecensus.py` prints a per-class histogram. Two histograms side by side are NOT a delta:
a block can hold its silent total exactly while 300 cells fall out of `runs` and 300
different cells fall in, and the summary line reads unchanged. The per-class counts are a
NET, and a net is the one shape that hides a regression behind a fix. So the unit here is
the CELL, matched by name across the two gradings, and the headline is a transition matrix
rather than two columns.

THE THREE QUESTIONS, IN THE ORDER THAT MATTERS

 1. `runs` LOST — a cell that ran on the before-seed and does not run on the after-seed.
    This is the only class of move that can invalidate a merged change, because `runs` is
    the outcome a user depends on. Reported first, with the cell, both classes, and the
    after-seed's message, so the finding is actionable without re-running anything.
 2. INTO SILENT — a cell that was loud (or ran) before and is silent after. A loud→silent
    move loses no working program but it converts a diagnosed refusal into an undiagnosed
    one, which is strictly worse to debug and is the census's whole subject.
 3. The full transition matrix, every before-class × after-class pair with a non-zero count.
    Forward moves are in there too; a change that fixes 2,644 cells and breaks none should
    be VISIBLE as that shape, not asserted.

A cell present in one grading and absent from the other is counted and named rather than
skipped: two gradings over different populations are not comparable, and silently dropping
the difference is how that stops being obvious.
"""
import json
import os
import sys
from collections import Counter, defaultdict

SILENT = ("runs but wrong value", "check-clean invalid wasm", "compiler trap", "trap_loads")
AX = ["store", "escope", "declness", "twin", "union", "claim", "cont", "annpos",
      "deliv", "pval", "order", "rep", "annpat"]

CELLS = sys.argv[1]
BEFORE = json.load(open(sys.argv[2]))
AFTER = json.load(open(sys.argv[3]))
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 40

man = json.load(open(os.path.join(CELLS, "manifest.json")))
coords = man["coords"]

bk, ak = set(BEFORE), set(AFTER)
common = sorted(bk & ak)
print("cells graded before: %d   after: %d   matched by name: %d"
      % (len(bk), len(ak), len(common)))
if bk - ak or ak - bk:
    print("  ** POPULATION MISMATCH — not comparable without saying so **")
    print("     only in before: %d  %s" % (len(bk - ak), sorted(bk - ak)[:5]))
    print("     only in after : %d  %s" % (len(ak - bk), sorted(ak - bk)[:5]))
else:
    print("  same population on both seeds (no cell dropped or added)")


def show(title, cells, msg_from):
    print("\n== %s: %d ==" % (title, len(cells)))
    if not cells:
        return
    sig = {a: sorted({coords[c][a] for c in cells}) for a in AX if a in coords[cells[0]]}
    fixed = ["%s=%s" % (a, v[0]) for a, v in sig.items() if len(v) == 1]
    print("   constant across them: " + (", ".join(fixed) or "(nothing)"))
    by = Counter((BEFORE[c]["class"], AFTER[c]["class"], msg_from[c]["msg"][:90])
                 for c in cells)
    for (b, a, m), n in by.most_common(LIMIT):
        print("   %6d  %-24s -> %-24s %s" % (n, b, a, m))
    for c in cells[:3]:
        print("   witness: %s.vl" % os.path.join(CELLS, c))
        print("       before: %-24s %s" % (BEFORE[c]["class"], BEFORE[c]["msg"][:100]))
        print("       after : %-24s %s" % (AFTER[c]["class"], AFTER[c]["msg"][:100]))


lost = [c for c in common if BEFORE[c]["class"] == "runs" != AFTER[c]["class"]]
gained = [c for c in common if AFTER[c]["class"] == "runs" != BEFORE[c]["class"]]
into = [c for c in common
        if BEFORE[c]["class"] not in SILENT and AFTER[c]["class"] in SILENT]
outof = [c for c in common
         if BEFORE[c]["class"] in SILENT and AFTER[c]["class"] not in SILENT]

print("\n" + "=" * 72)
print("N cells moved backward (`runs` before, NOT `runs` after): %d" % len(lost))
print("N cells moved INTO a silent class:                        %d" % len(into))
print("=" * 72)

show("`runs` LOST — the only move that can invalidate a merged change", lost, AFTER)
show("moved INTO a silent class", into, AFTER)
show("`runs` GAINED", gained, BEFORE)
show("moved OUT OF a silent class", outof, BEFORE)

print("\n== full transition matrix (before -> after), every non-zero pair ==")
mat = Counter((BEFORE[c]["class"], AFTER[c]["class"]) for c in common)
unchanged = sum(n for (b, a), n in mat.items() if b == a)
print("   unchanged: %d of %d (%.2f%%)   moved: %d"
      % (unchanged, len(common), 100.0 * unchanged / max(len(common), 1),
         len(common) - unchanged))
for (b, a), n in sorted(mat.items(), key=lambda x: -x[1]):
    flag = "" if b == a else ("   <== BACKWARD" if a in SILENT and b not in SILENT
                              or (b == "runs" and a != "runs") else "   (forward)")
    print("   %8d  %-24s -> %-24s%s" % (n, b, a, flag))

print("\n== per-class totals ==")
cb, ca = Counter(BEFORE[c]["class"] for c in common), Counter(AFTER[c]["class"] for c in common)
print("   %-26s %10s %10s %9s" % ("class", "before", "after", "delta"))
for k in sorted(set(cb) | set(ca)):
    print("   %-26s %10d %10d %+9d" % (k, cb[k], ca[k], ca[k] - cb[k]))
sb = sum(cb[k] for k in SILENT)
sa = sum(ca[k] for k in SILENT)
print("   %-26s %10d %10d %+9d" % ("SILENT TOTAL", sb, sa, sa - sb))
print("   %-26s %9.2f%% %9.2f%%" % ("silent rate",
                                    100.0 * sb / max(len(common), 1),
                                    100.0 * sa / max(len(common), 1)))

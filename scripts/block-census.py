#!/usr/bin/env python3
"""Which statement walks can a bare `Block` reach?

`drwBareBlock` (D1253) rewrites a bare `{ … }` statement into `if true { … }`, and it runs as
pass row `dispatchRewrite`. So only the passes BEFORE that row can ever see a `Block` statement
node; every ladder after it sees an `IfStmt`, which all of them have an arm for.

This intersects the 73 statement-list walks derived by `derive.py` with the call graph
reachable from the pre-rewrite pass entry points (plus the lint and fmt drivers, which run off
the same parsed AST outside the emit pass table).
"""
import os
import re

WT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "compiler")
FILES = sorted(f for f in os.listdir(WT) if f.endswith(".vl"))
FN = re.compile(r"^(?:export )?function ([A-Za-z_][A-Za-z0-9_]*)\s*\(")
CALL = re.compile(r"\b([a-zA-Z_][A-Za-z0-9_]*)\s*\(")

bodies = {}          # name -> body text
owner = {}           # name -> file
for fname in FILES:
    lines = open(os.path.join(WT, fname), encoding="utf-8").read().split("\n")
    starts = [(i, m.group(1)) for i, l in enumerate(lines) for m in [FN.match(l)] if m]
    for idx, (i, name) in enumerate(starts):
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        bodies[name] = "\n".join(lines[i:end])
        owner[name] = fname

edges = {n: sorted({c for c in CALL.findall(b) if c in bodies and c != n})
         for n, b in bodies.items()}

# The emit pass table, in order, up to and including the rewrite.
PRE = ["collectTyParamNames", "collectU", "collectS", "collectA", "collectFns",
       "passCheckTopLevel", "buildFnMap", "computeVoidFns", "capNarrowBuild",
       "computeRetInference"]
# The other drivers that walk the same parsed AST with no rewrite in front of them. A root
# that does not resolve would silently move every walk under it into the covered column, so
# the resolved list is printed and a miss is loud.
OTHER = ["lintWalk", "formatProgram", "checkProgram"]
ROOTS = [r for r in PRE + OTHER if r in bodies]
UNRESOLVED = [r for r in PRE + OTHER if r not in bodies]

seen, stack = set(), list(ROOTS)
while stack:
    n = stack.pop()
    if n in seen:
        continue
    seen.add(n)
    stack.extend(edges.get(n, ()))

# the 73 statement-list walks
BEARING = ("IfStmt", "WhileStmt", "ForRange", "ForIn")
walks = []
for n, b in bodies.items():
    have = [k for k in BEARING
            if re.search(r"\b(?:is\s+%s\b|%s\s*=>)" % (k, k), b)]
    if len(have) < 2:
        continue
    blk = re.search(r"\b(?:is\s+Block\b|Block\s*=>)", b) is not None
    kids = "nodeChildren(" in b
    walks.append((owner[n], n, len(have), blk, kids))

print("roots resolved: %s" % ", ".join(ROOTS))
if UNRESOLVED:
    raise SystemExit("UNRESOLVED ROOTS %s — rename them or the census under-reports"
                     % ", ".join(UNRESOLVED))
print("functions reachable from them: %d of %d\n" % (len(seen), len(bodies)))
print("%-22s %-34s %-5s %-8s %-10s %s" % ("file", "walk", "bear", "Block?", "children?", "pre-rewrite?"))
live = []
for f, n, cnt, blk, kids in sorted(walks):
    pre = n in seen
    if blk or kids or not pre:
        continue
    live.append((f, n, cnt))
for f, n, cnt, blk, kids in sorted(walks):
    pre = n in seen
    print("%-22s %-34s %-5d %-8s %-10s %s" % (
        f, n, cnt, "yes" if blk else "NO", "yes" if kids else "no",
        "YES" if pre else "no (post-rewrite)"))
print()
print("statement-list walks: %d" % len(walks))
print("  name Block, or descend via nodeChildren: %d" % sum(1 for w in walks if w[3] or w[4]))
print("  neither, reached only AFTER dispatchRewrite: %d  (covered by the rewrite)"
      % sum(1 for w in walks if not w[3] and not w[4] and w[1] not in seen))
print("  neither, and reachable BEFORE it:            %d  <- needs an arm or a hand verdict" % len(live))
for f, n, cnt in live:
    print("      %s:%s" % (f, n))

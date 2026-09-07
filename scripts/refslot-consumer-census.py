#!/usr/bin/env python3
"""Step 1 of the clamped-to-`0` ref-list slot: for every call site of `refListSlotOfExpr`,
does the caller TEST the result or use it blind?

`refListSlotOfExpr` clamps `rlSlotByName`'s honest `-1` to slot 0 — a real row with a real
wrapper heap type, which is what D1040, D1106 and D1500 each cost. Before the clamp can be
narrowed, its consumers have to be able to take a decline, and this is the census that says
which can:

  GUARDED  the value is bound and compared against `< 0` / `>= 0` within the binding's block.
           These guards are DEAD today — the clamp guarantees the value is never negative —
           which is the in-band-sentinel shape: a helper answering `0` for "cannot answer"
           makes every caller-side guard unreachable.
  BLIND    it flows into an index, a writer or a record with no test. These are the clause-1
           risk and the ones that must move FIRST: narrowing the clamp before they can take a
           decline converts a silent wrong slot into a trap.
  DIRECT   it is returned straight out, so the caller's caller owns the question.

The companion measurement is the `$VL_REP_SHADOW` clamp probe in `emit_classify.vl`
(`repABNote("clamp", …)`), which says how often each of the four clamps actually fires.
`docs/internals/rep-descriptor-campaign.md` §7.6.
"""
import re

SRC = {}
for f in ('compiler/emit_classify.vl', 'compiler/emit_collect.vl',
          'compiler/emit_sections.vl', 'compiler/wasmEmit.vl'):
    SRC[f] = open(f, encoding='utf-8').read().split('\n')

CALL = re.compile(r'refListSlotOfExpr\(')
BIND = re.compile(r'^\s*(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*refListSlotOfExpr\(')
ASSIGN = re.compile(r'^\s*([A-Za-z_]\w*)\s*=\s*refListSlotOfExpr\(')

tot = {'GUARDED': 0, 'BLIND': 0, 'DIRECT': 0}
rows = []
for f, lines in SRC.items():
    for i, l in enumerate(lines):
        if not CALL.search(l) or 'function refListSlotOfExpr' in l:
            continue
        m = BIND.match(l) or ASSIGN.match(l)
        if not m:
            verdict = 'DIRECT' if 'return refListSlotOfExpr' in l else 'BLIND'
            rows.append((f, i + 1, verdict, l.strip()[:64]))
            tot[verdict] += 1
            continue
        name = m.group(1)
        # look ahead within the enclosing block for a test of `name`
        pat = re.compile(r'\b' + re.escape(name) + r'\s*(?:<\s*0|>=\s*0|!=\s*-1|==\s*-1)')
        verdict = 'BLIND'
        for j in range(i + 1, min(i + 14, len(lines))):
            if pat.search(lines[j]):
                verdict = 'GUARDED'
                break
        rows.append((f, i + 1, verdict, l.strip()[:64]))
        tot[verdict] += 1

for f, n, v, txt in sorted(rows, key=lambda r: (r[2], r[0], r[1])):
    print(f"{v:<8}{f.split('/')[-1]:<20}{n:>6}  {txt}")
print()
print("call sites:", sum(tot.values()), tot)

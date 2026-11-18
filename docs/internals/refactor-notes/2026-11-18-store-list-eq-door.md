# The IR claims list `==`, through legacy's own list compare, 2026-11-18 (lane STORE)

After #9025 the blocker census left 41 corpus functions blocked by `operand type` alone; most
were list compares. Legacy's list `==`/`!=` was already value-level: `emitBinRefOps` wrote both
operands, recovered a narrowed one and synced a view, then ran one of two cores (a rep's generic
core, or the non-null core). It held that operand sequence twice, once per core.

## The step

- **Legacy:** the two arms are one: `listEqArmOf` picks the core, `listEqOperandTail` runs after
  each operand, and `listEqTail` runs the core and negates `!=`. Bytes are unchanged.
- **IR:** `RListEq` builds both lists and lowers through the same two tails, where
  `listEqRouteOf` (the pure form of every `emitBinExprNode` arm ahead of the list compare) says
  legacy routes the compare there.
- **Cost:** the union and list doors are asked only beside an operand `operandWhy` calls
  `operand type`. Asking them for every binary operator cost the self-compile +0.69% L2 fuel,
  which #9025's union door had started paying.

## Measured

| | master `bb90aa84` | this head |
|---|---:|---:|
| corpus functions emitted by the IR | 30,485 | 30,510 |
| sole `operand type` blockers | 41 | 16 |
| self-compile functions claimed | 12,310 | 12,316 |
| L2 self-compile fuel | 97,094,290,634 | 97,069,170,750 (−0.03%) |

- Identity, master's fixpoint → this head's, `--names`: 9,030 identical, 0 differ, self-compile
  identical. `--cases`: 7,444 identical, 0 differ. Mode 3 self-compile byte-identical.
- The shadow matches all 30,510; `--claims` falls back on none; `gate.sh` passes.
- Lines: +165 / −52 over 9 files. The list compare had little to delete: its routing is
  shared, its cores are `value` drivers. The step is paid by claims, not deletions.

The 16 left are record, closure and nullable compares, each its own core.

# Step 7 (lane D, D16032): the coalesce reservations and the print plan read the result's row, 2026-11-13

Two more readers stop looking a union's name up again in `unNames`.

- `coalesceResultUnionName` (emit_start_block) builds its answer from the node's type in three
  branches: a value-union render, the type key's row (`unRowOfTyKey`); a variant-bearing or
  map-arm row (`registeredUnionRowOfTy`); a row with a list-of-lists arm. It is now
  `coalesceResultUnionNameRow`, which also hands back that row. The name-only form stays as a
  wrapper for its other callers.
  - The two string-op reservations in `exprHasStrOp` (emit_fn_scans), on `??` and on an
    if-join, asked `msSetOfUnion(name)`. They now ask `msSetOfRowOr(row, name)`.
- `printUnionPlanCode`'s rung for a read typed at a hole (D16060) dropped the row its
  `unionNameOfExpr` carried. It now asks for it through `unionNameOfExprRow` and reads the row's
  atoms (`unionArmsOfRow`) and set (`msSetOfRowOr`), and falls back to the name only where the
  row records no members.

## Measurement

MPROBE over the 24,070-record population:

| site | programs | row = name's row, same set | differ | name has no row |
| --- | --- | --- | --- | --- |
| `??` reservation | 111 | 111 | 0 | 0 |
| if-join reservation | 62 | 59 | 1 | 2 |
| `printUnionPlanCode` hole rung | 1 | 1 | 0 | 0 |

The one program where they differ (`coalesce-numeric-binding.vl`) is a numeric literal union,
lane G's half of D16032. There the row and the name name different sets, and the reservation
answers alike either way.

**Byte comparison:** master against this change, 171 of 171 programs reaching these sites build
identical, that one included.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.

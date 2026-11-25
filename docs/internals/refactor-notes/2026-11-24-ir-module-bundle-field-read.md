# IR: a module record's bundle field read as a value, 2026-11-24

Lane IR-N2. Base: master 09e329d2b. Class `start: field read coercion`, family B (D17164).

## Change

- A module record `w = { f: lap(..) }` whose field holds a two-signature bundle is stored by
  legacy at a row whose kid is the bundle record (`structIndexOfExpr`, row `{f: {c0, c1}}`). The
  IR reads the cell at the same row (`globalRep` → `cellAtStorageRow`).
- `exprTyOf` had the local arm (`storedVarOf`) but no module twin, so `w`'s read stayed at the
  checker's open record `{f: (_) => _}`, whose kid is a closure over `unsup`, and `buildMember`
  missed. `globalCellRecordTy` is the twin: an open-typed read of a module binding whose cell is a
  closed record is of the cell's type. `builtRecvTy` (#9957) asks `exprTyOf` for a name receiver.
- A closed-typed read and a local are unchanged.

## Predicates and their callers (R8)

| function | callers |
| --- | --- |
| `globalCellRecordTy` (new) | `exprTyOf`'s open-read arm, beside `storedVarOf` |
| `globalRep` (existing, new use) | the IR's global reads; `globalCellRecordTy` |
| `builtRecvTy` (#9957, admits an Ident) | `buildMember` |

## Unmasked

Four of the five cells then stop at misses the field read hid, each present before this change:
`method f` (the bundle field called through its place at both signatures, D17172) and
`global read coercion` (a map-read bundle narrowed and handed on, D17173).

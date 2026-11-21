# IR: a value `if` joined at a record or map reference (2026-11-20)

`ifRefExpr` builds a value `if` joined at a reference (legacy's `emitIfExprRef`). Its arms are
written as themselves, under the blocktype the lowering takes from `ifRefJoinOf` and writes
through legacy's own `fbRefIfOpenType`. The builder admitted only the `str`, `list`, `strlist` and
`reflist` kinds and missed the rest as `expression if ref <kind>`. Nothing in the build or the
lowering depends on the kind beyond that blocktype, so `struct` and `map` now build the same way.

`variant` is not admitted. Admitting it covers `irMapCompactFnCode` (`ir_helper.vl`), whose
`[seqs, i, { oiRep: I64(), oiBits: -1 }]` the IR builds without the two order-stash locals legacy
declares (D17037; the self-compile's existing `node-in array: differ` row). The function would
cover with a locals mismatch, so the kind waits for that row.

Measured on fixpoint seeds at merge-base `6851d881` (functions with no blocker): self-compile
19,054 → 19,059 of 19,376, covered = matched. `expression if ref map` 4 → 0, `expression if ref
struct` 3 → 0 alone; of the struct joins, one stops at `ref if arm null`, one at `ref if arm rep`
and one at `object field armDelivery`.

Legacy lines deleted: 0. Moved to `@ir`: 0.

# 2026-11-15 — lane L: one element kind for the scalar-list store and push

- `IdxStore` and `PushValKinds` (wasmEmit.vl) replace `isF64`/`isI64`/`isF32` with one
  `sk: VKind | null`, the non-i32 scalar element. It is read from the rep, as
  `numListElemOf(exprListRep(recv))`, never from a type spelling; the three predicates it
  replaces were projections of `exprListRep` too.
- The per-kind branches in `idxStoreClassify`, `emitIdxStoreValue`, `pushSlotOf` and
  `emitPushValue` become one branch each, through `scalarListWrap`/`scalarListBack`/
  `listIdxKindOf` and a new `emitExprAsElem`, which is `emitExprAsKind` at an element kind.
- A new element kind (the planned `v128list`) now costs one arm in each helper instead of a
  flag threaded through each op.
- Net compiler lines −24 (+40/−64); `emit_mono.vl` unchanged (908); seed −3 bytes.
- Generated code: 400 case files that use `f32[]`, `f64[]`, `i64[]` or `.push` were built with
  the master seed and with this one. All 347 that build are byte-identical; the 53 that do not
  build are error fixtures, and they fail with the same rc on both seeds.

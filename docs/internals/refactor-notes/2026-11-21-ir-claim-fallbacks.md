# IR: a discarded slice, and a union or numeric global's initializer (2026-11-21)

**A discarded slice.** A call statement's right-hand side went to `SEffect` whatever it was. A
`.slice(…)` whose value nothing reads is an `RListSlice`, a value, and the lowering's effect arm
has no case for it, so the claim fell back (`effect outside I1`). That happened in
`statements/member-call-statement-positions.vl`, `functions/bare-return-pins-void.vl` and the
probe `member-call-statement-and-tail.vl`. Legacy evaluates the slice and drops it. The builder
now makes it a temp and an `SDrop`, which the lowering writes as those bytes.

**A union or numeric global's initializer.** A start body missed every global whose
`startInitArmOf` arm was not `plain`. Two arms are a delivery at the cell's rep:
- `unionBox`: legacy writes `emitUnionBoxOwed` at the binding's union type
  (`letBindingUnionTy`). The IR delivers at the cell's box rep with that type as the destination,
  through the same hole box plan.
- `widen`: legacy writes `emitWidened` at the cell's width. The IR delivers through
  `globalInitValue`, whose contract (the value at the cell's rep, or `global initializer
  coercion`) is unchanged; IR-D1's constant cells call it as is.

**A map store whose value makes a store.** Widening the start exposed a byte mismatch that a
function already had. In `box["k"] = (m = 5)` with a wider `m`, legacy writes the assignment's
store in place, after the map's receiver and key. The IR's store is a statement, which lands above
them. Both run correctly, but the bytes differ, so a claimed start shipped other bytes
(`expressions/assign-value-wider-name.vl`, tests/cases A/B). `mapSetStageLeads` now names it
(`map store value store`) when a store sits in the value and the receiver and key are not temps.

Measured on fixpoint seeds at merge-base `cb57cea3`: self-compile unchanged (19,159 covered =
matched, 19,053 claimed); corpus 42,246 all matched; `tests/cases` armed shadow start covered
3,713 → 3,921, matched 3,710 → 3,919, and fail or mismatch rows 16 → 11, the five slice fallback
rows gone and none new. The claims gate's named fallback set falls 7 → 0 over the three programs.

Legacy lines deleted: 0. Moved to `@ir`: 0.

# IR: a map store's scalar and union values (2026-11-21, lane IR-N3)

`map store value scalar` and `map store value union` were `mapSet`'s refusals of two arms of
`mapSetValArmOf`. On them, `emitMapSetValExpr` writes the value widened to a scalar map value
(`emitScalarValue`, the f64, i64 and f32 widenings), or boxed into a union map value
(`emitUnionBoxOwed` at the slot's union name and type). The receiver and key are written first, as
on the plain arm.

## The change

- `mapSet` keeps the arm `mapSetValArmOf` returned and passes it to `mapSetValue`. That builds the
  value with `deliver` at the receiver's map value rep, the union's type (`mvValTyIxAt`) as the box
  site on the `union` arm, and refuses a box into another union as a field store does
  (`boxIntoOtherUnion`). A value at another rep is the named miss `map store value <arm> rep`.
- The lowering and verifier are unchanged: the value is an operand written before `mapSetTail`.

## Witness

`tests/ir-shadow-rows/map-store-scalar-union-value.vl`: an `i32` literal stored into an `f64` map,
and an `i32` and a string stored into an `i32 | string` map.

## Also: the append-site ask is a parameter

#9461's `ssAskOnly` was a module flag, which the phase-state census counts as hidden state
(`compiler/wasmEmit.vl` hidden 16 → 17). `strSiteArmsAt` now takes `ask`, and the asked forms pass
it through `strInPlaceModeOf` and `strSiteOfRhsOf`, so nesting is safe and no module state is added.

## Temporary: a union-box map read after a union store

Once this store builds a union map value, a later union-box map read in the same function can be
claimed. Its element-read row then differs from legacy's: `spans: count 7 vs 8` in
`tests/cases/soundness/narrowed-write-join-keeps-numeric-members.vl` (`aliasMap`), and a start in
`tests/cases/unions/deep-is-json-shape-walk.vl`. Per the coordinator's ruling, such a read is the
named miss `map read row after a union store` (`IrFn.irUnionStored`, set by `mapSetValue`'s union
arm), 23 functions and 13 start bodies in tests/cases. IR-N1's fix of the union-box read's row
decision removes the miss and the field.

## Measured (fixpoint seeds of the merge-base dfc71b02 and the change)

- tests/cases armed shadow: covered and matched +122, start +35. `uncovered map store value scalar`
  101 → 0 (start 35 → 0), `union` 86 → 0 (start 46 → 0). The temporary miss takes 23 (start 13).
  No new `fail` or `mismatch` row.
- Corpus: `map store value scalar` 32 → 0, `union` 20 → 0, paired 1 → 0; no-blocker 44,812 →
  44,865 of 45,678.
- `--cases` identical 7,604 and `--claimless` 14,017, both differ 0. L2 fuel per PR +0.06%.

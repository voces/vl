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

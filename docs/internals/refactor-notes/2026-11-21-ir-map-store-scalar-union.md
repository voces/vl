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

## Also: an append site's arm test mints no global

The first proof found one tests/cases program whose shipped bytes moved:
`tests/cases/maps/rmw-fused-value-shapes.vl`, whose start function this change makes claimable. Its
global section held the same entries in another order. `strSiteArmsAt` asked
`synthSitePairIdx`, which mints the append site's global pair on first use. The IR asks the site's
mode at build time, before legacy's emission mints the map backings, so the pair moved ahead of
them. The test now asks `synthSitePairAvailable`, which mints nothing. The pair is minted where the
site is written, as before.

# IR: the one-body union-of-lists walk, flat form (2026-11-26, lane COV-CLOS)

## Defect

The one-body walk took only the box form, where each element is boxed into the element union. A
walk whose elements convert, legacy's `emitListUnionForFlat`, missed (`for in list union flat`).
Two shapes convert: inside `is K[]` over an arm stored apart, each element becomes a `K`; and a
literal-union arm beside a string arm widens to its string.

## Fix

The flat plan legacy built inline is now `luForFlatPlanOf` (`wasmEmit.vl`). `luForWalkPlanOf`
picks the box or the flat plan as `emitListUnionFor` does, and `luForWalkElemTy` names the
variable's type: `K`, or the element union. The element chain opens its arms at the flat kind's
valtype (`fbOpenIf`, `fbValtype`) where the box form opens at the box. The verifier also takes a
walk into a variable of a primitive rep.

## Claims-off ripple

All 9,066 `tests/cases` programs, built with claims off by master and by head, differ in **0**
bytes.

## Census: all 11,500 census files

| | master | the box walk (the PR before this) | head |
|---|---:|---:|---:|
| claimed units | 114,720 | 114,735 | 114,739 |
| lost | — | 0 | 0 |
| `for in list union` | 19 | 0 | 0 |
| `for in list union flat` | 0 | 4 | 0 |

The gained units are `go_u8`, `go_i64`, `go_f64` and the start body of
`arrays/is-list-arm-for-at-numeric-literal-set.vl`.

## Positions

`tests/cases/unions/list-union-walk-flat-positions.vl` covers argument, record field, the index
and string concatenation, over a `K` conversion and a string widening. Master and the box walk
miss twice; head claims every function, and the output is the same with claims on, with claims off
and on master.

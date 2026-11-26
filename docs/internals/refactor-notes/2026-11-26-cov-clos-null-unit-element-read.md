# IR: a null-unit element read banks one row, as legacy's (2026-11-26, lane COV-CLOS)

## Defect

`nulUnitPlaceRead` refused any element read (`null unit element read span`). An element read of a
`null`-unit list is written by legacy's `emitNulNoneRead`: the read for its effects, dropped, then
the destination's null. Legacy banks one element-read row for it, over the null. The IR's
`RNullOf` lowering banked that row too, but the inner read's own lowering (`RListGet`, or `RMapGet`)
banked a second. The span comparison counted N+1 against N.

## Fix

The builder's fence is gone. `RNullOf`'s lowering mutes the element node's row (`lwIdxRowMutes`)
while it writes the inner read, so only the row over the null is banked. That row's start is taken
before the inner read, and every changed function's spans now match legacy's.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,646 | 114,665 |
| lost | — | 0 |
| `null unit element read span` | 21 | 0 |
| `null unit read rep` | 14 | 16 |

19 units are gained. They are spread over `arrays/null-list-of-a-never-filled-null-let.vl`, the two
`closures/write-null-to-a-captured-*` programs, `generics/list-of-param-or-null-at-never.vl` and
`types/null-unit-heap-positions.vl`. Two units move on to `null unit read rep`. In every
`null unit read rep` case, the consumer asks for the `null`-unit rep where the value's null owner
names a typed null (a box or an atom). That is a consumer-rep question, not this one.

## Positions

`tests/cases/arrays/null-unit-element-read-positions.vl` covers binding, argument, `return`,
record field, list element, `print` and a comparison. Base misses `null unit element read span`
in both functions. Head claims `ret`, and `run` now misses only at the record field
(`object field nulnone`). The output is the same with claims on and off.

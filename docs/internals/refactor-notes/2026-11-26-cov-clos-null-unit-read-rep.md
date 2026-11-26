# IR: a null-unit read where a typed null is wanted is built at that null's rep (2026-11-26, lane COV-CLOS)

## Defect

A read of a never-filled `null` local, global or capture is its destination's null. Legacy writes
it with `emitNullAt`, whose null `nullOwnAt` names from the read's contextual type: a bool's `2`, or
a string's null ref. The IR asked for the read at the rep its consumer handed it. A declaration or
argument that widens after the read hands it the read's own rep, the `null` unit. That rep cannot
hold a bool's or a string's null, so the five builder sites missed (`null unit read rep`).

## Fix

One helper, `nullUnitTemp` with `nullUnitRepAt`, serves all five sites: the `null` join `if`, a
local, a global, a capture and a place read. It builds the read at the asked rep where that rep
holds `nullOwnAt`'s null. Where the asked rep is the unit itself, it builds the read at the
contextual type's rep (`ctxTyAt`) if that rep holds the null. The consumer then meets the typed
null's rep, as it meets a call's result. Any other rep is still a miss.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,659 | 114,663 |
| lost | — | 0 |
| `null unit read rep` | 14 | 7 |
| `null name test of a non-name null side` | 2 | 4 |
| `box of a null-typed value` | 8 | 9 |

Four units are gained:
- `consumers` in `types/infer-null-hole-never-filled.vl`
- `onNull` in `generics/hole-param-written-into-nullable-place.vl`
- `mk` in `globals/null-const-as-a-record-field-before-its-declaration.vl`
- `str` in `types/null-hole-join-siblings.vl`

Three move on to the two later classes.

The seven left are list elements: `generics/list-of-param-or-null-at-never.vl` ×4 and
`types/null-unit-heap-positions.vl` ×3. Legacy builds the list at its built type
(`listLitBuiltTy`), whose element's null is `nullOwnAt`'s, while the IR builds it at the checker's
`null[]`. That is the list-built rep question, not this read's. #10248 moves two more units here,
nine in all. They are parked (coordinator ruling, 2026-11-26). At `T = never`, legacy builds
`[x]` (`x: T | null`) as an `i32` list holding the bool's null, and the generic's result is that
list. Building the literal alone at its built type still leaves the read a miss: the generic's IR
signature rep has to move with it, which is a shared layout change for nine units.

## Positions

`tests/cases/types/null-unit-read-at-typed-null-positions.vl` covers annotated binding, argument,
`return`, record field, global read and a closure's capture, at `boolean | null` and
`string | null`. Base misses `null unit read rep` three times; head claims every function, and the
output is the same with claims on and off.

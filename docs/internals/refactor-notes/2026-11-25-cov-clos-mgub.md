# IR: a union map read narrowed to a record reads the box whole (2026-11-25, lane COV-CLOS)

## Defect

`mapGetAt`'s `unionBox` arm missed (`map get union box rep`) when the instance narrowed the read to
a member that no box plan reads the value at. The read gets no box kind, and the value's rep is not
the member's.

## Fix

When that member is a record, map or ref list (`boxNarrowCon` is not -2), the read takes the
value's box whole (`mtWhole`) at the map's value rep, then narrows it with `RBoxNarrow` to the
member. `boxNarrowAt` in `ir_lower.vl` finds the variant by rep (`variantOfRep`) when the narrowing
at that site has no plain variant of that rep. This is the IR's general box-narrow lowering. It adds
no legacy-helper call.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,589 | 114,590 |
| lost | — | 0 |
| `map get union box rep` | 4 | 3 |

The gained unit is `fromMapRead` in `tests/cases/unions/narrowed-arm-unannotated-binding.vl`.

The three left are a scalar list member read twice and an atom unbox. Their lowering is keyed on a
node (`boxContainerRead` needs an identifier; `refArrayUnionUnboxTail` and `mapUnionUnboxTail` key on
the node), so they need a node-free lowering first.

## Positions

`tests/cases/unions/map-union-read-narrowed-to-record-positions.vl` covers `const`, argument, record
field and return. `pick` is now claimed; before, both functions missed `map get union box rep`.
`run` now misses at a later step, `object field arm unbox` (the record-field position). The output
is the same with claims on and off.

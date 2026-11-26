# IR: a union map read narrowed to a container is the read with legacy's tail (2026-11-26, lane COV-CLOS)

## Defect

`mapGetAt`'s `unionBox` arm missed (`map get union box rep`) when the instance narrowed the read to
a map or list member (`narrowedMapReadOf`'s `container` arm). The read was taken only at the value's
box, or unboxed to a primitive. Yet `RMapGet`'s lowering, when the read is not whole, already ends in
`emitNarrowedMapReadTail`, legacy's own narrowed tail, which unboxes the container.

## Fix

The `container` arm accepts the read's own checker-type rep. The verifier's map-get rule takes a
map or list dst where the builder's fact marks the read a container read. `ir_verify_facts`'s
`RMapGet` fact is now 2 for a container read, beside 1 for a primitive unbox. Every other map get
is held to the old rule.

This does not go through `boxContainerRead`, which needs an identifier node: the map read's own
lowering writes the tail.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,639 | 114,641 |
| lost | — | 0 |
| `map get union box rep` | 3 | 1 |

The gained units are the start bodies of `maps/narrowed-map-arm-reread-through-index-path.vl` and
`unions/narrowed-container-read-unboxes-at-checker-type.vl`.

The one left is a literal-union atom unbox (`literal-unions/map-read-narrowed-to-litunion-arm-prints.vl`).
Its read is at an atom rep, which the `unbox` arm's primitive test refuses. Accepting that rep moves
it to `print operand rep`, a separate print family, so it stays out.

## Positions

`tests/cases/maps/map-union-read-narrowed-to-container-positions.vl` covers binding, argument,
record field, method receiver, `return` and list element, over a map member and a record-list
member. Base misses `map get union box rep` twice; head claims every function, and the output is
the same with claims on and off.

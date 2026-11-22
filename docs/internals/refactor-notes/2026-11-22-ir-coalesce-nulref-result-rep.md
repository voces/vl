# IR: a nullable map coalesced into a wider map that stores alike (2026-11-22, lane IR-N2)

`coalesce nulRef result rep`, one of the rungs #9547 named. On the forced IR-only census at
master 14d707ae it holds 2 functions and 1 module start.

- `coalesce-nullable-map-into-wider-map.vl::pick` is `m ?? d` with `m: {[string]: string} | null`
  and `d: {[string]: string | null}`. Legacy writes the nullable map's plain core at the
  operand's map heap (`coalNulRefsHeapOf`), and the result's shape is the default's wider map
  type (`coalesceMapJoinShape`), which is the same heap. The IR's plain block asked for the
  result at the operand's inner rep, so the wider map's rep missed.
- `coalesce-type-param-list-default-agrees.vl::gt` is the other function. Its instance
  `gt<f32>` types the result at `f64[]` over an `f32[]` operand, a different question that this
  note leaves open.

## The change

- `coalNulMapJoinStoresAlike` (`wasmEmit.vl`) is legacy's answer: the `mapHeap` arm, whose
  result shape writes the operand's own map heap.
- The builder takes the plain block at a map result rep where it holds. The verifier lets a
  nullable map's `??` yield a map.

The module start's `(nb ?? wb).length` moves to `coalesce mapJoin`, legacy's separate route for
a join read in place.

Row file `tests/ir-shadow-rows/nullable-map-coalesced-into-wider-map.vl`; witness
`tests/cases/maps/nullable-map-coalesced-into-wider-map-in-function.vl`.

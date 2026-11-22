# IR: a union-with-null map value read under `??` that keeps the box (2026-11-22, lane IR-N2)

`map read mv`, the third batch after #9546. On the forced IR-only census at master 14d707ae,
legacy's union box route holds 5 functions under a default that is not nullable and 1 under a
nullable one. On the distilled corpus the nullable-default spelling is the chained
`p.a[x] ?? p.a[y] ?? lit` grid.

Legacy (`emitMapGetOrUnionBox`), past the scalar plan, stashes the hit's box or a null-tagged
box, then on the null tag boxes the default into the slot's union and recovers the stash to
non-null.

## The change

- The arm is a predicate and two writers in `wasmEmit.vl` that legacy and the IR both use:
  `mapGetOrUnionBoxOf`, and `mapGetOrUnionBoxOpen` and `mapGetOrUnionBoxTail` after
  `mapGetOrUnionHead`.
- The IR builds `RMapGetOr` (or the fused `SCoalBox` read) at a new form 5. The default is
  delivered at the map's value rep. The out is that rep under a nullable default, else the box
  inside it (`mapBoxReadsAt`, `ir.vl`, shared by the builder and verifier).
- Two refusals are left, each named:
  - `map read box default computes`: a computed default under a non-nullable result, which the
    fused read cannot hold since its out is the default's.
  - `print union of a fused map read`: legacy takes the box's print slot before its operand,
    and the fused read's locals would come first.

Row file `tests/ir-shadow-rows/nullable-union-map-read-coalesced.vl`; witness
`tests/cases/maps/nullable-union-map-read-coalesced-keeps-its-box.vl`.

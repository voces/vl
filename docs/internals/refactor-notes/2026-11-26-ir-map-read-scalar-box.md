# A scalar map read with a nullable default is boxed into `T | null` (lane CENSUS, 2026-11-26)

**Mechanism.** `m[k] ?? d` over a null-free scalar-valued map whose default is nullable takes
legacy's `scalarBox` arm (`emitMapGetOrScalarBox`): the probe, a hit's scalar boxed at its own tag
into the union box, the default delivered into `T | null` in the miss arm. The IR refused the arm
(`map read scalarBox`). It is now `RMapGetOr` form 8: built by `mapGetOrScalarBox`
(compiler/ir_build.vl), the default delivered at the read's boxed-nullable rep against
`scalarBoxNullTyOf(ak)`, the type legacy boxes it at; lowered through form 7's head
(`mapScalarJoinOpen`, the same `(ref $uBox)` blocktype bytes). The verifier holds form 8's read at a
boxed nullable (`rnDisc` 4) where form 7's is a box.

**Reading** (census probe; class programs only, regen-10 — 2 programs, both `@start`):

| | before | after |
|---|--:|--:|
| programs with the unit | 2 | 0 |
| of those, claimed under `VL_IR_REQUIRE_CLAIM=1` | 0 | 1 |

`wit/inv1/D2254/w.vl` is claimed, verified and byte-matched. `coalesce-nullable-default-fused.vl`'s
`@start` now first misses `map read mv`: its f64-valued map takes the `mv` arm, a separate class the
`scalarBox` miss masked. Each prints what the base seed prints.

New case `tests/cases/maps/map-read-scalar-box-positions.vl`: top-level binding (hit and miss), a
print argument, a literal key, a function return, a call argument and an i64 map; every unit claimed
and byte-matched.

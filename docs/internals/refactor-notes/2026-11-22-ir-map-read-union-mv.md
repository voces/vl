# IR: a nullable-scalar map value read under `??` (2026-11-22, lane IR-N2)

`map read mv`: on a fixpoint seed of master d5192673, 59 corpus functions miss there alone. An
instrumented seed named the value's mv kind and the default's node. Most are a union-valued map,
`{[string]: f64 | null}`, read as `m[k] ?? d`. Legacy's arm is `mv`, but `mapGetOrMvPlain` declines
a union value.

Legacy writes `emitMapGetOrUnionBox`. It stashes the stored box on a hit or the null-tagged box on
a miss. For a `scalar | null` value with a non-nullable default, it tests the null tag in a
value-typed `if`, writes the default in the result's kind on the null arm, and unboxes and widens
the scalar on the other.

## The change

- `emitMapGetOrUnionBox`'s scalar arm is now a plan and three writers (`wasmEmit.vl`), which legacy
  and the IR both use:
  - `mapGetOrUnionScalarPlanOf`: the scalar's kind, the result kind it widens to, and its value box;
  - `mapGetOrUnionHead`, `mapGetOrUnionScalarOpen` and `mapGetOrUnionScalarTail`.
  A multi-member `… | null`, which boxes its default, keeps legacy's own path.
- The IR builds `RMapGetOr` (or the fused `SCoalBox` read) at a new form 3 where the plan applies.
  The read is at the result kind's rep (`irBAtomKindRep`), the default inline in the miss arm. The
  lowering writes the plan's head, the default and its tail. The verifier admits form 3 with a
  scalar out.

Covered = matched over the `map read mv` census files: 147 → 160. Legacy bytes are identical over
all of them.

Row file `tests/ir-shadow-rows/nullable-scalar-map-read-coalesced.vl`; witness
`tests/cases/maps/nullable-scalar-map-read-coalesced-to-its-scalar.vl`.

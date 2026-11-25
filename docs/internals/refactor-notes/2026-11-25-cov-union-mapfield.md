# IR coverage: `coalesce optional mapField` (lane COV-UNION, 2026-11-25)

`m[k]?.f ?? d` over a map whose value is a record (or a union of record arms): legacy's
`emitCoalesceOptMapField` probes the map, opens an `if` at the field's leaf blocktype on the entry,
reads the field off the entry's non-null value, and writes the default in the `else`.

## Mechanism

The decision and the hit read are extracted from legacy, not mirrored (R8):
`optMapFieldPlanOf(prop, valueRow)` answers the value row's heap, the field's index and the leaf
kind (or the sentence legacy fails with), and `optMapFieldHit(plan)` writes the entry test, the
field read and the `else`. Legacy now calls both, around its own `emitMapPrep` and default.

The builder routes `coalOptArmOf == "mapField"` to `coalOptMapField`: the receiver and key through
`mapRecvKeyOf` (a plain or `i64` key, as `mapGetOr` takes), then the default delivered at the
result's scalar rep into the miss body. It emits `SCoalBox` arm `optMapField`, with the probe in
`cbMap` (`prForm` 0, unused). The lowering writes `mapProbeHead`, `optMapFieldHit`, the default
body, and the `end`. The verifier checks the probe's key and map receiver and a scalar out.

## Measurements

- Class cut of the census (`CENSUS_CLASS=scripts/ir-i8-census/classes/coalesce-optional-mapfield.txt`,
  6 programs), master tree before and this tree after:
  - `coalesce optional mapField` 6 → 0 start rows;
  - start bodies claimed: cases 0 → 2 of 5, witnesses 0 → 1 of 1;
  - three starts move to another class's miss: `store of a field or element write`
    (`map-entry-write-value.vl`), `coalesce niche place` (`optional-field-default-wide-scalars.vl`,
    a `boolean` field's niche re-read), and `coalesce optional after an operand`
    (`store-order-stash-staging-coal.vl`).
- Q58 sweep `tests/cases/maps/opt-map-field-coalesce-in-each-position.vl` (a parameter map, a
  local map, a call's key and default, arithmetic, a loop, a nested `if`, a union-of-records map, a
  global map): before, 3 functions and the start missed `coalesce optional mapField`; after,
  `local` and the start are claimed, `arith` moves to `coalesce optional after an operand` (its
  second read follows a pending product), and `glob` and `nested` stay on `coalesce niche place`
  (a `boolean` field).

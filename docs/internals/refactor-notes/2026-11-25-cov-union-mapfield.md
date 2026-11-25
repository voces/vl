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

# `coalesce nulRef atomJoinStash`

`f() ?? d` where `f()` yields a literal union's `K | null` niche and the result is a union box
(D17182): legacy's `emitCoalesceNulAtomJoin` tees the operand into a scratch slot, tests its `-1`
null opening an `if` at the box, delivers the boxed default, and in the `else` boxes the atom as
its member string.

## Mechanism

Legacy's open and present arms are extracted (`coalNulAtomJoinOpen`, `coalNulAtomJoinPresent`),
and its refusal (`coalNulAtomJoinWhy`) is exported and decides the builder's route. The builder's
`coalNulRef` sends `atomJoinStash` to `coalNulAtomJoin`: the operand at its atom niche, the default
delivered at the box (`boxOwedAt`, as `emitUnionBoxAtRecord` delivers it). The lowering takes the
slot (`widenTmpSlot(4001)`) before the operand, as legacy does, then the open arm, the default
body, and the present arm. The verifier checks an atom-niche operand and a box out.

## Measurements

- Class cut (`scripts/ir-i8-census/classes/coalesce-nulref-atomjoinstash.txt`, 3 programs),
  master tree before and this tree after: `coalesce nulRef atomJoinStash` 4 → 0 (one function
  and three start bodies); every function and start body of the three programs is claimed (3 → 7).
- The class's own `tests/cases/null/coalesce-call-litunion-niche-boxed-positions.vl`: its `f` and
  start body both missed before and both are claimed now.
- Q58 sweep `tests/cases/null/coalesce-call-litunion-niche-boxed-in-each-position.vl` (a call's
  argument, a return, a record field, a list element, an `if` arm, a loop, a nested function):
  before, 6 functions and the start missed `coalesce nulRef atomJoinStash`; after, all are claimed
  but `list`, which moves to `short-circuit array element after another` (its second element
  follows the first's pending value).

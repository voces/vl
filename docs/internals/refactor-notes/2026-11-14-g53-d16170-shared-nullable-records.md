# D16170: a shared read of nullable records of different types boxes as the records or `null`, 2026-11-14

Lane G.

Take `type A = { v: X | null }`, `type B = { v: Y | null }` and `u: A | B`. The read `u.v`, typed
`X | Y | null`, was refused (`field access receiver is not a struct`). The same read without the
`null` (`X | Y`) runs through `sharedFieldStructBoxPlan`, which boxes each member's record under
the read union's arm.

## Mechanism

1. The collect pass registers the union a shared record read is the box of only when the read's
   type is a bare union (`nodeTyIsUnionRow`). A nullable over one registered nothing, so no row
   held an arm at either record's heap.
2. `sharedFieldArmStructTag` required the read type itself to be a union.
3. The box emit tagged a record field under its arm unconditionally. A null ref needs the null
   tag, as the `string | null` arm already does.

## Change (net compiler lines +45; pin-helper delta 0)

- **`emit_collect`**: a shared read typed as a nullable over a union of records registers the
  inner union and the nullable. The nullable is the type a record field holding the read is
  stored at.
- **`emit_obj_lit_fits`**: `sharedFieldArmStructTag` accepts a nullable over a union. A new
  `sharedFieldArmNulRecord` says whether a member declares the record field nullable.
- **`wasmEmit`**: a nullable record field is stashed, tagged by `select(nullTag, armTag,
  ref.is_null)` and boxed. This is the `nulStr` arm's shape, with the record's arm tag.
- No case is added to a mono pin function. The plan generalises the existing bare-union box
  plan to its nullable form, rather than adding a plan.

## Grading

Fixpoint seeds on both sides, `--before` master `94f5055d`.

- The witness prints `true`. One-sided nullable, three records, a non-null value narrowed back,
  a `null` narrowed, a read in a function and a read in a loop all print the right value. Each
  refused before.
- New `shared-field-nullable-records.matrix.vl`: 0 to 70 of 70 run, 0 silent.
- 0 runs→not-runs, 0 silent and 0 traps on all 30 `shared-*` templates and 10 record-union
  neighbours (`mixed-nullable-record-string-list`, `identity-eq-*`,
  `coalesce-declared-union-shared-read`, `is-record-field-union-other-member-order`,
  `struct-holding-arm-with-map-field`, `list-union-field-narrowed-through-place`,
  `inferred-anon-struct-union-field`).
- `rep-fuzz-check.sh`: exact, 0 new, 0 stale.

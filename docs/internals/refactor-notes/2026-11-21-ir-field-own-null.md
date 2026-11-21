# IR: an explicit `null` record field is the field's own null, 2026-11-21

`fieldPlainWhy` refused `structFieldArmOf`'s `explicitNull` arm, so every object literal with a
`null` field value missed as `object field explicitNull`. Legacy writes that field through
`emitOmittedFieldNull`: the same null an omitted field takes.

A probe seed that named each miss's field kind split the 498 corpus functions (master `6851d881`)
by kind: union 409, `string | null` 56, `K | null` 30, nullable variant 2, `boolean | null` 1.

## The change

- `fieldNullOwnOf(si, fi)` in `wasmEmit` decides the null once, as a `NULL_OWN_*` code: the
  `boolean | null`, `K | null` and `string | null` niches, the `null` unit, or the null-tagged
  box of a union with a `null` member. It answers -1 for a typed ref's null (`ref.null $heap`)
  and for a field with no null of its own.
- `emitOmittedFieldNull` writes that code through `emitNullOwn`, whose bytes are the arms it
  replaces. It writes the typed ref nulls as before.
- The IR builds the field as the existing `RNullOf { nuOwn }` at the field's rep.
  `nullOwnRepFits` checks the rep as the verifier's `RNullOf` rule reads it. A typed ref's null
  is the named miss `object field explicitNull typed null`. No IR op is added.

## Readings (merge-base `f44a504b8`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 41,969 | 42,031 (+62) |
| corpus `object field explicitNull` (alone) | 498 (103) | 0; 2 move to `typed null` |
| self-compile functions with no blocker | 19,132 | 19,136 (+4) |
| L2 self-compile fuel | 104,735,784,949 | 104,752,109,324 (+0.016%) |

The corpus gain is smaller than the class because about 320 of its functions also stop at
`null test boxTag` (lane IR-N1).

Legacy lines deleted: 0. Moved to `@ir`: 0.

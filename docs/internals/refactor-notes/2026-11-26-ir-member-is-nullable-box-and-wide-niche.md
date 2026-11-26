# IR: a member `is` at storage over a `U | null` box; a wide arm's niche tag (2026-11-26)

Lane COV-IS, regen-9 classes `is member storage rep` and `box niche with no arm`.

1. `storedMemberBoxTest` (IR only): a field read at its storage may be a boxed `U | null`
   (`boxedNullable`) at its storage's own rep, not only a plain box, as `storedValueTagTest`
   already takes.
2. `nulNicheBoxTagOf` (shared): where the niche's record names no arm (`coalNicheBoxTag` < 0), a
   nullable record wider than an arm takes that arm's tag (`wideArmOfRow`), the tag legacy's
   `emitUnionWideArmBox` writes. Legacy reaches the `nulNiche` writer for it instead of its ladder;
   the two write the same instructions.

Measured:

- Legacy: claimless compilers built from master `903f71519` and from this change (before the
  master merge) build every program in `tests/cases` and the distilled `cells` and `named` sets
  to the same bytes and exit codes: 0 differ.
- Claim whole, byte-identical, and `VL_IR_REQUIRE_CLAIM=1` clean:
  `unions/record-join-place-elimination.vl` `places`,
  `generics/hole-guarded-member-read-through-nullable-field.vl` `chain$1`,
  `soundness/alias-write-ends-place-narrowing.vl` `fieldRetest`,
  `unions/print-box-narrowed-to-null-positions.vl` `field`.
- `objects/record-wider-than-union-arm-boxes-under-arm.vl` `@start` leaves `box niche with no arm`
  and stops at `box ladder`: a `D | B` box into `Pet | null`, its `D` retagged to the wider `A`.
- Sweeps: `tests/cases/unions/nullable-box-field-is-at-storage-positions.vl` (on master 3
  functions miss with `is member storage rep`) and
  `tests/cases/objects/nullable-wider-record-into-union-positions.vl` (on master 4 functions and
  the start body miss with `box niche with no arm`); here every function matches. `ir-parity`
  over both sweeps and the five programs above: same 7.

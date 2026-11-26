# IR: a ladder box retried at the destination's union; `is` over a list element (2026-11-26)

Lane COV-IS, regen-9 class `box ladder`. Stacked on cov-is-43 (#10317).

1. `boxTempIn`: a value whose recorded union plans the ladder is re-planned at the union its
   destination rep holds (`repTyOf(dst)`), and keeps that plan when it is not the ladder. A
   coalesce's right operand `mkB(s)` (`B | null`) records `A | B`, while it is delivered into an
   `A | B | null` box. Legacy boxes it by `emitUnionArmValueBox`'s niche rung, whose null tag is
   the program's (`nullBoxTag`), so it never needed the record to name `null`.
2. `storedBoxTest`: an `is` over a list element (`xs[0] is A`) at its storage tests the element's
   box read at its storage (`storedValueTagTest`), as a local's raw box is tested. A map cell
   stays on `is box not a local`: letting the IR claim `soundness/map-cell-write-renarrows.vl`
   `go` exposes D17663 (a write-renarrowed map cell's `is` is invalid wasm under
   `VL_IR_STRICT=1`).

Measured:

- Over `tests/cases` and `scripts/silent-sweep/distilled/named`, against cov-is-43's seed, only
  `unions/record-join-place-elimination.vl` changes: `places` leaves `box ladder` (its array
  node now matches byte-identical) and stops at `is member storage rep`, `h.f is A`.
- The sweep `tests/cases/unions/nullable-record-coalesce-into-annotated-union-positions.vl`
  (list literal, push, argument, `is` over a list element, top level): on cov-is-43's seed 2
  functions and the start body miss with `box ladder`; here every function matches
  byte-identical. `ir-parity` reads `same` on it and on the regen-9 program.
- Shared plan unchanged, so legacy bytes do not move.

# IR: a ladder box retried at the destination's union; `is` over an element at its storage (2026-11-26)

Lane COV-IS, regen-9 class `box ladder`. Stacked on cov-is-43 (#10317).

1. `boxTempIn`: a value whose recorded union plans the ladder is re-planned at the union its
   destination rep holds (`repTyOf(dst)`), and keeps that plan when it is not the ladder. A
   coalesce's right operand `mkB(s)` (`B | null`) records `A | B`, while it is delivered into an
   `A | B | null` box. Legacy boxes it by `emitUnionArmValueBox`'s niche rung, whose null tag is
   the program's (`nullBoxTag`), so it never needed the record to name `null`.
2. `storedBoxTest`: an `is` over a list element or map cell (`xs[0] is A`, `m["k"] is A`) at
   its storage tests the element's box read at its storage (`storedValueTagTest`), as a local's
   raw box is tested.
3. `mapGetAt`: a map read at its storage is read `whole`, its box past its narrowing. Without
   it the lowering re-derived a write-narrowed cell's member read into the box-typed slot:
   D17663, invalid wasm under `VL_IR_STRICT=1` on master, closed here.

Measured:

- Over `tests/cases` and the distilled `cells` and `named` sets, against cov-is-43's seed, five
  programs change. Four now claim whole and match byte-identical:
  `maps/record-join-place-is-complement.vl` (`go`, `@start`),
  `soundness/map-cell-write-renarrows.vl` (`go`), `unions/else-complement-after-then-call.vl`
  (`@start`) and the new sweep below. In the fifth, `unions/record-join-place-elimination.vl`,
  `places` leaves `box ladder` and stops at `is member storage rep` (`h.f is A`).
- `ir-parity --files` over those five plus the D17663 pin: same 6, differs 0.
- Sweep `tests/cases/unions/nullable-record-coalesce-into-annotated-union-positions.vl` (list
  literal, push, argument, `is` over a list element, top level): on cov-is-43's seed 2 functions
  and the start body miss with `box ladder`.
- Pin `tests/cases/soundness/map-cell-rewritten-is-at-storage-positions.vl` (a string and an
  `i32` member, a second key, top level): on cov-is-43's seed `VL_IR_STRICT=1` exits 70.
- Shared plan unchanged, so legacy bytes do not move.

# IR: a narrowed `string | null` tested against, and read as, a literal set (2026-11-26)

Lane COV-IS, regen-10 class `is literal member str at nullable` (and the `nullable read recover`
miss beside it).

1. `isLitArmsTest`'s `memberEq` arm: a receiver read at a `string | null` whose every member
   compares as a plain string (`litMemberEqArmOf` "str", the receiver narrowed non-null) is
   recovered once (`RRecover`, at least one `ref.as_non_null`) into a local, which each member's
   compare reads (`memberEqRecv`). Legacy tees the recovered receiver into a stash slot and reads
   it per member.
2. `narrowedLocalRead`: a `string | null` local narrowed to a literal set, read where a string is
   wanted, is its recover at `string` (`litSetBaseIsStr`), where it missed `nullable read recover`.

A first cut re-read the receiver through `irReadAgain`, which needed `irReadVar.delete` (the
hoisted read checks `irReadVar` first): `Map.delete` grew the seed by about 40 KB, so the receiver
is held in a local instead.

Measured (against master `50529100c`'s compiler, over `tests/cases` and the distilled `cells` and
`named` sets): four programs change, each `VL_IR_STRICT=1` clean.

- Claim whole: `literal-unions/is-litunion-over-string-receiver.vl` (`pNul`),
  `literal-unions/narrowed-litunion-consumption-forms.vl` (`rNul`),
  `literal-unions/string-cell-narrowed-to-literal-set-reads-its-string.vl` (2 functions that
  missed `nullable read recover`).
- `literal-unions/is-nullable-string-receiver.vl` `pParam` claims; `pMap` stays on
  `is literal arms receiver`, its own class.
- `ir-parity --behaviour-only` over the four: same 4 (bytes differ in locals).
- Sweep `tests/cases/literal-unions/narrowed-nullable-string-is-literal-set-positions.vl`
  (graded by `@log`): on master 4 functions miss with `is literal member str at nullable`; here
  none, and its output is the same under strict IR and on master's seed.

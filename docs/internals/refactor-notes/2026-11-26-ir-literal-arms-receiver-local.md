# IR: a literal-set `is` receiver read once per member is held in a local (2026-11-26)

Lane COV-IS, regen-10 class `is literal arms receiver`.

1. `isLitArmsTest`: a receiver its arm reads more than once (`litArmsReadsOf` > 1) that is a temp
   no read writes again (an element or map read) and reads no effect (`exprEffectFree`) is set
   into a local of its own, which each read takes; it missed `is literal arms receiver`. Legacy
   reads the element or map value again per member; reading it once is the same value.
2. `repLocalValtype` (lowering): a slotless local of a nullable reference rep (`rdNul` 1, its null
   the bottom ref) is declared at its nullable valtype (`fbValtypeNullable`), where it missed
   `unmapped slot`. A nullable ref list or closure still declares none.

Measured (against master `42ca45caf`'s compiler, over `tests/cases` and the distilled `cells` and
`named` sets): three programs change, each `VL_IR_STRICT=1` clean.

- Claim whole, `VL_IR_REQUIRE_CLAIM=1` clean: `literal-unions/is-litunion-arm-non-ident-receivers.vl`
  (`elemForm`), `literal-unions/is-nullable-string-receiver.vl` (`pMap`).
- `literal-unions/map-read-is-else-litunion-arm.vl` `f` leaves `is literal arms receiver` and
  stops at `map get union box rep`.
- `ir-parity --behaviour-only` over the two claimed programs and the sweep: same 3.
- Sweep `tests/cases/literal-unions/literal-set-is-over-element-and-map-read-positions.vl`
  (graded by `@log`): on master 2 functions miss with `is literal arms receiver`; here none, and
  its output is the same under strict IR and on master's seed.

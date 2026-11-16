# IR N2a: a delivered `null` boxes through legacy's writer, 2026-11-16

Lane IR-C. This is the first part of N2, sized by the blocker census on master plus I8b part 2.
`rep null`, a value typed `null` delivered into a boxed nullable (`return null` from an
`i32 | null` function, or a `null` argument), held 495 corpus functions alone. It was the largest
single corpus blocker left. The coordinator ordered it ahead of the atom discipline and `pop`
(N2b) because it adds no rep and extends I8b's seam. `CLAIMED` stays empty, and no emitted byte
moves.

## What landed

- **A `null` literal delivered into a boxed nullable** that the checker records as boxed builds
  `RToBox` with an immediate no-value operand. Any other `null`-typed expression still misses as
  `rep null`. A call returning `null` has an effect, so it is never boxed with its value unread
  (shadow test "a null-typed call delivered into a box is never left unread").
- **The exemption is by operand kind: an immediate may go unread.** Legacy's box writer writes
  the null tag without asking for the value (`emitNulNoneBoxPayload`). It likewise writes a literal
  at the destination width itself: the 8 `d341_nt_f32_*` corpus functions return `1.5` into
  `NtF32 | null`, and with a null-only exemption they fell back as `box value written 0 times`. So
  the lowering requires one read, except that an `OImm` or `OStr` operand may be left unread. Any
  other count is still a fallback.
- **Verifier rule 2 asserts the invariant the exemption rests on.** An `RToBox` whose operand is
  an immediate must stand for an effect-free node (`exprEffectFree`). Self-test case 11, a box
  whose immediate stands for a call, is its failing control. Without the rule it reads rule 0.
- `boxTemp` is the one place the builder appends the box; `widenTo`'s box branch now calls it.

## Coverage

Both readings are on the same 12,223-cell corpus.

| reading | I8b part 2 | this step | gained |
|---|---:|---:|---:|
| corpus covered = matched | 22,034 | 22,529 | +495 |

The self-compile has no `rep null` sole blocker, so its coverage does not move.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the I8b part 2 seed, 12,223 cells | 8,944 identical, 3,279 fail under both, 0 differ |
| mode 3 with `list` admitted (throwaway build) | self-compile byte-identical, the same 2 fallbacks as I8b (`cwRetBlockValues`, `lpJoinArm`); corpus 8,944 identical, 0 differ, 0 fell back |
| shadow and verifier | corpus 22,529 covered, verified and matched; self-test case 11 fails rule 2, and reads rule 0 with the rule removed |
| seed size, part 2 seed to this one | 6,528,447 to 6,529,046 (+599) |

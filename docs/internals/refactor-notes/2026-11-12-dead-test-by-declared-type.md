# An impossible test is an error only by its declared types, 2026-11-12

Lane A (flowrule). Check only; implements the owner ruling recorded in DECISIONS and
`open-rulings.md` (`write-narrowed-dead-test`, RULED).

**The change.** When `is`, a `match` arm or `==` is refused as impossible, the checker compares the
operand's declared (storage) type with the check type (`operandDeclaredTy`, `tyMembersMeet` in
`check_narrow_flow`). If the declared types meet, the impossibility came from flow, and the refusal
is moved to the `dead-test` warning channel (`recordDeadTest`), with "here, so this test is always
false" / "so this arm never runs" appended. Narrowed operands of a downgraded `==` are retyped at
their declared type, so the emitter lowers the comparison it would have without the narrowing. A
redundant `match` arm (one already covered) is a warning everywhere. A `const` scrutinee's
impossible string arm stays an error, worded as `constLitNeverMsg`: declare the const's other
values.

**Matrix** (scratch, {write, guard, match-cover, const, declared} × {is, match arm, ==}): write
and guard rows run with a warning in all three shapes; covered arms run with a warning; const
rows stay errors with the declare-fix message; declared rows stay errors (D2198).

**Sweep** (master cb558bf3a fixpoint seed vs candidate, same tree): 24,194 cells, 24,174 same, 20
output movers, 0 runs → not-runs, 0 new traps. 16 movers are check_reject → runs/check_clean: the
restored spellings (D14302, D3944, D7701 witnesses; 8 tests/cases programs), the two new
`inference/dead-test-*-narrowed-runs.vl` fixtures and the four converted `@warning` fixtures. The
other movers are message-only: `const-arm-errors.vl` and `value-union-bad-arm-errors.vl` now report
their next error first, and `error-const-arm-never-runs.vl` carries the declare-fix message.

**Not restored.** D4018's witness keeps its rewritten spelling (the plain spelling is a different
program, covered by the new fixtures).

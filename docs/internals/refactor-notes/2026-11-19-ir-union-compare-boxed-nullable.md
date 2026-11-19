# IR: a union compare over boxed nullables (2026-11-19)

The census ranked `union compare operand rep` first among function doors, by sole-door lines
over misses behind them: 172 lines in 9 drivers, behind 9 corpus functions. Delta-debugged, every
one is `A | null == A | null` with both operands nullables on the boxed discipline (`rnDisc` 4).
Generics and lambdas are incidental: `function op(a: i32 | null, b: i32 | null) { return a == b }`
missed, and `i32 | string` operands already matched. Legacy holds such a nullable as the union box
(`(ref $box)` locals) and compares it through `unionUnionEqTail`, the tail the IR's `RUnionEq`
already lowers through. The builder took only `RBox` operands; it now also takes a boxed nullable
(`heldAsBox`, over the existing `boxedNullable`).

Measured on fixpoint seeds (armed shadow over the corpus, tests/cases and probes), master 0fffbbb4
against this branch: functions covered = verified = matched 67,046 → 67,055, `uncovered union
compare operand rep` 9 → 0 (and its one start body), mismatch / fail 0 / 0.

## Deleted against moved

Driver census on both seeds. Deleted: 0 lines. Moved to `@ir`: 161 lines, the staged compare's
tail chain (`unionUnionEqTail` 17, `emitUnionBoxEqStagedX` 75, `emitUnionNumCrossArm` 28,
`emitUnionNumCrossArms` 11, `emitUnionArmEq` 16, `unionCloArmCount` 7, `unionArmTagOf` 4,
`unionEqStashSlot2` 3), which the IR's lowering calls. Reached by nothing under the claim but not
deletable: `emitUnionUnionEq` (11, legacy's entry), which every unclaimed function holding a union
compare still falls back to. The moved lines delete with the I5 rewrite (equality per closed rep,
lowered by the IR), or once legacy's entry routes to the IR's lowering (an op-seam slice over
`irLowerNodeIn`, `2026-11-19-ir-seam-frame-model.md`).

## Why the census ranking overstated this door

A census door's `value` and `decide` rows reached through a shared tail move to `@ir` when the IR
lowers through that tail; only rows the IR replaces outright delete. A driver that drops to zero
hits under the claim still deletes only when no function holding its construct can fall back:
legacy is a whole-function fallback. The next ranking counts legacy dispatch arms the IR builds
at every occurrence (`ir-design-2026-11.md` §10), not census-freed lines.

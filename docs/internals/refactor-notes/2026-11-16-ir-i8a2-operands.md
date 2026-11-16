# IR I8a part 2: mixed-width operator operands (coverage step), 2026-11-16

Lane IR-C. This is the second part of I8a. The design is in `2026-11-16-ir-i8-coercion-ops.md`.
`CLAIMED` stays empty, and no emitted byte moves.

## What landed

A binary operator whose operands have different numeric reps meets at legacy's width for it,
`binNumWidth`, which is now exported. Legacy builds each operand there through
`emitBinOperandAs`: a number literal through its own literal writer, and anything else through
`emitWidened`.

The builder widens each operand through `widenTo` before it builds the next one. `widenTo` is
the helper the deliveries already use, so it is the same `widenPlanOf` / `RNumWiden` /
`numWidenTail` path and adds no new widening decision. Building in that order keeps legacy's
order, left operand then its widening, then the right. Building both operands first would put
the left's widening above the right on the stack.

A literal operand that would change width is a named miss, `widen literal`, decided by legacy's
own test, `numLitAsApplies`. The coordinator asked the design note to say why literals are
misses: legacy writes them at the width itself, and that writer is not shared yet.

## Coverage

| reading | I8a part 1 | this step | gained |
|---|---:|---:|---:|
| corpus covered = matched | 20,583 | 21,460 | +877 |
| self-compile covered | 5,216 | 5,219 | +3 |
| self-compile matched | 5,214 | 5,217 | +3 |

Compiler lines are +57 / −6, 51 net: about 17 covered corpus functions per net line.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the I8a part 1 seed, 12,213 cells | 8,934 identical, 3,279 fail under both, 0 differ |
| shadow | corpus 21,460 of 21,460 matched; self-compile 5,217 of 5,219, two named unlowered |
| mode 3 with `list` admitted (throwaway build) | self-compile 5,217 claimed and byte-identical; corpus 8,934 identical, 0 differ, 0 fell back |
| L2 self-compile fuel, part 1 tree to this tree from one seed | 94,860,858,157 to 94,870,968,904 (+0.011%) |
| seed size | 6,467,969 to 6,468,669 (+700) |

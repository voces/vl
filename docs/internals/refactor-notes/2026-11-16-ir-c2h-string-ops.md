# IR cutover C2h: string operators, char literals and the string list read (coverage step), 2026-11-16

Lane IR-C. A coverage step under the `ir-design-2026-11.md` §10 exemption, sized with the blocker
census. It finishes the string family that C2g started. `CLAIMED` stays empty, and no emitted byte
moves.

## The census fix that came first

`valued tail if` was a census artifact. Under mode 4 the build goes on past a missed statement. A
tail `if` with a missed statement inside it was therefore left with an incomplete arm, which
`irBodyLeaves` read as an arm that yields a value. The builder now tests a tail `if` only when it
built whole (`ibMissesPast`).

| reading | corpus | self-compile |
|---|---:|---:|
| `valued tail if` functions before the fix | 15,618 | 4,976 |
| after the fix | 0 | 0 |

Every pairing with `valued tail if` that C2g's note and the C2h sizing cited was the other class on
its own. On C2g's tree, string classes alone held 357 corpus and 604 self-compile functions.

## What landed

- **String `==`/`!=`, ordering and `+` chains.** Legacy's three operators each split into an operand
  plan and a writer tail, which legacy and the IR both call:
  - equality: `strEqLitOf`, `strEqFirstOf`, `strEqTail`;
  - ordering: `strOrderSwaps`, `strOrderTail`;
  - concat: `strCatPartsOf`, `strCatTail`.

  The builder builds the operands in legacy's push order into `RStrOp`, which now carries its node
  (`soAt`) and the ordering member `lt`. The lowering pushes the operands and recovers each equality
  operand with legacy's `emitEqRecoverNarrowed`, then calls the tail. The verifier admits `RStrOp`
  over string operands only.
- **An assignment legacy writes in place** is a named miss, `string append in place`. Legacy writes
  two kinds this way: the loop accumulator and an append site. The decision is the shared
  `strAssignInPlace`. When legacy has not lowered the function, `strAssignInPlace` first runs
  legacy's accumulator scan, so a claimed body reads the same answer. Mode 3 found this: without the
  scan, a claimed function wrote a plain concat where legacy appended in place.
- **Char literals** are immediates from the shared `charLitCp`.
- **The string list read `xs[i]`.** `emitIndexStrList` splits into `strListHoistOf` and
  `strListGetTail`. The IR takes `idxArmOf`'s `str` arm, and a list of strings is an admitted rep.
- **A void call followed by a valueless `return`** takes the tail form, as legacy writes it. Before,
  the IR wrote `call; return`. Legacy writes `return_call`.
- **A string literal operand has the `str` rep** (`irBOpRep`), so a literal argument, return or
  store is no longer a coercion miss.

## Coverage

Both columns are read from fixpoint seeds of master, with C2g merged, and of this branch.

| reading | master | this step | gained |
|---|---:|---:|---:|
| corpus covered = matched | 15,030 | 15,422 | +392 |
| self-compile covered | 2,897 | 4,384 | +1,487 |
| self-compile matched | 2,893 | 4,379 | +1,486 |

Compiler lines are +319 / −119 over nine files, 200 net. That is about 2 covered corpus functions per
net line and 7.4 on the self-compile.

On the self-compile, the five unlowered functions are the four named before this step, plus one
more `folded global read`.

**Census after the step.** String classes alone now hold 58 corpus and 69 self-compile functions.
Most of those are held by `string append in place`, plus `string atom` and an `operand at string`
whose operand is not a plain string. The corpus string functions are now held mostly by `indirect
call`, which is 2,410 alone. The self-compile singles are `indirect call` 727, `statement` 369,
`expression array` 354, `list length rep` 305, `operator ??` 288 and `callee signature` 231.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the C2g seed, 12,213 cells | 8,934 identical, 3,279 fail under both, 0 differ |
| shadow | corpus 15,422 of 15,422 matched; self-compile 4,379 of 4,384, five named unlowered |
| mode 3 with `list` admitted (throwaway build) | self-compile 4,379 claimed and byte-identical; corpus 8,934 identical, 0 differ, 0 fell back |
| L2 self-compile fuel against a master fixpoint seed | 94,422,807,182 to 94,473,594,030 (+0.054%) |
| seed size | 6,450,324 to 6,453,516 (+3,192) |

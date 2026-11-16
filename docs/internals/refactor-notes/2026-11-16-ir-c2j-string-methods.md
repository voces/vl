# IR cutover C2j: string `.slice` and `.cpLen` (coverage step), 2026-11-16

Lane IR-C. This is a coverage step under the `ir-design-2026-11.md` §10 exemption, sized with the
blocker census. `CLAIMED` stays empty, and no emitted byte moves.

## Sizing

The census's largest single blocker on C2i's tree was `indirect call`: 2,410 corpus functions and
731 on the self-compile. Only 3 of the 7,217 corpus functions it blocked also had `callee signature`,
so it went first. The builder used that one name for every call whose callee is not a plain name. A
throwaway build split it by callee. On the corpus, string `.slice` held 1,692 functions alone and
`.cpLen` 674. On the self-compile, list `.push` held 428 and `.pop` 76. Only 6 were a real call
through a value.

## What landed

- **String `.slice` and `.cpLen`.** Legacy picks a string method by name with `exprIsStrMethod`,
  which the builder shares. The operands are the receiver and the arguments in source order.
  - `emitStrSlice` splits after its operands into `strSliceTail`: the clamp and the view.
  - `emitStrCpLen` splits into `strCpLenTail`: the UTF-8 code point count helper.

  `RStrOp` takes `slice` and the new member `cplen`. The verifier requires a string receiver and
  i32 bounds.
- **A method call is no longer an `indirect call`.** A member callee the IR does not build misses
  as `method <name>`. `indirect call` now means a call through a value.

## Coverage

| reading | C2i | this step | gained |
|---|---:|---:|---:|
| corpus covered = matched | 16,443 | 18,809 | +2,366 |
| self-compile covered | 4,498 | 4,631 | +133 |
| self-compile matched | 4,493 | 4,626 | +133 |

The corpus gain is exactly what the census predicted. Compiler lines are +94 / −46, 48 net. That is
about 49 covered corpus functions per net line.

**Census after the step.** On the self-compile, the largest single blocker is `method push`, at
433. On the corpus, the largest are `assignment target` 703, `call of a non-declaration` 543 and
`statement` 449.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the C2i seed, 12,213 cells | IDENTITY |
| shadow | corpus 18,809 of 18,809 matched; self-compile 4,626 of 4,631, the five named unlowered |
| mode 3 with `list` admitted (throwaway build) | self-compile 4,626 claimed and byte-identical; corpus MODE3 |
| L2 self-compile fuel, C2i tree to this tree from one seed | 94,483,815,726 to 94,504,268,146 (+0.022%) |
| seed size | 6,453,828 to 6,454,656 (+828) |

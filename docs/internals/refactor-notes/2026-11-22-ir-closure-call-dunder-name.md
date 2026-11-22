# IR: a parameter spelled like an intrinsic, 2026-11-22

Lane IR-N6, a slice of `call of a non-declaration`. A parameter named like an intrinsic
(`__memory_grow__`, `__load_i32__`) holding a function value is an ordinary closure binding.
Legacy's `emitCallCoreIdent` takes a builtin arm only where no user binding owns the name, so
it sends such a call to the user-function tail. `callRefPlainKey` refused every `__` name, and
`print`, `fromCodePoint`, the `std:fs` slots and externs, by spelling. That was a guess at
legacy's dispatch, and it refused the IR's closure call wherever the guess and legacy differed.

## The change

- `emitCallCoreIdent`'s builtin dispatch (wasmEmit.vl) is one closed plan, `identCallArmOf`
  (`IdentCallArm`: each spelling-matched arm, then `userFn`). `emitCallCoreIdent` matches on it
  with no `_` arm. The new set is registered in `klSets`.
- `callRefPlainKey` asks `identCallArmOf(...) != "userFn"` in place of its name tests. Both
  emitters now read the same decision.

The new row `tests/ir-shadow-rows/closure-call-binding-spelled-like-intrinsic.vl` has covered and
matched floors of 6 (base: 3).

## Readings (base: master `dfc71b020`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 67,164 | 67,169 |
| armed `tests/cases` covered / matched | 67,164 / 67,163 | 67,169 / 67,168 |
| `tests/cases` `call of a non-declaration` (any / alone) | 345 / 284 | 340 / 279 |
| corpus functions with no blocker | 44,812 | 44,812 |
| corpus `call of a non-declaration` (any / alone) | 21 / 20 | 21 / 20 |
| self-compile functions with no blocker | 19,661 | 19,661 |
| L2 self-compile fuel | 108,981,906,629 | +0.01% |

The three named cells of this shape are covered too, at `start`. On both seeds the armed fail and
mismatch rows are the same three. Armed self is 19,661 covered, verified and matched on both.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,604 |
| `--claimless` | 14,017 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,324 |

Late demands stay at 9 and late tag rows at 307. `tests/vl_ir_shadow_test.ts` passes (227 passed).

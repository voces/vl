# IR: a closure-call argument that is an atom or a scalar list, 2026-11-21

Lane IR-N6, the third slice of `call of a non-declaration`. Stacked on #9419 (the `box` arm). A call
through a function value took legacy's `atom` arm of `emitCallRefArg` for a literal-union (atom)
argument, and its `scalarList` arm for a non-nullable scalar list. Both arms write the argument as
it stands. The IR refused every such call.

## The change

- `callRefArgPlain` (wasmEmit.vl) admits the `atom` arm, and admits the `scalarList` arm when the
  parameter kind is not a nullable scalar list and the argument is a plain list (`plainListArg`:
  no narrowing unbox, not nullable). The general arm's list test reuses `plainListArg`.
- `closureCallAt` (ir_build.vl) builds an `atom` or `scalarList` argument as it stands and refuses
  it unless it is already at the closure's parameter rep (`closureParamRep`).

The new row `tests/ir-shadow-rows/closure-call-atom-list-arg.vl` has covered and matched floors of 6.

## Readings (base: master `a9193b976`, fixpoint; candidate: this branch with #9419, fixpoint)

The base does not hold #9419, so the deltas are the stack's. #9419 alone measured +31 `tests/cases`
functions against `ccb0431c4`; the rest is this slice.

| reading | base | this stack |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 64,777 | 64,863 (+86) |
| armed `tests/cases` covered / matched | 64,777 / 64,776 | 64,863 / 64,862 |
| `tests/cases` `call of a non-declaration` (any / alone) | 460 / 383 | 377 / 302 |
| corpus functions with no blocker | 44,501 | 44,512 |
| corpus `call of a non-declaration` (any / alone) | 60 / 59 | 57 / 56 |
| self-compile functions with no blocker | 19,528 | 19,531 |
| L2 self-compile fuel | 107,133,900,953 | 107,168,533,211 (+0.03%) |

The armed fail and mismatch rows are the same three on both seeds; armed self is 19,531 covered
and matched (base 19,530). Identity: `--names` 9,037 identical with 0 differing, `--cases` 7,590
with 0 differing (witnesses 60, 0 differing), `--claimless` 14,014 with 0 differing, mode 3 corpus
9,037 with 0 differing and mode 3 self identical, and the `tests/cases` A/B 7,310 with 0 differing.
Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes.

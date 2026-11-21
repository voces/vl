# IR: a closure-call argument into a union parameter, boxed at that parameter, 2026-11-21

Lane IR-N6, the second slice of `call of a non-declaration`. A call through a function value
whose parameter is a value union took legacy's `box` arm of `emitCallRefArg`. That arm writes
`emitUnionBoxAtRecord`: the checker's recorded box when there is one, else an existing union
passed as its own box. The IR refused every such call.

## The change

- `callRefArgPlain` (wasmEmit.vl) admits the `box` arm, so `callRefPlainKey` keys the call.
- `closureCallAt` (ir_build.vl) delivers a `box`-arm argument at the closure's own parameter rep
  (`closureParamRep`, `RClosure.rcParams[i]`). It uses the shared box plan `deliver` already uses
  for a recorded box (`boxTemp`), and refuses an argument whose delivery lands at another rep.

The new row `tests/ir-shadow-rows/closure-call-box-arg.vl` has covered and matched floors of 4
(base: 3, with `go` refused as `call of a non-declaration`).

## Readings (base: master `ccb0431c4`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 64,308 | 64,339 (+31) |
| armed `tests/cases` covered / matched | 64,308 / 64,307 | 64,339 / 64,338 |
| `tests/cases` `call of a non-declaration` (any / alone) | 518 / 434 | 488 / 404 |
| corpus functions with no blocker | 44,449 | 44,460 |
| corpus `call of a non-declaration` (any / alone) | 64 / 61 | 61 / 58 |
| self-compile functions with no blocker | 19,511 | 19,513 |
| L2 self-compile fuel | 106,900,578,168 | 106,931,514,861 (+0.029%) |

The armed fail and mismatch rows are the same three on both seeds; armed self is 19,513 covered
and matched. Identity: `--names` 9,037 identical with 0 differing, `--claimless` 14,014 identical
with 0 differing, and the `tests/cases` A/B 7,309 identical with 0 differing. Late demands stay at
9 and late tag rows at 307.

The base here predates #9410, so its `tests/cases` count starts again at 518. The two slices touch
different arms, and their gains add.

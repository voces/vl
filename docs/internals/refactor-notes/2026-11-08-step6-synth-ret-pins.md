# Step 6: three of `synthRetAnnots`' four pins deleted

Measured on 2026-11-08. The first ablation ran on #6774's tip (`1b205e6e`). The final sweep ran on
that branch merged with master `e97619e8`. Base and candidate are fixpoint seeds, and the sweep
covers 23,634 programs.

## The mechanism, by ablation

With all four pins removed, 4 programs went from runs to not-runs, one for each pin. Each of
them now lowers through a typed reader:

| pin | mover | the reader that read `fnRet` | its typed arm |
|---|---|---|---|
| void-adopted lambda | `closures/hole-fn-into-pushed-lambda-bound-by-every-call.vl` (indirect call type mismatch) | `fRetVoid` of a mono instance: `lambdaVoidAdoptedAt` knew only the template's node | mono carries the adoption to the instance it pushes or installs (`voidCtxLambdaCarry`, at the four `fnTagLeafCarry` lines); `recordedVoidFns` reads `lambdaVoidAdoptedAt` |
| element-value-union list | `closures/closure-array-composite-result.vl` (`fieldCloList`: box element read, bare record built) | `buildFnMapClassifyRow`: the recorded `(i32 \| {w: i32})[]` has no rep token, so the expression walk classified the tail as a bare struct list | `fnRetRowLowersAsAnn`: a lambda whose own row is that rung is classified as that type's annotation is |
| union-field struct | `objects/empty-object-all-nullable-runs.vl` (result `{}`'s row, body built `Cfg`) | `criRowByStamp` in `computeRetInference#2` took the row from the `{}` literal's own stamp, the empty struct `E` | the same predicate; `computeRetInference` leaves such a row's columns as written, which is what it does for an annotated function |

`fnRetRowLowersAsAnn` mints a `TypeRef` for the row's type and passes it to the annotation
classifiers (`retAnnKindChain` and its siblings), because they take a node. That node is never
attached to the function, so no other reader sees a `fnRet`.

## What stands

| pin | movers without it | why it stays |
|---|---|---|
| literal-union result (`tyIsLitUnion`) | 1 (`closures/closure-result-map-union.vl`), also on master `e97619e8` | `fnRecordedRetTy` reads the lambda `(q0) => ("lbbzv")` as returning `string`, while its own row reads `K0`. `synthRecordedRetAnnots` then pins `string`, and the body lowers the atom |

A probe at `synthRecordedRetAnnots` prints `rec=string row=#29 rowty=K0`. The fix is in
`fnRecordedRetTy` (`fn_ret_shadow.vl`) or in `synthRecordedRetAnnots`, both in the w68 lane. When
the recorded result is `K0`, this pin and `synthRetAnnots` can be deleted. A typed arm in
`computeRetInference` cannot fix it, because the lambda is pinned before that pass runs.

`synthAnnOfTy` stays: `synthRecordedRetAnnots` calls it.

## Sweep

| | `1b205e6e` base | merged with `e97619e8` |
|---|---|---|
| runs → not-runs | 0 | 0 |
| output movers | 0 | 0 |
| bytes-only | 0 | 0 |

## Cost

| measure | base | this change |
|---|---|---|
| seed bytes (fixpoint), `1b205e6e` | 6,507,576 | 6,508,162 (+586) |
| seed bytes (fixpoint), merged with `e97619e8` | 6,512,640 | 6,513,225 (+585) |

The comment rewrite in `check_inferred_return.vl` leaves the seed byte-identical (`cmp` of two
one-level builds, with and without the edit).

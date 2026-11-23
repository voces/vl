# IR batch: an `is` content check (`isFit`) and the `listFit` rung (2026-11-22, lane IR-N1)

A batch under the coordinator's rule, a commit per mechanism. It is stacked on #9635 (litMember,
boxStash), and both carry the queue tip CC1 `854a13b6`.

## The ablation that sized it

The 52 `uncovered is staged` function rows on `tests/cases` were one message over two causes.
Splitting the miss in `boxTest` gave `n.isFit >= 0` 48 rows and `isRecvStageRep >= 0` 4 rows. Only
the first is built here; the 4 keep the `is staged` miss.

## What landed

- **`isFit`**: a test the checker minted as a content check (a record or map tested against a
  narrower one) is built as that check, `irBExpr(n.isFit)`. `emitIsTest` writes
  `emitExpr(nd.isFit)` after the same decided pre-rungs. The admission predicate is the check's
  rep equal to the bool (`is fit rep` otherwise).
- **`listFit`** (`xs is L[]` over wider elements): a new `RListFitIs {lsV, lsAt}` in the list
  family. `emitListFitAt` is split into a pure plan, `listFitPlanOf` (`lftOk` 0 not that shape,
  -1 refused with `lftWhy`, 1 walked), and its walk, `listFitTail`. `listFitScalarOf` no longer
  emits its own refusal, and `emitListFitAt` refuses with the same message at the same anchor. The
  builder takes the next rung on 0 and misses `is list fit refused` on -1, so it never calls a plan
  that emitFails (D17051's hazard). The lowering writes the operand, then the tail.
  `listFitIsPlanOf` is the plan for an `is` node. Its callers are the builder's `isRung` and the
  lowering's `listFitIs`; `listFitTail`'s are `emitListFitAt` and `listFitIs`.

## Bytes

No legacy byte change was intended, and none moved.

- `ir-identity.sh --names`: self-compile identical; `--cases`: differ 0; `--claimless`: differ 0.
- `tests/cases` A/B against the base: same 8,776, differ 0.
- A program `listFitScalarOf` refuses, `(i32 | string)[] is K[]`, prints the same text at the same
  2:47 anchor under both seeds: "`is` over a list tests its elements, and this list's rep is not
  the one its type names".

## Coverage

Fixpoint seeds of the base (CB1 + #9635 `d92b458e`) and this branch, `tests/cases`, armed shadow.

| class or total | base | this branch |
| --- | ---: | ---: |
| `is staged`: functions / start | 52 / 5 | 4 / 2 |
| `is rung`: functions / start | 18 / 8 | 7 / 0 |
| functions covered = matched | 70,613 | 70,661 |
| start bodies covered = matched | 6,270 | 6,277 |

The self-compile census is unchanged (20,025 of 20,061 with no blocker), and no corpus function
moved (45,325 of 45,678).

## Fuel

L2 self-compile, same-tree: base 114,534,308,966; the `isFit` commit alone 114,543,980,776
(+0.008%); head 114,704,726,050 (+0.149%). The `listFit` commit is the rest (+0.140%). By phase
against the `isFit` tree, checkProgram rises 0.09G, code payload 0.04G and emitModule 0.02G; no
other phase moves by more than 0.02G. No compiler function is newly built by the IR, so this is
the cost of compiling the new source, mostly the `ListFitPlan` record type and its literals.

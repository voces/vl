# IR batch: an impossible `nulTest` and the variant row's discriminant test (2026-11-23, lane IR-N1)

A batch under the coordinator's rule, a commit per mechanism, stacked on #9645.

## The ablation that sized it

`is variant shape` (43 function rows, 16 start bodies on `tests/cases`) was one miss over the
variant rung's `row` arm. Splitting that arm along the new plan gave no fold, no never-fits and no
plain-tag rows: every one was the chain. Splitting the chain by its ingredients gave the tag and
discriminant alone for 15 functions and 13 start bodies, `cross` (cross-row fits) for 15, `shared`
(a row holding several members) for 9, and mixes for the rest. Only the discriminant-only chain is
built here.

## What landed

- **Impossible `nulTest`**: an `is` that can never match a niche-held `T | null` is built as
  `isConstTest(…, 0)`, as legacy's `isConstAfterRecv` writes it: the receiver evaluated and dropped
  when it is no re-readable place, then `false`.
- **`variantRowArmOf`** (`wasmEmit`): the plan of `emitIsTestVariantRow`, which now reads it, with
  the same output. Its arms are `lost`, `foldTrue`, `foldFalse`, `neverFits`, `notUnion`,
  `plainTag`, `discrim` and `chain`. `discrim` requires no shared row, no cross-row fit, a
  discriminant, a re-readable receiver and `variantDiscrimPlanOk` (every needed field has literals
  its storage can compare), so legacy's writer refuses nothing on that arm.
- **`RVariantDiscrim {vdV, vdVi, vdAt}`** in the `box` family. The builder builds the fold, never-fits,
  plain-tag and discrim arms, and misses `is variant row <arm>` for the rest. The discrim operand
  must be a box variable (`is variant discrim receiver`). The lowering writes the variable, the
  arm's tag (`variantTagTail`), then in an `if` each needed field's literals, re-reading the
  variable (`opndAgain`) and comparing with `discrimFieldEqTail`, the tail split out of
  `emitDiscrimFieldEq`.

## Bytes

No legacy byte change was intended, and none moved.

- `--names`: self-compile identical.
- `--cases`: identical 7,664, differ 0.
- `--claimless`: identical 14,026, differ 0.
- `tests/cases` A/B: same 8,778, differ 0.

## Coverage

Fixpoint seeds of #9645 (`313ee3e0`) and this branch, `tests/cases`, armed shadow.

| class or total | base | this branch |
| --- | ---: | ---: |
| `is impossible null test`, functions | 31 | 0 |
| `is variant shape`, functions / start | 43 / 16 | 1 / 0 |
| `is variant row chain`, functions / start | 0 / 0 | 27 / 4 |
| functions covered = matched | 70,790 | 70,835 |
| start bodies covered = matched | 6,309 | 6,317 |
| corpus functions with no blocker (of 45,678) | 45,347 | 45,354 |

The self-compile census is unchanged.

## Fuel

L2 self-compile, same-tree: base 114,891,683,922; head 115,096,805,156 (+0.179%). By phase,
checkProgram rises 0.11G and code payload 0.05G. The emit passes, emitModule and elabPrepare each
rise by 0.01–0.02G, and no other phase moves. No compiler function is newly built by the IR, so
this is the cost of compiling the new source: the plan, its eight-arm type, the node, and their
cases in the IR's matches.

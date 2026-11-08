# Step 7: the assignment-target and rep-uncovered declines, graded and retired

Measured 2026-11-07 on master `b3b5ea10` (#6734, fixpoint base 6,489,923 bytes), 4-core box.

## The instrument

`scripts/col-shadow/run.sh <seed> <out.jsonl>` runs the column shadow (`fnColShadowArm(2)`) over
`tests/cases` and the distilled corpus, four Deno shards, ~20 s; `tally.sh <out> [point]` sums
the classes and `--names <class>` lists the functions. 19,356 files, 13,514 compile with no imports
staged. Post-mono declined functions at the base: 79 (12 assignment target, 32 no token, 17 own
record at a variant, 17 no result recorded, 1 rep uncovered).

## Assignment target's rep differs (12): the walk follows the recorded result, except a paren

Graded with a debug build that printed the walk's columns beside the candidate facts. The target
cell does not decide what the walk answers; the spelling does. `criClassify` peels a returned
`t = e` to its value only when the node is a bare `BinExpr`, so `return (k = "b")` and a tail
`(k = "b")` keep the assignment and the atom pass gives the target's atom, while `k = "b"` and
`return k = "b"` give the recorded string. A module cell (`setTop`) and a captured cell behave
alike. 11 of the 12 already equal the recorded result; `setK` is the parenthesized one.

The parenthesized spelling into a CAPTURED literal-union cell was check-clean invalid wasm on
master (`const set = () => { return (c = "b") }; print(set())`: `expected (ref string), found
i32`). Reading the recorded string fixes it. The module-cell spelling ran at the atom and runs at
the string. `frsAssignTargetsAgree` is deleted; new case
`tests/cases/closures/captured-litunion-paren-return-assign.vl`.

## Rep uncovered (1): an unbound type variable

`generic-list-held-or-returned-written-lambda-called-where-it-fits.vl` `__lambda_3` is written into
a list nothing calls (`n.xs = [pick]` replaces it), so its result stays `pick`'s open `A`. The walk
answers `i32`, the D4551 default. After `monomorphize`, the column reader now reads a bare type
variable at `elabUnboundTpTy(-1, fn, name)`. Before mono it does not: there the open results are
closed later by mono, and the pre-mono shadow keeps counting them as uncovered.

## The column shadow, post settled

| class | before | after |
|---|---|---|
| assignment target's rep differs | 12 | (retired) |
| rep uncovered | 1 | 0 |
| agree str / agree i32 / agree nulclosure | 15 / 458 / 0 | 25 / 459 / 2 |
| declined in total | 79 | 66 |

## Own record at a variant (17): graded, not switched

Same grading build, with the decline lifted in the shadow only: the recorded result agrees with
the walk for 15 of the 17, not 2. The two that differ keep the function's own record because one
call consumes the result at the own type: `record-fresh-call-into-union-destination.vl` `mk1`
(`const e1 = mk1(3)`, then `e1.v / 2` reads `1`) and `distilled/cells/b000378.vl` `mkcall`
(`(mkcall()).r`). Where each call lands is in the write-scan index (`cwIxUpKind`: argument,
binding, element). An un-annotated binding says which record it holds through `recBuildTyIn`:
`inferred-return-identity-literal-also-read-at-own-type.vl`'s `const q1 = d1()` is built at `J`
(D8380), `e1` at nothing (its own record). That is the next PR.

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,489,923 → 6,489,262 (−661) |
| `scripts/sweep.vl` diff, 23,614 cells | 23,611 same, 2 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 traps, 1 new |

The 2 bytes-only movers are both `setK`: `functions/return-assign-expression-global.vl` and
D14799's witness. D14799's `setK` half (recorded `>S`, lowered `>i`) now lowers at the string.

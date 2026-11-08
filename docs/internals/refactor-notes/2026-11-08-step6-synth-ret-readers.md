# Step 6: `synthRetAnnots` narrowed to three pins, its readers on the lambda's own row

Measured on 2026-11-08 at `fd652e7b` (master `cbc9406c` with #6758 merged) over the sweep
population (23,615 programs). Base and candidate are fixpoint seeds.

## The mechanism, by ablation

Making the whole pass a no-op moved 51 programs runs → not-runs (49 invalid wasm) and 11
bytes-only, as #6758 measured. A per-branch ablation over the 51:

| branch | movers alone |
|---|---|
| boxed-union rung | 46 |
| rungs after the nullable rung | 3 |
| void-adopted lambda | 1 |
| nullable rung, joined-record (D2731), general adoption rung | 0 each |
| (needed two branches at once) | 1 |

Minimising the boxed-union movers gave one reader. `retFlagsSeedResult`'s inferred arm, which
boxes each returned value into the union, keys the checker's inferred-return row by
`inferRetFnKey(fnIx, fn.fnName)`. A lambda's row is keyed `#<node>`, but the emitter names a
lambda `__lambda_N`, so the arm found no row. The functype result was the box, and the body
returned the bare struct. Every emitter reader of the row goes through `inferRetFnKey`, so it
now answers `#<node>` when a row exists under it.

Two of the 46 needed a second step. `monomorphize` installs an instance in the lambda's own
`fnStmts` slot (`monoMakeInstanceFirst`) and records no `nodeSrc` for it, so the emitter read
node 57 while the row was under node 42. Every slot write goes through
`buildFnMapNoteFnStmtWrite`, which now records the replaced node (`inferRetNodeCarry`), and
`inferRetFnKey` reads through it.

## What stands

| pin | movers without it | the reader still on `fnRet` |
|---|---|---|
| void-adopted lambda | 1 | `cloRetKindOf` (`fRetVoid`), on a mono clone pushed to a new slot |
| element-value-union list (`inferRetRungIsParenUnionElemList`) | 1 | element seeding of the box list |
| union-field struct (`tyIsStructWithUnionField`) | 1 | the boxed field slot of the body's `ObjLit` |

The void pin's clone has no `nodeSrc` link that `lambdaVoidAdoptedAt` could follow (tried:
following `nodeSrc` and the slot carry moved nothing). It needs mono to record the clone's
source, or `fRetVoid` to be set from the instance's recorded result.

Deleted with the rest of the ladder: the boxed-union, nullable, nullable-list, nested-list,
litunion-list, map-list, scalar-list, struct-list, litunion-field, map-field and plain-struct
rungs, the joined-record branch and the general adoption rung. Also deleted, since only they
called it: eight `inferRetRung*` predicates, `lambdaCtxRetAdoptedAt` with
`noteCtxRetLambda` and its list, `tyIsStructListWithUnionField` and `nameIsSpaceFree`.

## Sweep

| | count |
|---|---|
| runs → not-runs | 0 |
| output movers | 0 |
| bytes-only | 9 (6 cases, 3 inventory) |

`synthAnnOfTy` stays: `synthRecordedRetAnnots` calls it, and this pass never did.

## Cost

| measure | base | this change |
|---|---|---|
| seed bytes (fixpoint) | 6,499,042 | 6,497,823 (−1,219) |

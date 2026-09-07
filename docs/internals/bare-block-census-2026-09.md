# The bare-`Block` census — 2026-09-07

D1900 was a statement ladder that named the four block-BEARING statements (`IfStmt`,
`WhileStmt`, `ForRange`, `ForIn`) and not the block that is a statement in its own right, so a
union spelled only inside a bare `{ … }` registered nothing. This asks the obvious next
question: **which other statement ladders have that hole, and what does each one miss?**

The answer is structural, and it means the population is far smaller than the shape suggests.

## The rewrite is the coverage proof

`drwBareBlock` (`emit_rewrite.vl`, D1253) rewrites a bare `{ … }` statement into
`if true { … }`, and its own comment says why: *"every per-function scratch-frame scan
dispatches on statement kind and has no `Block` arm, so an emit-only lowering compiled against
locals nobody declared."*

It runs as the pass-table row `dispatchRewrite`, which is row 11 of the ordered table in
`emitProgram`. So:

* a pass BEFORE that row can see a bare `Block` statement node;
* a pass AFTER it never can — the node is an `IfStmt` by then, and every statement ladder in
  the compiler has an `IfStmt` arm.

`collectInlineUnions` runs inside `collectU`, row 2. That is why D1900 was real, and it is why
almost nothing else is.

## The derivation is a script

`scripts/block-census.py` derives the population rather than grepping for it. It takes every
function that names at least two of the four block-bearing statements — 73 statement-list walks
over 21 files — and splits them three ways:

| | walks | why it is covered |
| --- | --- | --- |
| names `Block`, or descends via `nodeChildren` | 66 | it has the arm, or the generic child walk reaches the block's statements |
| does neither, reached only AFTER `dispatchRewrite` | 4 | covered by the rewrite — the node is an `if` by then |
| does neither, and reachable BEFORE it | 3 | needs an arm or a hand verdict |

The four covered-by-the-rewrite walks are `emit_sections:collectStartLocals`,
`emit_sections:startFnDetectScratch`, `wasmEmit:emitStmt` and `json_walk:jwArmDisturbs`.

The three that remain each get a hand verdict, because a script cannot give one:

* `symbols.vl:sidOfNode` is not a walk. It maps ONE node to its symbol id, and a `Block` has
  no name, so `-1` is the right answer; its callers do the descending.
* `lint.vl:constantBranchVisit` and `lint.vl:unionLetNoMeltVisit` are lint VISITORS, not walks.
  Their driver `lintWalk` descends every node through `nodeChildren`, so each visitor is
  offered the block's statements individually and neither owes a `Block` arm.

**A root that does not resolve moves every walk under it into the covered column**, which is
how this script could under-report while looking healthy — so it prints the roots it resolved
and exits non-zero on one it could not.

## Measured, not read — and the instrument was validated at both ends

Reading a ladder is not evidence it is reached. A sink (`bcMark`/`bcReport` in `emit_state.vl`)
recorded one tag per ladder a bare `Block` actually arrived at, flushed by one `emitFail` at the
end of `emitProgram`, and the flush carried its own unconditional `CONTROL` tag so a silent run
could not be read as "no ladder was reached".

| program | tags |
| --- | --- |
| any program at all (the flush's control) | `CONTROL` |
| a bare block at module scope | `collectInlineUnionsIn`, `CONTROL` |
| a bare block inside a function | `collectInlineUnionsIn`, `CONTROL` |
| a `return` in a bare block, inferred return type | `collectInlineUnionsIn`, `criWalkStmt`, `CONTROL` |

`collectStartLocals`, `startFnDetectScratch` and `emitStmt` never marked, for any of them —
which is the rewrite doing its job, measured rather than argued.

## What the census found

**One new defect, and it is loud.** [D1901](inventory/D1901.md): `isStmtNode`
(`typecheck.vl`) had the same missing arm, so a body ending in a bare block was read as a VALUE
position. `function a2(): i32 { { return 5 } }` was `expected i32, got void` while the
un-annotated face and the `if true` twin both ran. Closed in the same change.

**One arm added with no witness.** `criWalkStmt` (`emit_classify.vl`, reached from
`computeRetInference`, a pre-rewrite pass) is measurably reached by a bare block, and its ladder
fell through to a bare `0`. No program was found where it produces a wrong answer — `fRetKind`
has other producers (`emit_query.vl`'s `blockHasValuedReturn`, `firstValuedReturn`,
`collectValuedReturnsIn`) that all descend blocks — so the arm is exhaustiveness, not a fix.
That is stated rather than dressed up as a close.

**One question for the owner, not decided here.** A bare block whose tail is a VALUE has no
value: `function k() { { 5 } }` is void, while `function k2() { if true { 5 } }` yields `5`.
The two spellings are the same program after `drwBareBlock`. Whether a bare block should be an
expression is a language-design call — the parser's `looksLikeObject` already has to
disambiguate `{ k: v }` from a block — so it is filed as an open question on D1901's row rather
than settled by a fix.

## Re-running it

```sh
python3 scripts/block-census.py
```

It re-derives the walks and the pass-order cut from the tree, so a new pre-rewrite pass, or a
new statement ladder, changes the number rather than going unnoticed. The live count is
expected to be 3 — `sidOfNode` and the two lint visitors, each with its verdict above —
and anything beyond them is a walk that needs the arm or a reason.

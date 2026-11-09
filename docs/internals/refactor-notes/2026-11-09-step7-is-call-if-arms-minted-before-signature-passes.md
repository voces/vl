# Step 7: collectA#2's IsExpr, Call and IfStmt arms mint ahead of the signature passes

Measured 2026-11-09 on a 4-core box. Both seeds are fixpoints (two builds byte-identical). The
base is #6960's branch (`5db37ed0`). The population is the sweep's 23,767 programs.

## What moved

`collectA`'s walk keeps two arms: `TypeRef` and the held rep (now `collectAHeldRep`, memoised).
The other three arms are functions minted once per node through `nodeMintOnRead`, the hook
#6960 added for list literals:

* `collectAIsExpr`: the empty `K[]` an `is K[]` test hands its arm;
* `collectACallMint`: a tagged-set call's join atoms, an un-annotated `Map()`/`Set()`'s value
  slot, and a top-level array allocator's pair;
* an if-expression's join atoms (`markInferredJoinAtoms`).

`preIndexMintTrees` mints them. It walks the emitted trees (the top-level statements, and each
function in `fnStmts` without descending into a nested declaration), not the whole arena. It runs
at the head of the `collectMapFilterUse` pass.

`emitModule` mints every literal, function bodies included, when the checker recorded a
record-list view source (`refViewSrcTys`). `rvWanted` then sees the union-box row that a function's
literal mints. This is the hazard #6960 named. Its three programs get their view helpers back.

## Why these arms cannot mint at function entry

They were moved to the function-entry mint first, the way #6960 moved literals. That lost 131
programs, and each loss was a row that cannot be taken after the type indices:

* An un-annotated `Map()`'s value slot: `a late map list row has no value map struct`, or
  invalid wasm. 128 of the 131 programs contain a `Map()` or `Set()`.
* The struct row of an `is { y: string }[]` arm's anonymous record:
  `ref valtype with no interned shape`.

Minting at `emitModule` start, before the type indices, still lost 4 programs. Their first readers
are `collectMapFilterUse`, `collectFnValUse` and `collectCloSigs`, which intern closure signatures
over these rows (`a function-value call has no interned signature`). So the mint runs just before
the first of those passes.

The held-rep arm, moved into the same pre-index walk, lost 10 programs. All 10 are tagged
function-set programs, and their rows are read before `collectMapFilterUse`. The held-rep arm is
lane w212's (function-value rows), so it stays in the walk.

| step | runs lost | new traps |
| --- | --- | --- |
| IsExpr and Call arms at function entry | 131 | 111 |
| … at `emitModule` start | 4 | 0 |
| … before `collectMapFilterUse`, with IfStmt and the held rep | 10 | 6 |
| held rep back in the walk | **0** | **0** |

## Proof

* Sweep diff against base: 23,661 same, **0 runs → not-runs, 0 new traps, 0 output movers**,
  106 bytes-only movers. Each mover was built on both seeds and disassembled with `wasm-dis`:
  * **103 reorder rows.** Their disassembly is identical once indices are renumbered and the lines
    are sorted.
  * **3 regain the record-list view helpers.** Each grows by 64 bytes, from 364 to 428:
    `list-two-unions-no-elem-read`, `d741_w5_no_narrow` and `d853_two_unions_no_elem_read`.
    This is base's own mover reversed, back to the module master builds.

## What stands

* **The `TypeRef` arm.** It mints map slots and annotation rows before the type indices, and it is
  the walk's loud refusal (`checkArrName`). Every annotation in the arena reaches it, including
  struct fields and orphaned parser nodes that no emitted tree holds.
* **The held-rep arm.** This is lane w212's, for the reason above.
* **`collectAFieldTables`.**
* **The late-row gap.** Late ref-list rows work (`rlPairsLate`). Late mv slots and late anonymous
  struct rows do not, and these arms can only move to a function-entry reader once they do.

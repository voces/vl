# Step 7: the `buildFnMap#2` pass row is deleted

Measured 2026-11-10 on master `61d7d912` (#7091). Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). Follows
[2026-11-10-step7-fnmap-annotated-cols](2026-11-10-step7-fnmap-annotated-cols.md), which left
`buildFnMap#2` running after the three synthesis passes.

## What moved

`buildFnMap#2` ran `recordRetTys` and then re-classified every `fnStmts` row from scratch,
name index included, after `synthVoidTwins`, `synthExternValues` and `synthRecEqCores`. Now:

- **The three synthesis passes write their own rows.** Each appends through `fnStmtsAppendTop`
  (`emit_collect.vl`), which pushes `fnStmts`/`fnParent`/`fnDispNames` and writes the
  function's name index entry, nested mark and annotated return columns as it lands. This is
  the shape mono's resumable `buildFnMap` already has: a row is written by whoever adds it.
- **The return columns are re-read once after mono, inside a walk that already ran.**
  `recordedVoidFns` visits every row. At `recordedVoidFns#2` it first re-reads each row off
  its declaration (`buildFnMapRowOfRetAnn`), then decides an un-annotated row's voidness as
  before. That runs where `#2` ran, ahead of `fnRetColsFromRecorded`'s list-row demands, so
  it sees the same rows. `recordRetTys` is the arm's first statement.
- **The pass row is deleted:** the `"buildFnMap#2"` arm, its `EmitPass` member, its table row,
  the `needs` edges naming it (now `recordedVoidFns#2`), and `lint.vl`'s `klEmitPass` copy.

Seed: 6,600,459 → 6,599,818 bytes (−641). `seed-size.vl --check` reads +0.2% against its baseline.

## Why the columns still need one post-mono read

The shadow (below) named three ways a row banked by mono's last `buildFnMap` resume is stale
by the time the emitter reads it. Each needs a fact that does not exist yet when mono banks
the row:

| stale column | why | witness |
| --- | --- | --- |
| `fRetRArrElem`, annotated `X[]` | the shape passes mint the list row after mono; the banked row holds `""` | self-build: 21 rows (`rowsOf: RelRow[]`, `cxmDivmod: i32[][]`, `lkLifted: LinkFn[]`, …) |
| `fRetStructIdx`, annotated record | a generic's declared `T \| K` field registers its union at the instance, after mono (D7040); the banked row names an earlier row | `generics/declared-return-holds-litunion-beside-type-param.vl`, `…-inline-litunion-…` |
| `fRetBool` (and the rest), stubbed template | mono stubs a dead generic template in place, un-annotated, after its last resume; the banked row still reads the template's `: boolean` | `std:array`'s `includes`/`some`/`every`, in many distilled cells |

So the columns are not "kept where computed" in full: for those rows the fact is computed
after mono. The re-read is the place a later fact lands. It is not a new walk; one walk and one
pass row are gone.

## A cross-program leak the re-read had been masking

The first candidate re-read only the annotated rows. On one instance shared across programs (the
`cases_wasm` harness, the LSP and the playground), it failed 10 cases with invalid wasm. A
lone predecessor was enough: `closures/array-struct-nullable-closure-field.vl` then
`closures/assign-value-into-shared-cell.vl` marked the second program's `k` void. Round-1
`recordedVoidFns` asks `fnPosResultUnconsumed`, which read `monoOrigNode`. That table is cleared
only when mono starts, so round 1 saw the previous program's. `#2` had re-decided voidness from
zero after mono, which hid the leak from the output. Pre-mono readers of `fRetVoid` still saw it.

Two changes:

- `collectFns` clears `monoOrigNode` beside its partner `fnInstOrigin`. That is what a fresh
  instance holds there. With it, round 1 no longer voids `k`.
- The post-mono re-read covers every row, un-annotated ones too, so voidness is decided again
  after mono, as `#2` did.

## What `buildFnMap` is now

- the `fnIndexBySid` / `nestedNameBySid` name index. **By design**: it maps a declaration's
  name to its `fnStmts` position. That is a name index, not a type fact, and the checker has
  nothing to answer it with;
- the row loop and the resume machinery mono arms, run before mono and on mono's rounds only.

## The shadow

A probe compiler snapshotted the columns the new tree carries at `recordedVoidFns#2`. It then ran
the old sequence on the side (`recordRetTys`, a full `buildFnMap`, `recordedVoidFns`,
`fnRetColsFromRecorded`) and compared every return column, the name index and the nested marks,
row by row. The population was the self-build plus the 19,511 programs under `tests/cases`,
`distilled/cells` and `distilled/named`, each on a fresh instance.

| candidate | disagreements |
| --- | --- |
| synthesis rows written at append, nothing else | self-build: 21 rows, `elem` |
| … plus an element read at `repOfFnSlot` (since dropped) | corpus: the stubbed std templates, `bool` |
| … plus a row rewrite at the stub site (since dropped) | corpus: 2 files, `sidx` |
| the re-read at `recordedVoidFns#2` | **0**, self-build and corpus |

One corpus round reported un-annotated `reflist` rows as well. That was the probe's own order:
its side run skipped `recordRetTys` before the full rebuild, which `#2` did not. The rows vanished
once the side run matched. The probe fired on `a000093.vl` before the stub fix, which is its
known-firing control.

## Proof

- **Byte identity:** every `tests/cases` program built by the master seed and by the candidate
  (`scripts/id-shadow/run.sh --identity`): **7,700 of 7,700 same**.
- **L1 = L2:** the master seed and the candidate build byte-identical compilers from this tree.
- **Gates:** all pass.
  - rep-fuzz is exact.
  - `lint-self.sh` passes. Its arena-scan reading (24) is #7091's `emit_rewrite.vl` fall.
  - late demands: 6, the baseline.
  - The dead-export budget is 0.
  - The render-parse budget is 41 / 79.
  - `cases_wasm_0..3`: 7,408 passed. These shards are the shared-instance population the
    leak above failed.
  - The inventory refs and rows tests, `budget_pin_helper_test.ts`, `vl_scaling_shape_test.ts`,
    `vl_probe_rollback_test.ts` and `vl_memo_generation_test.ts`: 109 passed.
  - `check-filed-witnesses --strict` on both inventories: 0 output mismatches.
  - The emitter-state audit: no module-scope `let` is added.

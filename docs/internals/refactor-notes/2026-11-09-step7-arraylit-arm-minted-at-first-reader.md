# Step 7: collectA#2's ArrayLit arm is deleted; a list literal mints at its first reader

Measured 2026-11-09 on a 4-core box. Both seeds are fixpoints (two builds byte-identical): base is
master `9145924e`, the candidate is this branch. The population is the sweep's 23,761 programs.

## What moved

`collectA`'s walk no longer runs `collectAArrayLit`. The walk installs `arrLitMintOnRead` behind
the `arrLitMint` hook in `emit_state.vl`. It runs `collectAArrayLit` for one literal, once,
outside any instance frame, as the walk did. `rlMvTablesReset` removes the hook
(`arrLitMintOff`). The readers that mint a literal first:

* its own emission (`emitArrUnder`) and its row-slot reads (`arrLitRowSlotIn`, `arrLitRlSlotAt`);
* the function holding it, as that function's code starts (`emitFuncCode`), in node order;
* the top-level statements' literals, as `emitModule` starts;
* the literals in a value a function returns, before `frsRecordedRetCore` reads the result's
  token (`recordRetTys` runs at `buildFnMap#2`, ahead of every body);
* the walk's held-rep arm (`fnTagHeldRepOf`), for the node whose rows it twins.

## How each reader was found

A probe seed recorded every ref-list key `rlSlotOfKey` and `rlSlotByNameK` missed after
`collectA#2`, and failed with that key when a late literal mint pushed it. A second build
trapped at the first miss of that key, and its `--names` backtrace named the reader:
`recordRetTys → fnRecordedRetTy → frsRecordedRetCore → repSigRetTokOfTy → rlSlotOfTy`.

The probe flagged 1,050 programs, and only 21 of the 72 still lost were among them. The rest of
the 72 fell to two causes the probe could not see:

* **The `rlRowsMinted()` floors.** Fourteen sites ask whether any row exists before emitting
  their receiver (`emitIndexRefList` is one). With no row yet, they refuse. A per-reader fix
  would touch every one of them. The function-entry mint covers all fourteen.
* **Twin order in the walk.** Minting top-level literals at the end of `collectA` lost the same
  programs, and minting them at its start did not. The held-rep arm mints the held record-list
  row, and a literal minted after it takes a second, equal struct
  (`expected (ref null $3), found (ref $2)`).

| step | runs lost | new traps |
| --- | --- | --- |
| WIP (emission and row-slot triggers) | 166 | 82 |
| + returned literals before `frsRecordedRetCore` | 72 | 10 |
| + function entry, module start, held-rep arm | 1 | 1 |
| + the returned value's whole subtree (`if` arms) | **0** | **0** |

## Proof

* Sweep diff, base against candidate: 23,475 same, **0 runs → not-runs, 0 new traps**, 1 output
  mover, 285 bytes-only movers.
* The output mover is `tests/cases/lists/error-list-literal-two-unions-and-record-list.vl`, an
  `@emit-error` case. Its refusal now names the declared twin `Circle[]` where it named
  `{r:i32}[]`. The directive's substring still matches.
* All 285 bytes-only movers run with base's output. Each one was rebuilt on both seeds and
  disassembled with `wasm-dis`:
  * **278 reorder rows.** They have the same bytes, and the disassembly is identical once type
    indices are renumbered and lines sorted.
  * **3 reserve no view helpers** (428 → 364 bytes: `list-two-unions-no-elem-read`,
    `d741_w5_no_narrow`, `d853_two_unions_no_elem_read`). `rvWanted` is asked in
    `assignSharedHelperIndices`, before any function body mints. In these programs the
    union-box row comes only from a literal inside a function, and none of their deliveries
    lowers as a view. The 13 view-using `tests/cases` agree on both seeds, as do two probes
    with the view inside a function.
  * **3 gain one unread ref-list pair** (+13 bytes: the two spread-into-union cases and
    `nested-list-literal-union-element-runs`).
  * **1 drops one unused function type** (−6 bytes: `nested-array-inferred-empty-nested-ref-leaf`).

## What stands

The walk's other arms (TypeRef, Call, IfStmt, IsExpr, held rep) and `collectAFieldTables`.
`rvWanted` answers from the rows that exist when helper indices are assigned. A program whose
only union-box row comes from a function's literal, and that needs a view, would get none. No
program in the population is one.

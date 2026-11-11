# Step 7 L2 §7: fifteen element-read readers take a ref-list row's union from its type, 2026-11-11

A union-box ref-list row stores the spelling of whichever caller minted it first (`rlElemName`).
Fifteen readers took that spelling as the element's union name, arms or shape. D15711 shows the
hazard: a row shared by type key answers a placeholder name. This PR has those readers ask the
registry with the row's type. It is a reader of the union registry, not a change to it. Base is master
`2b890263`. Counts are **programs** over the sweep's 23,885.

## Changed

- `rlElemUnionName(slot)` (`emit_union_registry.vl`) is the registry row the row's type finds
  (`unRowOfKeyOrMembers(rlElemTyIx[slot])`), where that row is the only one of its member multiset
  (`unRowSoleOfMembers`, over `unTyKey`). Otherwise it is the stored name.
- These readers call it: `rlUnionNameOfTy`, `indexElemUnionName`, `unionNameOfIndex`,
  `unionNameOfCall` and `spreadSrcBoxes` (`emit_classify.vl`); `idxStoreClassify`, `emitListEqGCore`,
  `xrepElemEq` (both sides), `staleBoxFrom`, `emitStaleBoxRetag` and `emitSpreadGroupBoxed`
  (`wasmEmit.vl`); `unionClosureArrElemUnion`, `unionRefArrayArmSlotForElemAtom` and
  `unionRefArrayArmSlotForNestedElem` (`emit_union_atoms.vl`).

## Measured

The census compared the stored name with the type's row name at all fifteen sites. Each probe had
its own compiler.

| | programs |
| --- | --- |
| the names agree | all but the 67 below |
| they differ | 65: `rlUnionNameOfTy` 53, `indexElemUnionName` 6, `unionNameOfIndex` 6 |
| the type finds no row | 2 |

The 65 differ by member order (`string|i32` against `i32|string`), by declaration (`Animal` against
`Shape`), by structure against declaration (`{r:i32}|string|null` against `Circle|string|null`), or
by alias against expansion (`U|boolean` against `i32|string|boolean`). The sole-member-set guard was
meant to keep them on the name. It does not, because a row's stored spelling is often not itself a
registry row of that member set. All 65 were built and run with base and candidate: **0 output
changes and 65 byte-identical**. Under this guard every reader is identity on the corpus.

The multi-row case (several registry rows per member set) is w316's. Once its key distinguishes
what box tags depend on, the guard can go.

## Proof

- One refresh, at 6,620,577 bytes.
- `regress.vl` reports no runs lost. These pass: lint-self (with the comment, ladder, sentinel and
  scan budgets), dead-export, render-parse, kind-ladder sets, seed-size, late-demands, rep-fuzz
  (exact), `cases_wasm`, `vl_check_codegen` and `vl_scaling_shape`.
- The full population is graded by CI's Sweep job.

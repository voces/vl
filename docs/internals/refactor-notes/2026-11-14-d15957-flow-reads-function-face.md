# Flow-sensitive reads, the function face: D15956 and D15957 closed, 2026-11-14

Lane D. This builds the face that `2026-11-12-flow-reads-function-face-measured.md` measured.

## What it does

- **The row.** `letFnWriteRow` (check_narrow_flow) runs on a qualifying `let`'s initialiser and
  on each `k = f`. It installs an assignment narrowing row whose type is a fresh copy of `f`'s
  signature holding `f` alone (`elabFnWriteTy`, check_elab_cap). It records which function and
  which storage that type names (`fnWriteAliasNote`, check_scopes). A read whose live row names a
  function is renamed to that function in `checkIdentNode`. Every reader after it, in the checker
  and the emitter, sees a declared function's name. No consumer was changed.
- **Where the row ends:**
  - a write ends the rows of shallower depth, and a write naming no single function ends every row;
  - a join of two rows naming different functions is the binding's storage (`narJoinTys`);
  - any write in a loop body retires the row at the loop head (`crLoopLeavingWrite`);
  - a write target takes storage (`letWriteTargetTy`).
- **Which bindings qualify (`letFnWriteNarrows`):**
  - two or more members, all declared generics, which agree on returning a value (B2, D15015);
  - every write is a statement of the declaring block, storing the name of a function or a read
    of a `let`;
  - no nested function names the binding (`cwLetWritesStraight`, check_write_scan).
- **When it applies.** `compileSrc` and `checkSrc` (driver) retry a program that failed with a
  type error under `fnFlowReadsForce` when the first check met a qualifying binding. A program
  the whole-set typing accepts checks exactly as before. Both typings run the same function at a
  read, so only acceptance moves. The retry is needed because the narrowed reading exposes gaps
  in direct-name spellings that the whole-set path covers, and those would otherwise be
  `runs → not-runs` (below). If the retry fails too, the first typing's diagnostics are
  reported.

## Measured

Against master's fixpoint over 19,769 programs (`tests/cases` plus distilled `cells/` and
`named/`), before the new fixtures:
- 0 `runs → not-runs`, 0 output differences.
- **`error-fn-set-list-shared-by-mutable-closed-list.vl` now runs.** It prints `ss`, `2` and
  `82`, the same as naming `dbl` directly, which master runs. It is legal by the flow-read ruling.
  The fixture is restated with the write in a branch, so D15133's refusal of a function set is
  still pinned. Its straight-line spelling is the new run fixture
  `let-of-generics-repointed-list-shared-by-mutable-closed-list.vl`.
- **`error-void-seeded-let-written-value-fn-result-read.vl` stays refused.** Owner ruling B2
  (D15015) refuses reading the result of a void-seeded binding, so members that disagree on
  returning a value leave the binding unqualified.
- The seven `error-let-of-generic-written-*` fixtures keep their messages.

**What the always-on cut cost.** Before the retry was added, the narrowing applied to every
program. It moved 32 programs from `runs` to not, then 5 once the qualification gate was in. Each
exposed a direct-name gap the whole-set path covers:
- `midT(other)` with a generic handed to a generic parameter called at two types;
- `retV` delivered at a `void` function type;
- a generic with a fixed `i32 | string` parameter delivered at `(i32, boolean) => void`;
- a call literal with an undeclared field, which the direct name refuses by design.

Those spellings are refused on master too. They are not regressions of this change.

## Not done

D16110, the hole-lambda spelling: a lambda has no name to rename a read to.

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
- **Which bindings qualify (`letFnWriteNarrows`, `cwLetWritesStraight`):**
  - two or more members, all declared generics whose parameters are all their own type
    parameters (`fnParamsAllTyParams`), agreeing on returning a value (B2, D15015);
  - every write is a statement of the declaring block, storing the name of a function or a read
    of a `let`;
  - no nested function names the binding and no read of it is a call argument.

  Any other binding keeps its whole set, exactly as before.

## Why those two exclusions

The first cut narrowed every binding. Graded against master over the population, it moved 5
programs from `runs` to not. In each, the read renamed to one function hit a spelling the
whole-set path covers:
- a generic with a fixed `i32 | string` or record parameter delivered at a narrower closed type,
  where the direct name is refused on master (D16181);
- a read handed to a generic parameter called at two types, which reached mono's one-closure
  refusal (D16182);
- `retV` delivered at a `void` type, now kept out by the B2 test.

A binding with a concrete-parameter member, or with a read passed as an argument, is tested
locally from its own declarations and occurrences and stays on the whole set. A driver-level
retry that applied the narrowing only to refused programs was tried and dropped: it made a
binding's typing depend on errors elsewhere in the program.

## Measured

Against master's fixpoint over 19,769 programs (`tests/cases` plus distilled `cells/` and
`named/`), before the new fixtures:
- 0 `runs → not-runs`, 0 output differences.
- **`error-fn-set-list-shared-by-mutable-closed-list.vl` now runs.** It prints `ss`, `2` and `82`,
  as naming `dbl` directly does on master, so it is legal by the flow-read ruling. The fixture is
  restated with the write in a branch, which keeps D15133's refusal of a function set pinned. Its
  straight-line spelling is the new run fixture
  `let-of-generics-repointed-list-shared-by-mutable-closed-list.vl`.
- **`error-void-seeded-let-written-value-fn-result-read.vl` stays refused**, by B2.
- **Four `error-let-of-generic-written-*` fixtures keep refusing, with the message of the one
  function the read holds:**
  - `delivered-in-array-literal` and `delivered-in-record-field`: `plus` is not closed by
    `boolean`;
  - `generic-params-by-position`: argument 1, the `true` that reaches `b + 1`;
  - `repeated-tparam-argument-misfit`: argument 1 against `w`'s shared `A`.

  Their `@error` lines are updated.

## Not done

D16180, the hole-lambda spelling: a lambda has no name to rename a read to.

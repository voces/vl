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

## Graded on the merged tree

Merged with master `de4cfa15`. Fixpoint seeds on both sides.

- **A loss the earlier measurement missed, fixed here.** Master's
  `written-let-of-generics-handed-to-generic-callback-between-writes.vl` (D3942) stopped running.
  In a generic body, `fvaAdapt` moves the argument `k` of `callT(k, x)` into a `const` copy. The
  instance re-check then saw no call argument, so the binding became eligible halfway through
  the compile. `cwLetWritesStraight` is now taken once per binding, at its first write
  (`letWritesStraightOnce`). The members' types are still read on every write: an on-demand
  check of an un-annotated `return k` body runs before the nested generics have types.
- **`tests/cases`, all 8,008 files:** 0 `runs → not-runs`, 0 output changes among programs that
  run. Three programs now run (the new fixtures). Six refusals keep refusing with a moved
  message: the four restated `@error` lines, plus two whose `@error` substring still matches.
- **The four restated D3968 fixtures** refuse on both seeds. Each new message is
  byte-identical to master's refusal of the direct name (`[plus]`, `{ f: plus }`,
  `w(true, 5)`, `w(5, true)`), so each expectation was wrong under the ruling. No working
  program was lost.
- **Matrix:** `fn-let-read-after-repoint-generic.matrix.vl` is new, the generic re-point beside
  the lambda one. It runs 40 of 46 after and 0 before. The six open cells are `argument`,
  `array_push` and `map_set`, in both faces: a read handed to a call, D16182. Over the 71 templates
  that hold a `let` written with functions: 0 `runs → not-runs`, and no cell moved to silent or
  trap. In `written-fn-binding-*`, 10 cells now run, 6 of them silent on master.
- **regress.vl:** 0 lost. The grades are identical to master's: the distilled corpus has no
  re-pointed generic `let`.
- **L2 self-compile fuel:** 82,536,402,471 against master's 82,330,058,123, which is +0.25%.
  Seed size: +4,835 bytes.
- **Late demands: a renamed read now plans what its name plans.** Before this fix the count rose
  from 0 to 4, 7 and 1 in `fn-set-list-copied-into-closed-list-slots`, `-copied-into-holders` and
  `-mutable-alias-controls`. The literal `[f]`, renamed to `[dbl]`, carries the one-member set
  `{dbl}`. So does the `dbl` that `f = dbl` stores. In `ftCtxOk` that store needs the binding's
  wider set `{id, dbl}` tagged, and no call through `f` remains to try it, so `{dbl}` stayed
  untagged. The emitter then read the list as open, closed it with `elabWrittenValueTy`, and
  instanced the `.map` adapter `fvaListSetCopy` builds at `i32`, after the plan. A store into a
  binding of a wider undecided set is now decided with it, as a join's tail is
  (`ftWiderJoinNeed`, check_fn_tag). The first two files read 0.
  `-mutable-alias-controls` reads 1, and its direct-name spelling (`[dbl]` for `[f]`) reads 1 on
  master. The scan refuses `{dbl}` there because a list holding a set's ids may only be read by
  index, and the copy reads it through `.map`.

## Not done

D16180, the hole-lambda spelling: a lambda has no name to rename a read to.

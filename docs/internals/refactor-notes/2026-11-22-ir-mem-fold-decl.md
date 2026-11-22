# IR: the declaration-time address fold is a function-level miss (2026-11-22, lane IR-N7)

IR-C1, admitting `RMemAccess` to `CLAIMED`, read `--cases` differ 10, all in
`tests/cases/intrinsics/memarg-const-fold-*.vl`.

## Mechanism

Legacy folds a local `const p = K + bounded` used as a memory address:
- **The declaration** writes the bounded part, tees it into a scratch local, and adds `K`
  (`emitMemConstFoldLet`). The frame reserves `fnMemAddrFoldCount` scratch locals, the count
  `maFoldCandidateCount` takes by declaration shape alone, whether or not a memory call reads it.
- **Each folded read** (`memAddrPlanOf`'s `fold` arm) gets the scratch local and `K` in the
  memarg offset, from `maFoldRowOf`, a table filled while the declaration is emitted.

The IR asked only the read's plan:
- Armed, legacy runs first, so the plan says `fold` and the builder misses.
- Claimed, legacy does not run, so the table is empty, the plan says `rest`, and the IR ships
  offset 0 where legacy writes `offset=K`.

The plan feeds `RMemAccess`, the `RSimd` memory arm and `RAtomic` alike. Separately, a qualifying
`const` that no memory call reads still gets legacy's tee and frame locals but not the IR's. That
function is all `scalar`, so it was already claimed with different bytes (`prefix or locals`).

## Change

At the top of `build`, `fnMemAddrFoldCount > 0` misses `memory address fold`. The count is legacy's
own answer, set by `fnDetectScratch` before the claim seam and before legacy's body, so armed and
claimed builds decide alike. A fold read needs a qualifying `const` in the same function, so the
read-level miss is no longer reached.

New cases, so the identity checks see every arm: `memarg-const-fold-simd.vl`,
`memarg-const-fold-atomic.vl` and `memarg-const-fold-unread.vl`.

## Measured

A throwaway claims `RMemAccess`, `RMemOp`, `RSimd`, `RAtomic` and `RTruncSat` as `scalar` (L1,
scratch only):
- on master 898b840d, `--cases` differs on 13 files: the 10 and the 3 new cases;
- here, `--cases` is identical 7,614 with 0 differ.

The miss costs no matched function. Shadow on `tests/cases` against master 898b840d's fixpoint seed:
- covered 68,121 → 68,120, matched 68,119 both;
- the one function that left was the unread case's mismatch, so `fail a claimable function did
  not match` falls from 2 to 1.

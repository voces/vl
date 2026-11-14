# Type hash-cons stage 2a: every empty-collection pin goes through one writer (lane H), 2026-11-14

Stage 2's first PR (`2026-11-14-type-hashcons-design.md` §2.2). The 33 in-place pins of an
empty collection's element, key or value were each a field write followed by its own
`tyMutEpoch` bump, spread over 9 files. They are now calls to `tyPinElem`, `tyPinKey` and
`tyPinVal` (`check_types.vl`), each of which writes and bumps. This is the single point where
stage 2b replaces the write with a hole solve, so that no row changes after its mint.

- **Bumps:** 43 → 13. That is 3 in the writers, plus the 10 non-pin causes stage 2b takes on:
  - 3 function-type patches;
  - 3 placeholder fills;
  - the null-fold tie;
  - the shape-field growth;
  - the null-hole fill;
  - the per-program reset.
- **One bump per write:** a site that wrote two fields under one bump now bumps twice, and
  `settleOpenUnionRows` no longer bumps when it writes nothing. A bump is always safe, and a bump
  with no write changes no arena state.
- **Not converted:** `nulFoldTiedTyAt`'s rewrite of a list element (it rides its caller's bump),
  which is stage 2b's null-fold change.

Measured against this branch's base, `git archive HEAD` built to its own fixpoint:

| reading | value |
|---|---|
| seed | fixpoint; 6,829,428 → 6,829,228 bytes (−200) |
| L2 identity | both seeds build the base's `compiler/entry.vl` byte-identically |
| corpus identity | 1,833 of 1,833 files have the same module and diagnostics: the 596-cell sample, every 10th of the corpus and `tests/cases` files that build an empty `[]`, `Map()` or `Set()` (465), and the 814 generic files |
| L2 guest fuel | 86,627,642,970 → 86,627,724,095 (+0.0001%) |
| L2 peak RSS | unchanged (4,269,524 KB, warm) |
| plumb fuel | main 9,254,830,423, tail 6,704,874,867 |
| net compiler lines | -15 |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
| byte movers | none |

Stage 1's 1e (`tyVarRenameRow` and the `__sh` shadow alias) is deferred to L1's mono rewrite,
by the coordinator's ruling: mono binds type-parameter names to spellings (49 functions take
`tvN`/`tvV`), so nothing row-based can retire those until mono instantiates into IR.

# Step 7 L6 (lane A, for lane G): `isTestedRowIn` answers by type, not by its arm's spelling, 2026-11-12

This is the first cut of the arm readers lane G handed lane A. The base is master `bc74c717`.

## What changed

`isTestedRowIn` (`emit_obj_lit_fits.vl`) found the variant row an `is` test holds. It had two
spelling reads:

- **The result row.** It was `variantIndexOf(uVariants[found])`, the canonical row of the found
  row's spelling. It is now `exactArmRowOfTy(uVarTyIx[found])`, the first row of the found row's
  member type. This is a heap question, and rows of one type share a heap.
- **The two-match refusal.** It refused when two holding rows had different spellings. It now
  refuses when they are on different heaps (`variantHeap`). Comparing member types with `tySame`
  instead refused D14540's twin arms (`{ k: 1, n: i32 } | { k: 2, n: i32 }`). They differ in
  type but share one spelling and one heap, so the heap is the relation the spelling stood for.

## Census

A scratch probe ran both answers at each decision over the sweep list (24,189 programs). These are
program counts.

| decision | agree | differ |
| --- | --- | --- |
| result row (spelling vs `exactArmRowOfTy`) | 1,868 | 12 |
| two-match refusal (spelling vs `tySame`) | 17 | 1 (`numeric-tag-twin-arm-read`, the twin arms above) |

Each of the 12 result differences prints the same output on master and the candidate.

## Sweep

`sweep.vl record`, master seed against the candidate: 24,188 the same, 1 bytes-only mover
(`unions/shared-nullable-literal-field-read.vl`), 0 output movers, 0 runs → not-runs and 0 new
traps.

## The rest of the slice (census, not changed here)

| reader | typed form agrees | differs | uncovered |
| --- | --- | --- | --- |
| `emitUnionWideArmBox` arms, exact row | 6,841 | 178 | 102 |
| `wideRetagPairs` target, exact row | 942 | 1 | 0 |
| `wideRetagPairs` source (its row's members) | 569 | 1 | 474 |
| `leqNoteUnionArms` / `unionArmsNeedCloEq` (expression row) | 1,971 | 3 | 845 |
| `unionBoxEqColumns`, per arm by its type | 30 | 1 | 2 |

The per-union row (`unionArmRowOfTy`) differs from the spelling in about 4% of these sites, against
fewer than 3% for the exact row. Which of the two a tag read should take is being settled with
lane G before those readers move.

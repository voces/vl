# Step 7: a union's ref-array arm row mints at its first read (2026-11-09)

Base: #6992's head merged with master `17fc832d`. Both seeds are fixpoints (two self-compiles,
byte-identical).

## What changed

* `markRefArrayArmsOf` (the union pass) no longer interns each ref-array arm's element row with
  `ensureRefElemTy`. `unMemRefArrArmSlot` mints it on a miss, through a new `rlArmRowMint` hook in
  `emit_state`. That hook is armed beside `rlRowMint` and cleared by `rlRowMintOff`. It is
  `rlRowOfTyMinted` widened to an element that holds a function, whose row the arm's declared type
  decides (`((() => f64) | {w: i32})[]`).
* Five readers that asked `rlSlotOfTy(tyRefArrElemOf(arm))` themselves now ask `unMemRefArrArmSlot`:
  `isArmTagOfTy`, `atomArmSlots`, `listArmWrapOfTy`, the `as` arm payload heap, and
  `markAtomLeafListArms`. Twelve of the sixteen programs lost by the bare deletion were these
  readers missing the row.
* No mint for a literal-union element (`K[]` with `K = 0 | 1`, or a mixed-width numeric literal
  union). A list of literals is built as scalars, so a row minted when `is K[]` reads it holds a
  tag no box carries. D14041 and D14042 then print `9 9` and `7 7` rather than refusing. They stay
  as filed.

## Stands

* A recursive element's arm row is still minted by the union pass, by reading the arm there
  (`tyReachesCycle`). `type J = null | string | J[]` with `xs: J[][]` and `xs.map(...)` reads the
  element row of `J` without asking the arm, and the `J[][]` annotation's inner row is minted
  under `J`'s unfolded spelling, which `rlSlotOfTy(J)` does not find. That loses D4153 and
  `unions/recursive-alias-nested-list-copied-with-map.vl` (`ref valtype with no interned shape`).
  Lead: key the nested list's inner row (`ensureRefElemTys`' `RLK_REF_LIST` arm) by the canonical
  type, so the unfolded and declared spellings are one row.
* A map element's arm row is minted by the union pass too. Its value records would otherwise mint
  struct rows after the type indices, and a struct row has no late mint (item 2):
  `useIt(p: {[string]: {a: f64, f: string | {w: i32}, z: i32}}[] | {w: i32})` refused with
  `the type section wrote 13 rec-group entries, mAssignTypeIndices allocated 8` (rep-fuzz seed 1234).
* The w231 lead (fold the arm element to its canonical type before the lookup) was measured with
  a probe on the fold branch. It fired on 0 of the 23,799 programs, because `repElemId` already
  folds an unrolled copy through `tyUnrollsTo`, so the fold is not in this change. w231's
  std:json:517 loss came from an ungated mint. This mint is gated on `unMemIsRefElemArray`, and
  std:json runs at the fixpoint.
* `internShapeDeepTy` on each ref-array arm stays. Without it, eight `unions/` programs refuse:
  the box tags, the `.map` scratch frame and the `is` arm all read rows it registers.

## Measured

| | base | candidate |
| --- | --- | --- |
| fixpoint seed | 6,590,616 | 6,590,849 (+233) |

The sweep covers 23,799 programs, comparing base and candidate:

* 0 `runs → not-runs` and 0 new compiler traps. `rep-fuzz-check.sh` is exact.
* One message mover, D4937. It still refuses, with `array value does not match any array member
  of the union` instead of `is test but no union type declared`.
* 54 programs move in bytes only, with the same outcome and output.

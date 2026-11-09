# Step 7: classifier round 24, the union ident read and the pop receiver read their cells, 2026-11-09

Round 24 starts from master `4b938caf`, where `classifier-census.vl` reads 51 probed
classifiers, all post-only. It uses round 23's method. A scratch compiler wraps each classifier,
runs it and a typed twin, and counts `SH <fn> =` or `SH <fn> <legacy>/<typed>` under
`$VL_CLS_CENSUS=1` over the 23,806-program sweep population (`--keep`). As round 23 says, the
census needs a host binary from Nov 8 or later (`cargo build --release` in `scripts/vl-host`).

**Shadow** (post-mono, calls):

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `popRefRecvSlot` | the call's `T \| null` type's row (`rlSlotOfTyOrTwin(tyPeelNul(call))`) | 19,997 | 89 |
| `popRefRecvSlot` | the receiver's rep row (`listRowOfExpr`), else its element type's row (shipped) | 20,086 | 0 |
| `unionIdentReadKind` | the read's cell (`identStoreClaimed`) is `union`: the read's atom, else -2 | 539,951 | 77 |
| `unionIdentReadKind` | the read's storage type reps as `union` (`readNarrowedStoreAt`) | 533,551 | 6,477 |
| `exprString`'s ident arm | the first twin, graded on the arm's answer (shipped) | 535,348 | 0 |
| `exprIsBool`'s ident arm | the same | 4,745 | 0 |
| `mfResultSlotOf`'s `.slice`/`.filter` arms | the call type's row, through `rlRowTyOfElem` | 4,512 | 14 (stands) |
| `letTailRowSlot` | the initializer's rep row, else its type's row, else the element's | 8,178 | 341 (stands) |
| `refListSlotOfExpr` | the rep row, else the type's row through `rlRowTyOfElem` | 144,742 | 2,187 (stands) |

**`unionIdentReadKind`'s 77 disagreements are the legacy's.** It asked `unionNameOfRead`, a
by-name walk, whether the read is union typed, then inherited one level of narrowing from an
un-annotated `let`'s initializer (D1013, `letInitNarrowedAtomKind`). In the 60 `-2/-3` reads the
binding is a numeric literal union such as `vv ?? 1` (`coalesce-numeric-binding.vl`). Its rep is
the atom, so the read is no box, as the twin says. In the 17 `-3/-2` and `-3/0` reads the cell is
the box and the name walk finds no union, such as an un-annotated parameter handed `V | null`
(`pop-union-box-generic-pin.vl`, D1882). Both callers fall through on `-3` to rungs that give the
same answer, so neither caller's answer moves. That was measured at the two callers, 540,093 of
540,093 reads.

**Switched:**

* `unionIdentReadKind` asks whether the read's cell is the union box (`identStoreClaimed`) and,
  if so, which atom the checker narrowed the read to (`identReadAtomKindAt`). It no longer
  calls `unionNameOfRead`. `letInitNarrowedAtomKind` had no other caller and is deleted.
* `popRefRecvSlot` still checks for a `.pop()` or `.get(i)` over a ref list. It then reads the
  receiver's rep row (`listRowOfExpr`), else the row its element type keys. It no longer
  recurses through `refListSlotOfExpr`'s ladder.

**Census hygiene.** `unionIdentReadKind`, `popRefRecvSlot` and `identStoreClaimed` go to
`NOT_BLIND`. `identStoreClaimed` reads `identCellVKind`, which round 23 made a typed reader, and
otherwise the binding's own rep (`letBindRep`). The census prints no consistency warnings.

**What stands.**

* `mfResultSlotOf`'s 14 are lists of function values (`generic-fn-list-written-then-called.vl`,
  `hole-fn-list-*`), where the type's row is not the stored one. Those rows belong to the
  function-value lane.
* `letTailRowSlot`'s 341 are rows the type does not key. 304 are in
  `record-call-list-handed-back-by-generic-runs.vl` and D14813, where `keep([mkcall()])` takes
  `Circle`'s rep (`recListRetTakesRep`) while its type is the call's own `{r: null}`. Here the
  legacy answer, row 0, is right. The rep rule's row is not recorded where `listRowOfExpr`
  reads.
* `refListSlotOfExpr`'s 2,187 are mostly the same two families: function-value lists
  (`tests/cases/closures/`, 93 of 175 files) and bundle-record holders.

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master `4b938caf` | 51 | 51 | 0 | 0 | 0 | 0 |
| this PR | 47 | 47 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds. Master `4b938caf` is 6,588,061 bytes and this PR is
6,587,652 (−409). Master `12d10d41`, merged in, is 6,591,394 and this PR is 6,590,983 (−411). On
the merged tree the census reads 47 probed over 23,808 programs, late demands are 6 (the
baseline), and the filed witnesses grade 4,676 of 4,676 as filed.

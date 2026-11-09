# Step 7: classifier round 22, the binding cell kind and two niche side tables, 2026-11-09

Round 22 starts from master `d4901c70`, where `classifier-census.vl` reads 62 probed classifiers,
all post-only, and prints three consistency warnings. It uses the round-20 method. A scratch
compiler wraps each classifier, runs it and a typed twin, and counts `SH <fn> =` or
`SH <fn> <legacy>/<typed>` under `$VL_CLS_CENSUS=1` over the 23,794-program sweep population
(`--keep`).

**Shadow** (post-mono, calls):

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `exprIsStrMethod` | `nodeRepIs(receiver, "str")` | 1,454,711 | 0 |
| `letCellKindGo` | `letBindRepKind ?? "i32"` | 239,282 | 162 |
| `letCellKindGo` | bundle holder, claimed rep, annotation's kind, `letBindRepKind ?? "i32"` | 239,444 | 0 |
| `letInitIsNulLitBox` | `nodeRepIsNulAtom`, and the read's storage reps as `union` | 167,178 | 0 |
| `identCellVKind` | the read's storage type's rep kind | 4,228,236 | 31,711 |
| `identStoreVKind` | the same | 515,153 | 4,548 |
| `globalCellKindGo` | `letCellKind(letIx, -1)` | 48,267 | 0 |
| `letCellSlot` | the type's slot for a `struct` or `variant` cell | 216,097 | 10 |
| `cloValueCallRetKind` | a `Member` callee typed as a function | 38,674 | 788 |

The first `letCellKindGo` twin's 162 disagreements fall into three groups. The bundle holder
(`holderRecordSigs`, D15144) gives 132 `struct/closure` and `struct/nulclosure`. An annotated
literal-union binding gives 23 `i32/str`, where the annotation's kind is the atom's `i32`. An
annotated empty-list join gives 7 `nullist/i32`. In both, the legacy answer is the annotation's.
The second twin keeps the bundle and annotation rungs, which are typed, and drops `letNulBool` and
`letIsMap`. Neither rung ever gave an answer the binding's type did not.

**Switched:**

* `letCellKindGo` reads only the bundle holder, the claimed rep, the annotation's kind and
  `letBindRepKind`. `letNulBool` has no caller left and is deleted, along with `letIsNulBoolAnn`.
* `letInitIsNulLitBox` asks whether the read's storage type (`readNarrowedStoreAt`) reps as the
  union box. It no longer looks at the node's shape.
* `exprIsStrMethod` asks whether the receiver's rep is `str`. It no longer calls `exprString`'s
  post-mono ladder.
* `globalCellKindGo` is deleted. `globalCellKind` memoises `letCellKind(letIx, -1)`. Its `nulnone`
  and `v128` rungs never answered differently. `letInfersV128` and `retV128Flag` have no caller
  left and are deleted.

**The checker's two niche side tables are deleted.** `inferLetNulStrIx` and `inferLetNulBoolIx`
recorded un-annotated `string | null` and `boolean | null` if-bindings for the emitter. The string
one had no reader left, and `letNulBool` was the bool one's only reader. They were also rolled
back. Their truncation, mark fields and `PRB_TABLES` rows go too, and so does `isNulStringTy`,
whose only caller recorded the string table.

**Census hygiene.** `letBindRepKind`, `listOfKind`, `letCellKindGo`, `exprIsStrMethod`,
`letCellKind` and `globalCellKind` go to `NOT_BLIND`. The last two are memos over typed answers.
`bindingIsLitAtom` (`nodeRepIsAtom`, `letBindIsAtom`) and `callIsMapFilter` (`nodeTyAt`) already
read only typed facts. The census's tell list does not name those readers, so they go too. `readCallStoreKind` reads the call's rep, so the census counts it as reading the arena
and its probe goes. Its literal-atom and union rungs stand. The census prints no consistency
warnings.

**What stands.** `identCellVKind` and `identStoreVKind` (31,711 and 4,548 disagreements) answer
for the CELL, not the read. A read of a function name has no cell (`null/closure` 15,034). A
returned bundle's holder is a record (`struct/closure` 3,059). The 11,632 `null/i32` are reads the
legacy ladder finds no cell for, not yet ablated. Their twin is the binding's `letBindRepKind`,
reached through the read's declaration. That is `identDeclOf`, which lane w233 owns.
`letCellSlot`'s 10 are bindings whose `struct` or `variant` row comes from the initializer
(`structIndexOfLet`, `letObjLitVariantIdx`) where the type's slot is -1. `cloValueCallRetKind`'s 788
are mostly `null/i32`, `null/str` and `null/f64`: a field the type calls a function where
`memberIsClosure` says it is not one.

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master `d4901c70` | 62 | 62 | 0 | 0 | 0 | 3 |
| this PR | 53 | 53 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds. Master `18a749a0`, merged in, is 6,591,066 bytes and
this PR is 6,589,264 (−1,802). At `d4901c70` the PR read 6,587,312 against 6,589,101 (−1,789). On
the merged tree the census reads 53 probed over 23,800 programs, and master reads 62. The sweep
is in the PR body.

# Step 7: classifier round 26, the loop variable reads its list's row and the block tail its type, 2026-11-09

Round 26 starts from master `67329a97` (#7021), where `classifier-census.vl` reads 45 probed
classifiers, all post-only. It uses round 25's method. A scratch compiler wraps each classifier,
runs it and a typed twin, and counts `SH <fn> = <tag>` or `SH <fn> <legacy>/<typed> <tag>` under
`$VL_CLS_CENSUS=1` over the 23,814-program sweep population (`--keep`). The cloud image's host
binary needs `cargo build --release` in `scripts/vl-host` first (round 23). A census of the whole
population takes about 2 minutes on 4 cores, so each twin had a run of its own.

**Shadow** (post-mono, calls):

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `forInVarStructIdx` | A: the iterable's rep row (`listRowOfExpr`): `rlElemStructRow`, `rlElemVariantRow`, `rlElemInnerSlot`, `rlElemMapShape`; else `repSlotOfKind(kind, element type)` | 8,439 | 17 |
| `forInVarStructIdx` | B: A, with the struct arm reading the row's own element name (`structIdxOfElemNameTy`) | 8,440 | 16 |
| `forInVarStructIdx` | C: B, with the variant arm reading the arm recorded at the element type first (`variantRowOfOwnRenderTy`) | 8,440 | 16 |
| `forInVarStructIdx` | D: B, with the reflist arm falling back to the ladder's slot when the iterable has no rep row (shipped) | 8,441 | 15 (graded at the consumers) |
| `blockTailIsClosure` | the tail's recorded type is a function and not a tagged set's member (shipped) | 214,765 | 0 |

**What the disagreements are.**

* A's struct miss is `closures/loop-var-inline-record-handed-to-param.vl`: `[{ f: inc1, n: 10 },
  { f: dbl1, n: 20 }]`. The rep row's element is a record holding a function set, and
  `rlElemStructRow` names a narrower row (4) than the one the row's own name keys (7). B reads the
  name and agrees.
* The 15 variant misses are the layout twins round 25 found (`distilled/named/b0165*`, `b0174*`,
  `b0183*`). `Circle` and `Dot` are both `{ r: i32 | null }`. The structural type is one arena type
  for both, so no typed reader can name `Circle`'s row (2) rather than the canonical row (0). C's
  own-render arm finds the canonical row too.
* The reflist miss is `closures/hole-fn-list-reached-through-alias-called-in-callback.vl`: `const ws =
  [[inc0, dbl]]` with hole functions. The type keys no rep row (D15561). Without the fallback, the
  program is an emit refusal: `emitProgram: a ref list's element row does not resolve`.

**Graded at the consumers.** A scratch compiler was built with D in place of the legacy body. It
compiled every program that reaches `forInVarStructIdx` (2,174 files) and was compared with
master's fixpoint seed. 2,172 give byte-identical wasm. The other 2 (`D15353`, `D4089`) give the
same refusal from both. The 15 layout-twin cells are among the identical ones: the two rows share
a heap type.

**Switched.**

* `forInVarStructIdx` is D. It reads the iterated list's rep row, else the slot its element type
  keys, and a `.values()` walk reads the map's vals slot as before. `forInRefArrayStructIdx`,
  `forInRefArrayVariantIdx` and the `$VL_REP_SHADOW` `fivs` pair had no other caller and are
  deleted. It stays probed: the reflist arm's fallback still asks `refListSlotOfExpr` for a list
  of hole functions, and that is the function-value lane's fact.
* `blockTailIsClosure` reads the tail's recorded type. `nodeTyIsFunc` is structural, so a function
  list and a nullable closure are excluded, as `tailValueIsClosure`'s first rung already did. The
  syntactic fallback `exprIsClosureNoLocal` never changed an answer. `tailValueIsClosure` is
  inlined, and `blockTailIsClosure` leaves the probe set because it reads the arena.
* `exprIsClosureNoLocal` then has one caller: `identIsBoundClosureGo`'s arena rung for a body `let`
  with no annotation. No program in the population reaches that rung. It reads the initializer's
  recorded type the same way, and `exprIsClosureNoLocal` and `letDeclIsClosureNoLocal` are deleted.
* `identIsBoundClosureGo` leaves the probe set. Its rungs are the parameter's annotation, the local's
  cell, the capture's cell kind (`capturedKindOf`, `NOT_BLIND` since round 25) and now the recorded
  type. The census warned that it reads an arena producer.

**Census tool.** `classifier-census.vl --callers --keep <dir>` writes `<dir>/sites.tsv` (site number,
caller, file:line). A post-mono caller tally can then be read off the kept chunk rows. The remaining
classifiers' accounting (`2026-11-09-step7-classifiers-remaining.md`) uses it.

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master `67329a97` | 45 | 45 | 0 | 0 | 0 | 0 |
| this PR | 42 | 42 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds (two `refresh-compiler.sh` runs, byte-identical). Master
`67329a97` is 6,595,637 bytes and this PR is 6,594,747 (−890). With master `14b790dd` (#7022–#7024) merged in, master's fixpoint
is 6,597,901 and this PR's is 6,597,010 (−891). On the merged tree the census reads 42 probed over
23,816 programs with no warnings, late demands are 6 (the baseline), and the filed witnesses grade
4,679 of 4,679 as filed.

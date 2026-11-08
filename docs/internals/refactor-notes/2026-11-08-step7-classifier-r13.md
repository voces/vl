# Step 7: classifier round 13, the map-value readers, 2026-11-08

Round 13 takes the post-only classifiers r12 kept (`2026-11-08-step7-classifier-r12.md`), on
master `a66db6c9` with #6817 merged. Counts are calls over the 23,664-program sweep population,
read from `classifier-census.vl --keep` with a scratch shadow per classifier; each agreement is
split by answer.

**The fact r12 named.** A map narrowed by `m is {[string]: string}` keeps the wider value in its
cell, and the map read delivers that cell. The typed reader read the narrowed type. #6811's
`narrowedArmTyAt` answers the opposite question (the arm a read narrowed to). The fact needed is
`readContainerTyAt` (`emit_ty_canon.vl`, new). For a read whose narrowing goes container to
container and lands on a subtype of the storage's value or element, it returns the storage's
container, because a value test converts nothing. Any other narrowing reads its own type, and a
literal reads as its base scalar. The subtype test matters: `q: V[]` at `V = P` narrowed by
`q is f64[]` must bind `f64`, not the stored struct (`is-list-arm-push-for.vl`).

**Shadows** (A: the r12 reader; B: through `readContainerTyAt`):

| classifier | A disagree | B disagree | outcome |
| --- | --- | --- | --- |
| `mapValElemKind` | 9 | 1, a nullable closure value | body typed |
| `forInPairElemKind` | 2 | 1, the same program | body typed |
| `forInElemKind` | 141 | 133 | kept |
| `letIsNulString` | 3 | — | kept |

**The one B disagreement is a trap on master, and the typed reader fixes it.** A map with nullable
closure values, `{[i32]: ((i32) => i32) | null}`, walked as `for k, f in n` or `n.values()`. The
classifier's `MVK_CLOSURE` rung never asked whether the slot is nullable, so the loop variable was a
non-null closure and the stored `null` trapped (`wasm trap: null reference`). The typed reader binds
`nulclosure`. `tests/cases/maps/for-in-nullable-closure-value.vl` pins all three spellings.

**`forInElemKind`'s remaining 133**, ablated by line removal to a witness each:

* `i32/nulbool` (126, 13 programs): `many<T>(x: T)` called with `const nb: boolean | null =
  false`, then `for e in wrap(x)`. The instance's `T` is `boolean | null`. The cell is an `i32`
  either way, and `print` reads the type, so both answers print the same. The typed answer is the
  type's own. Not switched this round, because the sweep has not graded it.
* `str/i32` (7): `function w(a) { if a is K[] { for k in a { print(k) } } }` with
  `type K = "x" | "y"`, called with `["x", "y"]`. At that instance `readNarrowedStoreAt` returns
  the template's hole `_`, not the instance's `string[]`. The missing fact is the narrowed read's
  storage type at a hole instance, at its producer `elabNarrowedFromAt` (`emit_elab.vl`): no
  instance re-checked the read, so it answers `-2`.

`letIsNulString`'s 3 are r12's two programs (a D3290 pin join, a null hole filled by a write).
They were not ablated further this round.

**The 53 "both" with the fewest pre-mono calls** (`--callers`, this PR). Each of the first three has
one pre-mono call from one caller: `exprIsStrConcat` (via `exprString`), `refListElemNameOfExprRaw`
(via `refListElemNameOfExpr`) and `unionNameOfRead` (via `unionNameOfExpr`). After them come
`scalarKindWidth` (4, `exprScalarWidth`), `globalCellKindGo` (5, `globalCellKind`), `letCellKind`
(5, `globalCellKindGo`) and `identStoreClaimed` (5, `identReadAtomKindAt`).

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | uncalled | probed |
| --- | --- | --- | --- | --- | --- |
| master `a66db6c9` with #6817 | 27 | 0 | 53 | 1 | 81 |
| this PR | 25 | 0 | 53 | 1 | 79 |

**Proof.** Both seeds are fixpoints: base 6,515,157 bytes, this PR 6,514,844 (−313). Sweep over
23,664 programs: 23,664 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps, and
the new test only in the candidate. `mvNulListValKind` lost its last caller and is deleted.

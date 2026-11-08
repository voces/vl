# Step 7: classifier round 14, the last pre-mono callers, 2026-11-08

Round 14 starts from master `dfc71a0a` with #6820 (r13) merged. Counts are calls over the
23,671-program sweep population, read from `classifier-census.vl --callers --keep`. The
pre-mono call chains were read from a scratch `--names` seed whose `clsCensusEnter` traps on a
pre-mono entry of the named classifier.

**Who asked before mono.** Every one of the seven "both" classifiers in the brief was asked
through one of four chains:

| chain | classifiers reached | fact it now reads |
| --- | --- | --- |
| `dispatchRewrite` → `drwWalkBin` → `drwFieldRowOf` → `structIndexOfExpr` → `globalCellKind` | `globalCellKindGo`, `letCellKind`, `scalarKindWidth` (via `letInfersV128`) | `drwRecvFieldIsFn`: the checker's field type, as the `[]` and `[]=` arms already did |
| `monoArgTyNameRep` → `exprString` / `exprUnion` on a `??` | `exprIsStrConcat`, `unionNameOfRead`, `globalCellKind` | a closed `??` before mono answers from its checked type (`coalTyIsStr`, `coalesceResultUnionName`) |
| `monoArgTyNameCascade` → `exprIsClosure` → `refListSlotOfExpr` | `refListElemNameOfExprRaw` | `refListElemKind` alone; the slot was asked only to be bound-tested |
| `monoLamPinRetAnn` → … → `identReadAtomKindAt` | `identStoreClaimed` | before mono, `repSigKindOfTy(readNarrowedStoreAt(..))` |

`emit_mono.vl` is not this lane's, so each chain is cut inside the classifier it calls.
`capturedStructIndex` became post-only too: the `drwWalkBin` chain was its only pre-mono asker.

**`forInElemKind` `i32/nulbool` (126).** No program prints differently. Fourteen spellings over
the loop variable of `many<T>(x: T)` at `T = boolean | null`, with `x` false, true and null,
were tried: `print`, a `boolean | null` parameter, a list store, a closure, `==`, `??`, `is`, a
record field, a map value, a rebind, a reassignment, a capture write and a fold. The cell is an
i32 either way. The typed answer binds the niche the type names, and the classifier now returns it.

**`forInElemKind` `str/i32` (7) is not recorded this round.** The fact is r13's: the storage type
of a narrowed read at a hole instance, at `elabNarrowedFromAt`. Producing it means re-checking
the read per instance, which is a producer change and was not attempted.

**Shadows** (r6's method, each agreement split by answer):

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `letIsNulString` | `repSigKindOfTy(letBindTy)` is `nulstr` | 150,264 (465 true) | 3, old F / typed T | body typed |
| `cloValueCallRetKind` | `repSigKindOfTy(nodeTyAt(call))`, same callee shapes | 42,903 (3,258 non-null) | 57 | body typed |
| `exprIsStrConcat` | a `+` whose type at the instance is `string` | 685,654 (47,782 true) | 251, all old T / typed F | kept |

`letIsNulString` and `cloValueCallRetKind`: a scratch compiler that answers typed was run on all 41
disagreeing programs. Each one printed the same as the base, and 38 of the 41 run. Where the two
differ, the old answer is the wrong one: `ws[1]("w")` over `[id, id]` was `i32` off the list's
first pin, and its type says `str`. `isInferLetNulStr` lost its last reader and is deleted. Its
column `inferLetNulStrIx` is still written and rolled back, and nothing reads it.

`exprIsStrConcat`'s 251 come from 41 programs in two families. One is a `+` in a lambda lifted
once and called at two function types (`tests/cases/closures/hole-fn-*`). The other is a `+` over
a type parameter (`tests/cases/constraints/*`, `dbl<T>(x: T) { x + x }` at `T = string`). Read
through `instanceTyOf`, the instance type does not close either family. The missing fact is the
same one `forInElemKind`'s `str/i32` needs: the instance's own re-check of a template node.

**Not reached:** `forInVarStructIdx`, `captureValStructIdx`, `cloPinnedListElemKey`,
`cloArrElemSelfKey`. `letCellSlot` keeps its classifier. Its map-shape answers come from stores
and initializers, and a `Map()` with no annotation has no type that names its shape. Recording
a shape per binding at the elaboration that infers the map would make those answers typed.

**Census** (`classifier-census.vl`):

| tree | post-only | pre-only | both | uncalled | probed |
| --- | --- | --- | --- | --- | --- |
| master `dfc71a0a` with #6820 | 25 | 0 | 53 | 1 | 79 |
| this PR, same base | 29 | 0 | 47 | 1 | 77 |

Six moved from "both" to post-only: five of the seven in the brief, plus `capturedStructIndex`.
Two of the six then got typed bodies and left the probe set. `globalCellKindGo` and
`letCellKind` keep one pre-mono call each, from
`inline-shape-local-beside-declared-twin.vl`. That call comes from `monoArgTyNameRep` asking
`structIndexOfExpr` for an argument's struct row, which is 233 of `structIndexOfExpr`'s 262
pre-mono calls. That ask belongs to `emit_mono.vl`.

**Proof.** Every candidate is a fixpoint seed: base 6,524,947 bytes, this PR 6,524,657 (−290).
Merged with master `419f4333`, it is 6,524,933, also a fixpoint. Each sweep over 23,671 programs
against base: 23,671 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps.

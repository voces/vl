# Step 7 L2 §7: the 41 renders classified, one folded (41 → 40), 2026-11-10

The L2 §7 deviation counts 41 `tyToEmitName` renders in the emitter. §4.1 allows a render whose
spelling is the product: output, such as a diagnostic, a module or function name, or a printable
key. A render the emitter makes in order to decide something is debt. This note puts each of the
41 in one class. It folds one render into the walk's existing render site, and records two
render-or-parse twins that were probed and not cut.

The base is master `e8c87bb0`. The population is the sweep's `cases` population: 7,424
`tests/cases` programs.

## Classes

| class | renders | sites |
| --- | --- | --- |
| **Output: diagnostic** | 7 | `cloCallSigRejectWhat` ×4 (`emit_closure_sites`); `nulNicheIsTestImpossible`, `mapSoftTwinTagFail`, `emitMapUnionPayloadTail` (`wasmEmit`) |
| **Output: TypeRef text recorded beside its type** | 2 | `synthTypeRefOfTy`, `lvSpellOf` (`emit_rewrite`) |
| **Key: a row, slot or walk keyed by spelling** | 11 | `anonMapValName` (mv slot); `cloSigNameOfTy` (closure-sig slot); `nulRefElemEmitName` (box row); `internShapeDeepOfTy`, `internArmShapeRow` (shape walk and arm mint); `mintUnionFieldObjRow` (shape walk, **folded here**); `listUnionEmitName`, `registerRetJoinUnions` (union registry); `nominalizePartOfTy`, `nodeMapArmNominalName` (nominal spellings); `retFlagsSeedResult` (`rf.retUNm`, w287's ret* territory) |
| **Key: a mono pin or instance spelling** | 17 | the `emit_mono` pin producers: `monoListUnionRowName`, `monoSubstAnonShapes`, `monoAnnPinNameOfTy`, `monoI32AtomPinName`, `monoHoleMapPinName`, `monoLitUnionPinOfTy`, `monoFnTyPin`, `monoPinUnionBoxed`, `monoPinAnnSpelling`, `monoPreBindNumJoin`, `monoPinUnionNameOfTy`, `monoInstanceRetSpelling`, `monoMakerTwin`, `monoSigFnTyNameAt`, `monoConcreteFnPinName`, `monoPinLamAtTys`, `monoLamPinName` |
| **Decision: compares a render to a spelled pin** | 3 | `monoDeclRecListPinName` (`w != render`), `monoNarrowedPinName`, `monoNicheWidenedPinName` (render against `wide` / `chosen`) |
| **Decision: render decides a tag** | 1 | `boxTagOfTy` (`emit_rep`), see below |
| **total** | **41** | |

The 20 output renders and the 11 non-mono key renders are by design (§4.1) while their registry
is keyed by spelling. A key render stops being a key when its row is keyed by type (L6), and then
it is deleted, not converted.

The mono pin keys are one seam. A mono instance is keyed by its pins' spelling, so every pin
producer renders. The three pin-comparison decisions sit on the same seam: they compare a
rendered type against a pin that is already a spelling (`wide`, `chosen`, `w`), so there is no
type on the other side to compare against. They go when instances are keyed by type, not one at a
time.

## Folded

`mintUnionFieldObjRow` called `internShapeDeepTy(tyToEmitName(lt), lt)`. That is
`internShapeDeepOfTy(lt)`, the walk's one render site for a caller holding only a type, so the
call now goes through it. This is the same render in one place, not a type cut. The wasm is
byte-identical by construction, and the sweep confirms it.

## Probed, not cut

**`boxTagOfTy`'s fallback** (`valueAtomKind(tyToEmitName(ty))`, reached when `btOfTy` answers
-2): 418 programs reach it. The render answers -1 in all of them but one,
`unions/one-list-member-union-positions.vl`, where `i32[] | K[]` renders as `i32[]` and answers
7. A twin that answers a union's tag only when every member shares one `repCanonId` disagrees
both ways:

- `i32[] | K[]` spells as one list, but the two members have two reps.
- `K[] | J[]` (`unions/two-atom-list-arms-is.vl`) has one rep, but the members spell apart.

The tag is per spelling (D4320). It moves with the union registry, not before.

**`collectATypeRef`'s ref-list arm** (`nameIsRefArray(nd.tyName) || nameIsNulRefList(...)`): 1,161
programs take the arm. A `tyIsRefArray || tyIsNulRefArray` twin of the annotation's row type
disagrees in 9:

- `i32[]` in 7 programs, among them `generics/eq-concat-type-param-under-constructor-runs.vl` and
  `generics/filled-at-numeric-literal-union-type-argument.vl`. The type says ref list and the
  spelling says no. This looks like `tyIsRefArray` admitting a numeric literal-union element.
- `A[]|B[]` (`soundness/inline-same-shape-array-union.vl`).
- `Rec2[]|Rec[]|null` (`generics/nullable-fold-twin-lists-at-every-delivery.vl`).

Three TypeRefs reach the arm with no type: `loops/loop-value.vl` ×2, and
`unions/litunion-nullable-two-aliases-both-spellings.vl`. The twin needs `tyIsRefArray` to
exclude a numeric literal-union element first, and that function has other callers.

## Proof

- **Byte sweep.** `sweep.vl record --population cases` with the master fixpoint and with the
  candidate fixpoint: of 7,424 programs, 7,424 are the same, with 0 bytes-only movers.
- **The render-parse ratchet** goes from 41 to 40 renders (79 parses unchanged), with
  `--write-baseline` in this PR. `#7098` lowers the parses from the same base, so whichever lands
  second re-writes the baseline: 40 renders, 71 parses.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, and `check-filed-witnesses --strict` on both inventories.

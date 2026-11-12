# Step 7: the unowned render-parse sites graded; one render rung deleted, 2026-11-12

The orchestrator assigned this lane the render-parse sites in files no other lane owns. The list
comes from `render-parse-census.vl --findings` on master `30871c53` (#7349), which reports 78
sites in all. Each site below is graded by what its spelling is for. A probe (one `fambNote` per
program, reported by an override at the end of `emitProgram`) measured the four sites that looked
convertible. The population is 23,947 programs.

## The grading

| site | kind | grade |
| --- | --- | --- |
| `anonMapValNameable` (`emit_anon_fields`) | render | **deleted**: entered in 77 programs, the render rung reached in 0 |
| `cloCallSigRejectWhat` ×4 (`emit_closure_sites`) | render | BY DESIGN: it builds a refusal's diagnostic text |
| `nulNicheIsTestImpossible`, `mapSoftTwinTagFail`, `emitMapUnionPayloadTail` (`wasmEmit`) | render | BY DESIGN: each renders the type into an `emitFail` message |
| `synthTypeRefOfTy` (`emit_rewrite`) | render | BY DESIGN: a synthesized TypeRef's text is output, and its readers ask the type it records |
| `lvSpellOf` (`emit_rewrite`) | render | BY DESIGN: a synthesized binding's annotation text |
| `registerRetJoinUnions` (`emit_rewrite`) | render | floor, 21 programs: the name is the union registry's registration key; it goes when the registry registers by type (w316) |
| `retFlagsSeedResult` (`wasmEmit`) | render | floor, 25 programs: `retUNm` is a registry name its readers look up; `retUTy` sits beside it, so it goes with those readers (w316) |
| `cloSigNameOfTy` (`emit_union_atoms`) | render | BY DESIGN: the closure-signature slot name, the `clo:` link key ARCHITECTURE §7 counts as a measured floor |
| `listUnionEmitName`, `nominalizePartOfTy` (`emit_sig_tokens`) | render | key producers: a member no declaration names keeps its render inside a composed signature name; they go when signature tokens key by type |
| `nodeMapArmNominalName` (`emit_sig_tokens`) | render | key producer: the map's spelling is rendered to cut its key text back out; it goes with the signature tokens |
| `internArmShapeRow` (`emit_shape_intern`) | render | the shape interner's mint name for an arm with no recorded render: the mint's own key |
| `structElemArrayLowerable` (`emit_shape_intern`) | parse | floor: reached in 12 programs, and the name's `| null` peel agrees with the type in all 12; the peeled name is still what `funcTypeShapeLowerable` and `nameIsStructDecl` read |
| `internFuncTypeShapesTyGo` (`emit_shape_intern`) | parse | floor: reached in 2,589 programs; the name and the type disagree on nullability in 9 (`A|B|null` parses as nullable, its type is a union holding `null`), so the peel is not a type read |
| `nonNulBaseOf` (`emit_map_value_slots`) | parse | a shared spelling helper; its parse goes when its callers stop holding spellings |

## What changed

`anonMapValNameable` answers from the literal-union alias and `tyEmitNameNonEmpty`. It no longer
renders the value type for a value `tyEmitNameNonEmpty` cannot decide; no program reaches that case.

## Proof

- Refresh ×2 is a fixpoint at 6,644,730 bytes (−28, base `13fb735b`, 6,644,758).
- Local sweep, fixpoint seeds on both sides: **23,954 same**, 0 bytes-only, 0 output movers.
- The render-parse budget with `--findings` falls by one render (`--budget-why`: the `anonMapValNameable` site left). The merged tree reads one render below master's baseline, which this PR leaves as it is; the budget is re-baselined centrally.
- `regress.vl`, `lint-self`, `cases_wasm` (7,457), seed size, late demands and the dead-export budget (with `--findings`) pass.

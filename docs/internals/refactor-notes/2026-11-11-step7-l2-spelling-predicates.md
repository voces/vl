# Step 7 L2 §7: the `emit_base` spelling predicates, four callers moved to the type, 2026-11-11

The floors note (`2026-11-10-step7-l2-render-parse-floors.md`) left the 22 type-string parses
in `emit_base.vl` to a later lane. This note covers the 14 predicates among them that test a
spelling: `nameIsNulString`, `nameIsNulBool`, `nulLitUnionScan`, `nameIsElemArray`,
`nameIsStrLitSet`, `nameIsI32ListArray`, `nameIsMap`, `nameIsMapMemberUnion`, `nameIsMapArray`,
`nameIsClosureArray`, `parenUnionArrElemName`, `atomsHaveValueAtom`, `annRetNameOf` and
`annFnDecompose`. For each predicate, it lists the callers. Where a caller holds a type, the
type's answer was probed against the spelling's. Where the two agreed, the caller now asks the
type.

The base is master `5edb783b`, with a fixpoint seed on both sides. The population is the
sweep's `cases` population: 7,441 programs.

## Result

This PR removes no parse site. Every predicate keeps at least one caller in a file another lane
owns, so none can be deleted here. The four cuts make the parses run less often, but every
parse site is still present. `vl check --budget scripts/render-parse-budget-baseline.json`
passes and reads below baseline. Every entry it lists as left is in `emit_shape_rows.vl`,
`emit_union_atoms.vl` or `emit_union_registry.vl`, which this diff does not touch. Earlier PRs
left those entries, so this PR does not run `--write-baseline` for them.

## Probed

The probes ran in a scratch compiler that was never refreshed into a seed. Each probe site added
a tag to an accumulator. `emitProgram` raised the tags as one `emitFail` at the end, so a single
sweep showed every probe. A program that already fails emit hides its probes. The instrument
was checked first against a failing control: an unconditional tag in `collectATypeRef` made a
plain program report `W310PROBE CTRL`, and the probe compiler built the same program clean.
Each silent probe also had a reach tag, so a site that agrees was shown to be reached.

| probe | site | reached | untyped | disagree | verdict |
| --- | --- | --- | --- | --- | --- |
| P1 | `collectATypeRef`: `annRetNameOf(nd.tyName) != ""` vs `tyIsFuncArena` | all `TypeRef`s | 15 | 5 | **cut**, with the spelling kept for an untyped annotation |
| P4 | `structElemArrayLowerable`: `nameIsElemArray(t)` vs `tyStepElem(ty) >= 0` | 11 | 0 | 0 | **cut** |
| P5 | `funcTypeShapeLowerable`: `nameIsClosureArray(ftxt)` vs `tyIsFuncArena(tyStepElem(fTy))` | 7 | 0 | 0 | **cut** |
| P8 | `mapAnnShape` (`TypeRef`): `nameIsMap(mn) \|\| twin` vs the `Param` arm's type test | 268 | 0 | 0 | **cut** |
| P2, P6 | shape walks: `nameIsElemArray(nm)` vs `tyStepElem(ty) >= 0` | — | 701, 7 | 1, 11 | floor |
| P3 | `internShapeDeepTyGo`: `nameIsMap(nm)` vs `tyIsMap(ty)` | — | 620 | 5 | floor |
| P7 | `letWidensAtomToStr`: `parenUnionArrElemName(tn) != ""` vs the element type alone | — | 0 | 389 | floor |
| P9 | `isVariantBoxUnionAtoms`: `nameIsMap(atoms[j])` vs `tyIsMap(tys[j])` | — | 1 | 6 | floor |
| P12 | `collectATypeRef`: `nameIsBareMap` vs `tyIsMap` | — | — | 4 | floor |
| P13 | `unionHasMapArmSlot`: `nameIsMap(a)` inside the arena-covered branch | 111 | 0 | 0 | not cut (see Floors, `nameIsMap`) |

P1's five disagreements are function types that the arrow scan does not see:

- `((i32)=>i32)`, where grouping parens hide the arrow. This occurs in 2 programs.
- A union of two function types, which the arena records as a `TyFunc`.
- The mono pin spellings `=>i>i` and `=>S>S`.

In all five, the type is right. The sweep shows the same wasm either way.

## Changed

- `collectATypeRef`: the annotation is a function type when its recorded type is a `TyFunc`.
  Only an untyped annotation asks the spelling's top-level arrow.
- `structElemArrayLowerable`: the array test is `tyStepElem(ty) >= 0`.
- `funcTypeShapeLowerable`: a ref-list field is a closure list when its element type is a
  `TyFunc`.
- `mapAnnShape`: an annotation is a map by the same type test a parameter uses
  (`nodeTyMapOrTwinIx` or `tyIsNulBareMap`). The spelling `mn` is now read only for the key
  kind of a node with no type.

## Floors

The table lists each predicate's remaining callers and the reason each one stays.

| predicate | callers left | reason |
| --- | --- | --- |
| `nameIsNulString` | `nameIsNulStrList`, `parenUnionArrElemName` (both spelling predicates); `forceAnnLeafReps` (`emit_collect`); `emit_shape_rows` field code | `forceAnnLeafReps` receives a generic application's argument cut from its spelling, so no type is held. The field-code arm runs with `recTy < 0`, so it is untyped by construction (w309) |
| `nameIsNulBool` | `nameIsNulBoolList`, `parenUnionArrElemName`; `emit_shape_rows` ×2 | the mv value kind and the field code (w309) |
| `nulLitUnionScan` | `nameIsNulLitUnion` → `nameIsNulLitUnionList`, `parenUnionArrElemName`; `emit_shape_rows` ×2 | w309 |
| `nameIsElemArray` | shape walk ×2 (`emit_shape_intern`); `emit_shape_rows` ×5 | the walk recurses on the spelling it cuts, untyped in 701 programs (P2); w309 |
| `nameIsStrLitSet` | `nulLitUnionScan`, `nameIsLitUnionList` | spelling predicates only |
| `nameIsI32ListArray` | `emit_shape_rows` ×2 | the ref-list kind ladder (w309) |
| `nameIsMap` | shape walk (P3); `mapValNameOf`; `isVariantBoxUnionAtoms` (P9); `emit_union_atoms` ×5; `monoSubstAnn`; `nameIsMapMemberUnion`, `nameIsBareMap` | P3 is untyped in 620 programs. In P9 the `tys` slice does not line up with `atoms`: 4 of the 6 disagreements type a map atom as a primitive. In `emit_union_atoms`, the arena-covered branch already asks `unMemIsMap`, and the spelling is reached only when no type is held. The exception is P13, whose spelling test selects between two map-value slot finders; the slot finders belong to w309. `monoSubstAnn` belongs to w305 |
| `nameIsMapMemberUnion` | `nameIsBareMap` | its callers are spread across `emit_collect`, `emit_map_value_slots`, `emit_mono`, `emit_shape_rows`, `emit_sig_tokens` and `emit_value_sites`. P12 shows the `emit_collect` caller disagreeing with `tyIsMap` on an alias (`WMap`), an alias-wrapped `{[i32]:i32}`, and two `{[]:…}` spellings the arena records as a record |
| `nameIsMapArray` | `emit_shape_rows` ×2 | the ref-list kind ladder (w309) |
| `nameIsClosureArray` | `emit_mono` ×2; `emit_shape_rows` ×2 | w305, w309 |
| `parenUnionArrElemName` | `letWidensAtomToStr` (P7); `emit_mono`; `emit_shape_rows` ×3 | P7: the type twin would need "the element is a union", read through `canonUnionMemberTysOf` (w302). Without that, `string[]` alone disagrees in 371 programs |
| `atomsHaveValueAtom` | `emit_union_registry` | the union registry (w302) |
| `annRetNameOf` | `collectATypeRef` (an untyped annotation only); `cloResultAtomOf`; `emit_mono` | `cloResultAtomOf` reads the result atom of a union arm's spelling (w302). `emit_mono` belongs to w305 |
| `annFnDecompose` | `internFuncTypeShapesTy`, `annSigKeyTy`, `synthVoidTwins` (`emit_rewrite`); `monoSubstAnn`; `emit_mono` ×6 | each caller wants the parts' spellings as names, for the shape walk, the `$fnsig` key and the twin's parameter names. These callers produce names, so a type answer does not replace them |

## Proof

- **Byte sweep.** `sweep.vl record --population cases` was run with the master fixpoint and with
  the candidate fixpoint. All 7,441 programs are the same, with 0 bytes-only movers and 0 output
  movers.
- **Gate.** `scripts/gate.sh` passes all 23 rows: seed size, late demands, plumb-shape cost,
  kind-ladder sets, render-parse, rep-fuzz, filed witnesses and the distilled corpus among them.
  The comment, ladder, sentinel and scan budgets are at or below baseline.

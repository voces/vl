# Step 7 closing census 4: every L2 and L6 exit item on master, with its owner or floor

This re-runs each exit item of
[`2026-11-11-step7-exit-criteria.md`](2026-11-11-step7-exit-criteria.md) on master `558fff89`
(#7622). The fixpoint seed is 6,722,819 bytes; two refreshes were byte-identical.

Each remaining site has an **owner** (a lane from the coordinator's lane map) or a **floor** (a
named reason it stays). Grep counts are call lines on non-comment lines of `compiler/*.vl`,
definitions and import lines left out, and are labelled.

| lane | owns |
| --- | --- |
| B | struct and variant name producers |
| D | mono and the instance key |
| E | `emit_base.vl` and `emit_shape_intern.vl` |
| F | ref-list and shape-row ladders |
| G | the union registry and union-box readers |
| H | VKind codecs and map-value slots |
| I | this census |

## L2: render-then-parse, two-producer classifiers, rows minted under a name

| measure | census 3 | exit criteria (2026-11-11) | now | instrument |
| --- | --- | --- | --- | --- |
| `tyToEmitName` calls | 35 | 35 | **13** | `render-parse-census.vl --out`, then `vl check --budget scripts/render-parse-budget-baseline.json --findings` |
| type-string parses | 60 | 59 | **30** | the same; the ratchet reads 13 / 30, at its baseline |
| ARENA + NAME / ARENA + SPELLING pairs | 15 / 2 | 14 / 2 | **7 / 0** | `rep-classifier-census.vl -- --summary` |
| classifiers reading NAME (call sites) | 52 (107) | 51 (106) | 32 (62) | the same |
| classifiers reading SPELLING (call sites) | 12 (29) | 12 (29) | 4 (6) | the same |
| `rlRowNameOfTy` | 16 | 16 | 15 | grep |

**The 13 renders.**

| class | sites | grade |
| --- | --- | --- |
| diagnostics | `cloCallSigRejectWhat` ×4, `nulNicheIsTestImpossible`, `mapSoftTwinTagFail`, `emitMapUnionPayloadTail` (7) | floor: render-parse-residue's measured floor; a message renders a type for a person |
| the `clo:` link key | `cloSigNameOfTy` (1) | floor: the residue's `clo:` key; no program reaches `cloSigPosBy`'s readers (registry census) |
| recorded TypeRef texts | `synthTypeRefOfTy`, `lvSpellOf` (2) | floor: a synthesized annotation's text is output, re-checked as source |
| interner keys | `internShapeDeepOfTy`, `internShapeDeepTyGo`, `internArmShapeRow` (3) | **E** (E3): key the leaf by type, or name the class-G floor |

The render floor is **10**. The 3 interner renders are E's. The exit criteria's two
nominal-spelling floors (`nominalizePartOfTy`, `nodeMapArmNominalName`) are gone.

**The 30 parses.** The exit criteria rule that every parse converts.

| file | parses | functions | owner |
| --- | --- | --- | --- |
| `emit_base.vl` | 16 | the `nameIs*` predicates, `nulLitUnionScan`, `parenUnionArrElemName`, `annFnDecompose` | **E** |
| `emit_shape_rows.vl` | 7 | `refArrShapeKindGo` 5, `shapeFieldElemName` 2 | **F** |
| `emit_shape_intern.vl` | 3 | `structElemArrayLowerable`, `internFuncTypeShapesTyGo`, `iisPushFieldElem` | **E** |
| `emit_map_value_slots.vl` | 2 | `nulMapInnerName`, `nonNulBaseOf` | **H** |
| `emit_union_registry.vl` | 2 | `unionSetAtomsOf`, `unionSetMemberCount` | **G** |

**The 7 ARENA + NAME pairs and 4 SPELLING readers.** The grades are those of
[`2026-11-12-step7-classifier-pairs-graded.md`](2026-11-12-step7-classifier-pairs-graded.md).

| classifier | reads | owner or floor |
| --- | --- | --- |
| `emitLetIfInit` | ARENA+NAME | **G**: the box name handed to `emitUnionBoxArg(siteNm, siteTy)` |
| `retFlagsSeedResult` | ARENA+NAME | **G** |
| `unionNameOfCall` | ARENA+NAME | **G** |
| `internShapeDeepTyGo` | ARENA+NAME | **E** (E3), the render above |
| `jrFieldFitsAt` | ARENA+NAME | **I**: deleted in #7631 (open; floor fired in 0 of 24,184) |
| `monoTagMapRepName` | ARENA+NAME | **D**, and a label: it renders a pin key from the arena type, one producer |
| `annTyIsRefList` | ARENA+NAME | label: `nd.tyName == ""` is a presence test; the rep is the arena's (F told) |
| `funcTypeShapeLowerable` | SPELLING | **E** (its field codes, H) |
| `structElemArrayLowerable` | SPELLING | **E** |
| `refArrElemNameGo` | SPELLING | **F** (cut 4) |
| `refArrShapeKindGo` | SPELLING | **F** (cut 4) |

After #7631 the pairs are 6. Two of them are labels (`monoTagMapRepName`, `annTyIsRefList`) and
four are converted by their lanes.

**Rows minted under a name:** `rlRowNameOfTy`, 15 call lines (grep), is **F**'s ref-list rows.

## L6: registries keyed by spelling

| measure | census 3 / exit criteria | now | instrument |
| --- | --- | --- | --- |
| spelling-keyed registries | 7 (2026-11-12, `registry-census.vl`) | **6** | `registry-census.vl`, read by key |
| string-keyed registries | 77 | 76 | the same |
| slot-layer name producers | 15 | **9** | `vkind-census.vl -- --slots-list` |
| the union registry's name-taking entries | 36 | **26** of the 36 still take a string, 166 call lines (grep) | the 36 entries of `2026-11-11-step7-union-registry-census.md`, by signature |
| `canonUnionKeyOfName` | 21 | **0**, deleted | grep |
| `structIndexByName` / `variantIndexOf` | 35 / 68 | 15 / 27 | grep |
| `registerInlineUnionAt` / `mintInlineUnion` | 10 / 2 | 9 / 1 | grep |
| `nliInferLet` | 3 | 0 | grep |
| exported type-equality notions | 8, a deviation | 7 equalities and 2 non-equalities, a contract | §3.3, #7614 |

**The 6 spelling-keyed registries.** `sitnMemo` left with `structIndexOfTypeName`.

| registry | key | owner or floor |
| --- | --- | --- |
| `sNameIx` (`emit_atom_kinds.vl`) | a struct row's name, behind `structIndexByName` | **B**, with the name-producer switch |
| `instKeyFirst` (`emit_inst_key.vl`) | mono's instance key | **D** |
| `monoTypedKeys`, `monoKeyEk`, `monoKeyPins` (`emit_mono.vl`) | mono's pin keys | **D** |
| `cloSigPosBy` (`emit_state.vl`) | the `clo:` link key | floor: no program reaches its readers |

**The 9 slot-layer name producers.**

| producer | file | owner |
| --- | --- | --- |
| `structIndexByName` (15 call lines) | `emit_atom_kinds.vl` | **B** |
| `shapeElemDeclaredStructIdx` | `emit_shape_rows.vl` | **B** |
| `armFieldStructRow` | `emit_shape_rows.vl` | **B** |
| `structRowOfSpelling` | `emit_shape_rows.vl` | **B** |
| `variantIndexOf` (27 call lines) | `emit_local_slots.vl` | **B** |
| `calleeAnnRetRefListSlot` | `emit_classify.vl` | **F** |
| `rlRowOfNameMinted` | `emit_collect.vl` | **F** |
| `rlSlotByName` | `emit_shape_rows.vl` | **F** |
| `rlSlotByNameK` | `emit_shape_rows.vl` | **F** |

`structIndexOfTypeName`, `structIndexOfTypeNameTy`, `structIndexOfTypeNameGo`,
`repStructRowByName`, `structRowOfNameTy` and `structRowOfAnnTy`'s name argument left in #7546
and #7615. `retStructRowIndex` has 5 call lines (grep), and its name rung goes with B's switch.

**The union registry.** **G** owns every one of the 26 entries that take a spelling. The 10 that
left: 6 are deleted (`isUNameABAt`, `isUNameOwnAB`, `msSetOfNameTy`, `softKeyOrNameKey`,
`unRowOfSetText`, `unionRowOfAB`), and 4 now take the type alone (`isUNameAB`, `isUNameAnnAB`,
`unionMemberTysOfAB`, `unionRowKeyAB`). The inline union's mint (`registerInlineUnionAt` 9,
`mintInlineUnion` 1) is in the same set.

**The equality notions** are no longer an L6 item. #7614 moved them into §3.3's contract text,
and the L6 line no longer cites them.

## The scoreboard targets (ruled: re-baselined at the close, not landing criteria)

| target | reference | now |
| --- | --- | --- |
| emit_classify ↓ | 14,412 lines (2026-11-10 census); 14,546 at census 3 | 14,962 lines, 642 functions |
| seed ↓ | 6,589,035 bytes (the seed-size gate's baseline, #6986); 6,623,600 at the exit criteria | 6,722,819 bytes (+2.0% against the gate's baseline) |

Both rose with the conversions. Each typed read and invariant `emitFail` replaced a name read,
and the name ladders whose deletion would cut both still stand: B's producers, G's union entries
and E's `nameIs*` predicates.

## What closes step 7, by lane

| lane | renders | parses | pairs | registries | slot names | union entries |
| --- | --- | --- | --- | --- | --- | --- |
| B | | | | `sNameIx` | 5 | |
| D | | | (label) | 4 | | |
| E | 3 | 19 | 3 | | | |
| F | | 7 | 2 | | 4 | |
| G | | 2 | 3 | | | 26 |
| H | | 2 | | | | |
| I | | | 1, in #7631 | | | |
| floor | 10 | | | `cloSigPosBy` | | |

The only unowned items are floors.

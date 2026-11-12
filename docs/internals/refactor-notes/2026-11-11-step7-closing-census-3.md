# Step 7 closing census 3: the Deletes, Absorbs and Closes lists as a checklist

This re-runs `2026-11-11-step7-closing-census-2.md`'s instruments on master `0a9e9948` (#7263). The
seed is a fixpoint, with byte-identical L1 and L2 builds (`cmp`) of 6,623,286 bytes.

Each item of step 7's lists (`architecture-target-2026-10.md` §3) gets one mark:

- **done**, with the PR;
- **in flight**, with the open PR and its lane;
- **open**, when no open PR or Status lane holds it;
- **by design**, where a ruling keeps it.

Its live count is the instrument's reading. A **grep** count counts whole-word occurrences on
non-comment lines of `compiler/*.vl` and is labelled. Lanes come from the Status row and from the
open PRs' branches at the time of writing.

## The checklist

| # | item | mark | live count (census 2 → now) | PR / lane |
| --- | --- | --- | --- | --- |
| D1 | `computeRetInference`, `computeVoidFns` and their `#2` rows | done | grep 0 → 0 | — |
| D2 | `buildFnMap#2` | done | no pass row | — |
| D3 | `buildFnMap` | open | 1 pass row; grep 13 → 13; `buildFnMapRowOfRetAnn` 5 | none |
| D4 | collectA, both rows | done | grep 0 → 0 | — |
| D5 | the name family (`rlSlotByNameTwin`, `letInitDeliversRow`) | done | grep 0 → 0 | — |
| D6 | the twin-row helpers | done | grep 0 → 0 | — |
| D7a | twin syntax side: `structIndexOfExpr` / `structIndexOfTy` | in flight | grep 63 / 60 → 63 / 60 | Family B: #7269, #7285 (w324), w319 |
| D7b | twin syntax side: `repOfNode` / `repOfTy` | awaiting a ruling | grep 35 / 52 → 36 / 59 | proposed by design (census 2); Status row: w308 |
| D7c | twin syntax side: `njKindOfExpr` / `njKindOfTy` | awaiting a ruling | grep 3 / 13 → 3 / 13 | proposed by design (census 2) |
| D8 | the type-blind classifiers | done as ruled | `emit_classify.vl` 14,568 → 14,546 lines, 621 → 619 functions | #7264 trimmed it |
| A1 | the rep-descriptor campaign | in flight | NAME classifiers 61 → 52 (call sites 125 → 107); SPELLING 12 → 12 (29 → 29); ARENA + NAME pairs 19 → 15 | #7229 (w318, SPELLING), #7255 and #7231 (w309) |
| A2 | the `vtKindOfType` annotation ladder | done | ruled default, `vkind-census` | — |
| A3 | the return-kind family | open | 4 of 18 readers: `retStructRowIndex` 11, `retVoidAnnFlag` 5, `retValueExitCount` 6, `retMapInFlight` 3 (grep, unchanged) | none |
| A4 | the slot layer | in flight | name-input producers 15 → 15 (struct 10, variant 1, reflist 4, mapval 0); 165 producers | struct: w319, w307; variant: #7269, #7285 (w324); reflist: #7236 (w311) |
| V1 | VKind derived from the rep descriptor: the descriptor's single derivation | done | `repOfTy` reads the tree alone | #7240 |
| V2 | VKind's producers outside the descriptor | in flight | 21 → 8: codec 5, own ladder 1, rendered name 2 | #7286 (w314), #7237 (w315); see below |
| V3 | VKind's ruled rungs and defaults | by design | 7 | DECISIONS.md; #7240's `RULED` table |
| C1 | family E (9 open) | not gradable as filed | member ids never committed | — |
| C2 | D12465 | done | closed 2026-11-10 | — |
| C3 | the same-shape rows | in flight | the "65 cells" still have no source | Family B (w319, w324) |
| C4a | L2 §7: renders and parses | in flight | `tyToEmitName` 37 → 35; type-string parses 60 → 60 | mono w317; D6 w310 (#7249); shape rows and ref-list keys w311 |
| C4b | L2 §7: rows minted under a name | in flight | `rlRowNameOfTy` 16 → 16; `canonUnionKeyOfName` 21 → 21 (grep) | union key w316 (#7232, #7252, #7261); ref-list keys w311 |
| S1 | scoreboard: emit_classify ↓ | not met | 14,412 (2026-11-10 census) → 14,546 lines | — |
| S2 | scoreboard: seed ↓ | not met | 6,620,813 → 6,623,286 bytes (+2,473) | — |

## The readings behind the marks

**VKind (V2).** `vl run scripts/vkind-census.vl` reads 76 functions:

| family | n |
| --- | --- |
| forward | 23 |
| descriptor read | 11 |
| kind algebra | 10 |
| stored column | 9 |
| descriptor build | 8 |
| ruled rung or default | 7 |
| codec | 5 |
| rendered name | 2 |
| own ladder | 1 |

The 8 outside the descriptor and outside a ruling:

| producer | family | owner |
| --- | --- | --- |
| `listRepOfFieldCode` (`emit_list_rep.vl`) | codec | w314 (field codes) |
| `fieldCodeVKind` (`emit_sig_tokens.vl`) | codec | w314 |
| `fieldCodeCellKind` (`emit_classify.vl`) | own ladder | w314 |
| `pushDestVKind` (`wasmEmit.vl`) | codec | w309 |
| `listKindElemKind` (`wasmEmit.vl`) | codec | open |
| `mapKeyListKind` (`emit_list_rep.vl`) | codec, by the key code | by design per #7240's note: the key code decides storage |
| `scalarListRepOfName` (`emit_mv_slots.vl`) | rendered name | open; its only callers are codecs |
| `nulScalarListKind` (`emit_shape_rows.vl`) | rendered name | open; the same |

**The slot layer (A4).** `vkind-census.vl -- --slots-list`, the 15 name-input producers:

- **struct (10):**
  - `structIndexByName` (grep 36);
  - `repStructRowByName`;
  - `structIndexOfTypeName`, `structIndexOfTypeNameTy`, `structIndexOfTypeNameGo`;
  - `shapeElemDeclaredStructIdx`;
  - `armFieldStructRow`;
  - `structRowOfSpelling`, `structRowOfNameTy`, `structRowOfAnnTy`.
- **variant (1):** `variantIndexOf` (grep 68).
- **reflist (4):** `calleeAnnRetRefListSlot`, `rlRowOfNameMinted`, `rlSlotByName`, `rlSlotByNameK`.

**The rep-descriptor campaign (A1).** `rep-classifier-census.vl -- --summary`: 7,213 functions,
810 classifiers. By what each reads directly (not disjoint):

| reads | classifiers | call sites |
| --- | --- | --- |
| ARENA | 340 | 1,190 |
| FRAME | 279 | 1,201 |
| TABLE | 142 | 597 |
| NAME | 52 | 107 |
| SPELLING | 12 | 29 |

The two-producer pairs are ARENA + NAME 15, ARENA + SPELLING 2, ARENA + TABLE 50, NAME + TABLE 12
and ARENA + FRAME 114.

**The L2 deviation (C4a).** `render-parse-census.vl`, then `vl check --budget
scripts/render-parse-budget-baseline.json --findings`: **35 renders, 60 parses**.

- **Renders:** `emit_mono.vl` 16, `wasmEmit.vl` 4, `emit_closure_sites.vl` 4,
  `emit_sig_tokens.vl` 3, `emit_rewrite.vl` 3, `emit_shape_intern.vl` 2, and one each in
  `emit_anon_fields.vl`, `emit_shape_rows.vl` and `emit_union_atoms.vl`.
- **Parses:** `emit_base.vl` 22, `emit_shape_rows.vl` 22, `emit_mono.vl` 6,
  `emit_shape_intern.vl` 5, `emit_union_registry.vl` 2, `emit_map_value_slots.vl` 2, and one in
  `emit_union_atoms.vl`.

The two renders that left were `emit_mono.vl`'s (18 → 16).

## The goal measurement on this tree

| instrument | census 2 | now |
| --- | --- | --- |
| `goal-scoreboard.vl -- --sites`: corpus cells that run | 8,384 of 11,811 (70.98%) | 8,384 of 11,811 (70.98%) |
| clause 1 / clause 2 emit rejects / clause 2 conceded | 3 / 10 / 21 | 3 / 10 / 21 |
| capability refusal sites by wording (a lower bound) / by witness | 32 / 1 | 32 / 1 |
| `capability-probes.vl` | 222 of 226 run | 223 of 227 run |
| `capability-probes.vl -- --live-sites` | — | 1 of 1 listed sites still refuses |
| `emit-refusal-sites.vl`: sites whose template concedes type-validity | — | 21 |
| `check-filed-witnesses.vl -- --strict`, both inventories | 4,722 as filed, 0 moved | 4,731 as filed, 0 moved, 0 unparsed; 2,631 Want-checked, 0 mismatch |
| `inventory/ls.vl -- --status open` | 303 | 306 |

The 4 probes that refuse:

- `coalesce-fixed-default-built-read`;
- `coalesce-pinned-default-in-literal`;
- `hole-handed-on-in-const-record-called-at-two-types`, the one live site;
- `union-arm-from-wider-record`.

#7224 closed `generic-returned-from-picker-rebound-called-at-two-types` and added the 227th probe,
`hole-handed-on-in-const-record-called-at-two-types`, which still refuses.

## The remaining work, by owner

1. **No owner:**
   - `buildFnMap`'s pass and its annotated row (D3);
   - the return-kind family's 4 readers (A3);
   - `listKindElemKind`, and the rendered-name pair whose callers are codecs (V2).
2. **Rulings owed:** `repOfNode` and `njKindOfExpr` as by design (D7b, D7c). Also a source for
   D12465's "65 cells", or the figure withdrawn (C3).
3. **In flight:**
   - Family B and the struct and variant name producers (D7a, A4, C3): w319, w324, w307;
   - the ref-list keys: w311;
   - the field-code VKind producers: w314;
   - `pushDestVKind`: w309;
   - the union key: w316;
   - mono's renders and parses: w317;
   - the D6 interner: w310;
   - the NAME and SPELLING classifiers: w318, w309.
4. **The scoreboard:** neither "emit_classify ↓" nor "seed ↓" is met.

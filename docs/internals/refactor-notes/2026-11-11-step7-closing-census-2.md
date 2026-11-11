# Step 7 closing census, re-run: the Deletes, Absorbs and Closes lists against master

This re-runs `2026-11-10-step7-closing-census.md` in the same shape. It was measured 2026-11-11 on
master `505f30b3` (#7209), with a seed built from that tree that is a fixpoint: the L1 and L2
builds are byte-identical (`cmp`), at 6,620,813 bytes.

Each item of step 7's three lists (`architecture-target-2026-10.md` §3) gets one grade:

- **DONE**, with the evidence;
- **LEFT**, with its measured size and the lane working it, where the Status row or a recent
  note names one;
- **BY DESIGN**, with the ruling that keeps it.

Counts come from the instruments where one exists: `vkind-census.vl`, `render-parse-census.vl`,
`rep-classifier-census.vl`, `classifier-census.vl`, `capability-probes.vl`, `goal-scoreboard.vl`
and `check-filed-witnesses.vl`. A **grep count** counts whole-word occurrences in
`compiler/*.vl` and is labelled. Its "live" figure leaves out comment lines.

## Summary

| item | grade | lane |
| --- | --- | --- |
| `computeRetInference`, `computeVoidFns`, both `#2` rows | DONE | — |
| `buildFnMap#2` | DONE | — |
| `buildFnMap` | LEFT: one pass row; the annotated `fRet*` row | none named |
| collectA, both rows | DONE | — |
| the name family (`rlSlotByNameTwin`, `letInitDeliversRow`) | DONE | — |
| the twin-row helpers | DONE | — |
| the syntax side of the 56 twins | LEFT: 1 pair; 2 pairs proposed BY DESIGN | w319, w308 |
| the type-blind classifiers | DONE as ruled: 0 probed | — |
| Absorbs: the rep-descriptor campaign | LEFT: 61 classifiers read a NAME, 12 a SPELLING | several |
| Absorbs: the `vtKindOfType` annotation ladder | DONE | — |
| Absorbs: the return-kind family | LEFT: 4 of 18 readers | none named |
| Absorbs: the slot layer | LEFT: 15 name-keyed producers (was 29) | w319, w307, w311 |
| VKind derived from the rep descriptor | LEFT: 21 producers outside the descriptor | w308, w314, w315, w309 |
| Closes: family E | not gradable as filed | — |
| Closes: D12465 | DONE (closed 2026-11-10) | — |
| Closes: the same-shape rows | LEFT | w319 |
| Closes: the L2 §7 deviation | LEFT: 37 renders, 60 parses; rows still minted under a name | w317, w310, w316, w311 |

## Deletes

**`computeRetInference`, `computeVoidFns` and their `#2` rows: DONE.** Grep counts: each name
has 1 hit, on a comment line, and 0 live hits.

**`buildFnMap#2`: DONE. `buildFnMap`: LEFT.**

- `emit_sections.vl` has one `buildFnMap` pass row (`{ pass: "buildFnMap", needs: ["collectFns"] }`)
  and no `buildFnMap#2`.
- `buildFnMap` has 13 live grep hits.
- It still builds the name→position index. `fnIndexBySid` has 12 live hits and
  `nestedNameBySid` 16; that index is not a type fact.
- It also writes the annotated row through `buildFnMapRowOfRetAnn` (5 live hits). That row now
  reads the annotation's rep: `vtKindOfType`, which is `annRepKindOf`, and `repSlotOfKind` for a
  variant or ref list. One rung is still an annotation reader: `retStructRowIndex(ann)` for a
  struct kind.

No lane in the Status row names this item.

**collectA, both rows: DONE.** Grep: 24 hits, 0 live.

**The name family: DONE.** `rlSlotByNameTwin` and `letInitDeliversRow` have 0 hits.

**The twin-row helpers: DONE.** `structNamesTwoRows`, `rsRowsDiffer` and `objLitNamesTwoRows`
have 0 hits.

**The syntax side of the 56 twins: LEFT, 1 pair, and 2 pairs proposed BY DESIGN.** As in the last
census, the pairs are re-derived from their names, so the count is a lower bound.

| pair | syntax side today | live hits (grep) | grade |
| --- | --- | --- | --- |
| `structIndexOfExpr` / `structIndexOfTy` | a producer; Family B graded it into a fused-coercion class and an open struct class (#7172, #7183) | 63 / 60 | LEFT, w319 |
| `repOfNode` / `repOfTy` | `repOfNodeAt(n, nodeTyAt(n, fn))`: a read of the node's recorded type | 35 / 52 | proposed BY DESIGN; the Status row gives `repOfNode` to w308 |
| `njKindOfExpr` / `njKindOfTy` | `njKindOfTy(nodeTyIxOf(ix))`, failing loudly when there is no numeric recorded type | 3 / 13 | proposed BY DESIGN |

The two proposed rows are typed reads named for their input, not second producers. Neither has a
ruling yet. The orchestrator's checklist should rule on them or name a deletion.

**The type-blind classifiers: DONE as ruled.**

- `classifier-census.vl` reports 0 probed classifiers over 23,910 programs.
- It prints one notice: `scalarListElemCell reads no ARENA producer and has no probe`.
  `scalarListElemCell` is a total map from a list kind to the cell its element is read from
  (#7164), so it reads no producer.
- `emit_classify.vl` is 14,568 lines and 621 functions. The last census read 14,412 and 611, so
  the scoreboard's "emit_classify ↓" is not met.

## Absorbs

**The rep-descriptor campaign: LEFT.** `rep-classifier-census.vl -- --summary`, against the
campaign's own §1 reading:

| | campaign §1 | now |
| --- | --- | --- |
| top-level functions in scope | 2,949 | 7,205 |
| classifiers | 519 | 809 |
| classifiers that read NAME directly (call sites) | 117 (635) | 61 (125) |
| classifiers that read SPELLING directly (call sites) | 28 (156) | 12 (29) |
| classifiers that read ARENA directly (call sites) | 138 (903) | 342 (1,243) |
| ARENA + NAME pairs | 33 | 19 |
| ARENA + SPELLING pairs | not read | 2 |

The population grew, mostly from file splits, so the class totals do not compare. The NAME and
SPELLING readers fell by half and more while the population grew.

**The `vtKindOfType` annotation ladder: DONE.** `vtKindOfType` is
`annRepKindOf(tyIx) ?? "i32"` (`emit_nullable_rets.vl:713`) and has 36 live grep hits.
`vkind-census` files it under "own ladder" because of the `"i32"` default literal. The default
is the uncovered-annotation answer, not a rung.

**The return-kind family: LEFT, 4 of 18.** 14 of the 18 readers the last census listed have 0 hits.
The 4 still defined, with live grep hits:

- `retStructRowIndex` 11, which `buildFnMapRowOfRetAnn` reads;
- `retVoidAnnFlag` 5;
- `retValueExitCount` 6;
- `retMapInFlight` 3.

No lane in the Status row names them.

**The slot layer: LEFT, 15 name-keyed producers.** `vkind-census.vl -- --slots` against the
2026-11-10 census:

| bank | producers then | producers now | name input then | name input now |
| --- | --- | --- | --- | --- |
| all | 172 | 163 | 29 | 15 |
| struct | 76 | 76 | 12 | 10 |
| variant | — | 43 | 4 | 1 |
| reflist | — | 30 | 4 | 4 |
| mapval | — | 14 | 9 | 0 |

The cells marked — were not printed per bank in the last census.

The 15 names:

- **struct (10):**
  - `structIndexByName`;
  - `repStructRowByName`;
  - `structIndexOfTypeName`, `structIndexOfTypeNameTy`, `structIndexOfTypeNameGo`;
  - `shapeElemDeclaredStructIdx`;
  - `armFieldStructRow`;
  - `structRowOfSpelling`, `structRowOfNameTy`, `structRowOfAnnTy`.
- **variant (1):** `variantIndexOf`.
- **reflist (4):** `calleeAnnRetRefListSlot`, `rlRowOfNameMinted`, `rlSlotByName`, `rlSlotByNameK`.

Lanes: the struct names are Family B's and record declaration identity's (w319, w307), and the
ref-list names are w311's (rows keyed by type and declaration). The map-value bank's name
producers are 0 (#7144, #7157, #7201).

**VKind derived from the rep descriptor: LEFT.** `VKind` is still a declared closed set
(`emit_state.vl`). `vkind-census.vl` finds 77 functions that return one:

| family | count |
| --- | --- |
| forward | 22 |
| stored column | 9 |
| kind algebra | 9 |
| descriptor read | 8 |
| descriptor build | 8 |
| codec | 7 |
| descriptor read + own rungs | 6 |
| own ladder | 6 |
| rendered name | 2 |

The 21 outside the descriptor are the codecs, own ladders, rendered names and own rungs:

- **codec (7):**
  - `listRepOfFieldCode` and `fieldCodeVKind`: field codes, w314;
  - `listRepOfMf`, `listFitStoodKind` and `njVKind`: deleted by #7181, open;
  - `spreadScalarVKind`: renamed to kind algebra by #7195, open;
  - `pushDestVKind`: w309.
- **own ladder (6):**
  - `fieldCodeCellKind`: w314;
  - `captureValKind`, `forInWalkKind` and `ifExprRefKindAt`;
  - `vtKindOfType` and `vtKindOfParam`: their default literal only, as above.
- **rendered name (2):** `scalarListRepOfName` (`emit_mv_slots.vl`) and `nulScalarListKind`
  (`emit_shape_rows.vl`).
- **descriptor read + own rungs (6):** `fnSigKindOfTy`, `nulNoneReadCellKind`, `letCellKindGo`,
  `ifExprRefKindOf`, `tyListRepKind`, `mvValRepKindOfTy`.

The descriptor's own two derivations of the kind (the flat arms and the rep tree) are w308's.
The 2026-11-10 VKind census used a hand table of 19 codecs and 30 producers. Its families differ
from the instrument's, so only the instrument's figures are quoted here.

## Closes

**Family E: not gradable as filed.** Its member ids were never committed. A keyword count
(`L2`, `same-shape`, `structural twin`, `row from the type`) over the 303 rows
`inventory/ls.vl --status open` lists now matches 0. The last census matched 3. This is a
keyword count, not a family.

**D12465: DONE.** The row is closed 2026-11-10. `binEqStructRow` reads an arm operand at the struct
row its values are stored at. The fixture `tests/cases/unions/error-arm-struct-equality-mixed.vl` is
now `@run`. `check-filed-witnesses.vl -- --strict` (both inventories) reports:

- 4,722 graded, 4,722 as filed, 0 moved, 0 not graded, 0 unparsed;
- `D12465 runs runs as filed`.

**The same-shape rows: LEFT.** The "65 cells" are still unsourced: no coordinate file under
`scripts/silent-sweep/census/` names D12465. The open work is Family B (w319). The Status row
gives its figures as 27 declaration cells, the anon-row collapse (90) and the widened builds (393).
Those are the lane's own figures, not re-measured here.

**The L2 §7 deviation: LEFT.**

- **Render-parse:** `render-parse-census.vl` with `vl check --budget
  scripts/render-parse-budget-baseline.json --findings` reads **37 `tyToEmitName` calls and 60
  type-string parses** in the emitter. The last census read 41 / 82.
  - The renders by file: `emit_mono.vl` 18, `wasmEmit.vl` 4, `emit_closure_sites.vl` 4,
    `emit_sig_tokens.vl` 3, `emit_rewrite.vl` 3, `emit_shape_intern.vl` 2, and one each in
    `emit_union_atoms.vl`, `emit_shape_rows.vl` and `emit_anon_fields.vl`.
  - The parses by file: `emit_shape_rows.vl` 22, `emit_base.vl` 22, `emit_mono.vl` 6,
    `emit_shape_intern.vl` 5, `emit_union_registry.vl` 2, `emit_map_value_slots.vl` 2, and one in
    `emit_union_atoms.vl`.
- **The line itself is stale.** ARCHITECTURE §7's L2 line still cites 50 / 86 (2026-10-25).
- **Rows minted under a name:** the line also says "every row is still minted under a name".
  `rlRowNameOfTy` has 16 live grep hits and `canonUnionKeyOfName` 21.

Lanes: mono's renders and parses are w317's. The D6 interner and `emit_base.vl`'s `nameIs*` parses
are w310's. `emit_shape_rows.vl`'s parse sites and the ref-list row keys are w311's.
`canonUnionKeyOfName` is w316's.

**§7's L6 line (registries keyed by spelling), re-measured.**

| claim | as written | now | instrument |
| --- | --- | --- | --- |
| module-scope `{[string]: i32}` / `{[i32]: i32}` maps in `emit_*.vl`, `wasmEmit.vl` | 56 / 41 | 46 / 93 | grep of `let` and `const` declarations annotated with exactly that type; the line names no method, so the comparison is approximate |
| struct-row lookups by name | 81 call sites | `structIndexByName` 36 live hits | grep; the 81 counted more entries than this one |
| the union registry's name-taking entries | — | 36 of 36 still defined, 272 static call sites | the entry list and caller method of `2026-11-11-step7-union-registry-census.md`, which read 283 call sites on `68fd81f7` |
| `registerInlineUnionAt` / `mintInlineUnion` | the inline union's row and key are its name | 10 / 2 live hits | grep |
| `nliInferLet` | one of two value-union registrations that hand over no type | 3 live hits | grep |

The union registry's remaining cut order, items 5b–6 and `canonUnionKeyOfName`, is w316's.

## The goal measurement on this tree

- `goal-scoreboard.vl -- --sites`: **8,384 of 11,811 corpus cells run (70.98%)**.
  - Clause 1: 3 cells.
  - Clause 2: 10 emit rejects after a clean check, and 21 check refusals that concede the program
    is type-valid.
  - Capability refusal sites: 32 by wording (a lower bound, 28 reached by no cell), and 1 by
    witness.
- `capability-probes.vl`: **222 of 226 probes run, 4 refuse**:
  - `coalesce-fixed-default-built-read`;
  - `coalesce-pinned-default-in-literal`;
  - `generic-returned-from-picker-rebound-called-at-two-types`;
  - `union-arm-from-wider-record`.
- Seed: 6,620,813 bytes. The last census gave no seed figure, so "seed ↓" is not graded here.

## What step 7 has left, biggest first

1. **The L2 deviation's renders and parses (37 / 60)** and the rows minted under a name: w317
   (mono), w310 (D6), w316 (union key), w311 (ref-list keys).
2. **The slot layer's 15 name-keyed producers**, struct first (10): w319, w307, w311.
3. **VKind's 21 producers outside the descriptor**, of which 4 are in open PRs (#7181, #7195), and
   the descriptor's single derivation: w314, w309, w308.
4. **`buildFnMap`'s annotated row and the 4 return-kind readers.** No lane is named.
5. **The rulings this census asks for:** `repOfNode` and `njKindOfExpr` as BY DESIGN, and a
   source for D12465's "65 cells", or the figure withdrawn.

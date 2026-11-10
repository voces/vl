# Step 7 closing census: the Deletes, Absorbs and Closes lists against master

Measured 2026-11-10 on master `4e03e7db` (#7082), with a fixpoint seed (two `refresh-compiler.sh`
runs byte-identical). Each item of step 7's three lists in `architecture-target-2026-10.md` §3 is
graded **DONE** (evidence), **LEFT** (measured size) or **BY DESIGN** (the ruling that keeps it).
Grep counts are of whole-word occurrences in `compiler/*.vl`; "live" excludes comment lines.

## Summary

| item | grade |
| --- | --- |
| `computeRetInference` and `computeRetInference#2` | DONE |
| `computeVoidFns` and `computeVoidFns#2` | DONE |
| `buildFnMap` and `buildFnMap#2` | LEFT: one function, two pass rows, the annotated `fRet*` columns |
| collectA, both rows | DONE |
| the name family (`rlSlotByNameTwin`, `letInitDeliversRow`) | DONE |
| the twin-row helpers | DONE |
| the syntax side of the 56 twins | LEFT: 3 named pairs stand |
| the type-blind classifiers | DONE as ruled (0 probed) |
| Absorbs: the `vtKindOfType` annotation ladder | DONE (one line over `repOfNode`); 17 live callers |
| Absorbs: the return-kind family | LEFT: 18 `ret*Flag`/`ret*Index` annotation readers |
| Absorbs: the slot layer | rim DONE; producers LEFT, not re-measured here |
| VKind derived from the rep descriptor | LEFT |
| Closes: family E | not gradable as filed (no member list) |
| Closes: D12465 and the same-shape cells | LEFT: D12465 is `emit_reject` as filed |
| Closes: the L2 §7 deviation | LEFT: 41 renders, 82 parses |

## Deletes

**`computeRetInference`, `computeVoidFns`: DONE.** `grep -w computeRetInference compiler/*.vl` and
`grep -w computeVoidFns` find one comment line each, no code. Neither pass is in the `EmitPass`
type (`emit_sections.vl`, "One pass-table row"), so both `#2` rows are gone. `criWalkBlock` has
0 hits. `recordedVoidFns` and `recordedVoidFns#2` replace the void pass, and
`fnRetColsFromRecorded` (inside `recordedVoidFns#2`) writes the un-annotated columns.

**`buildFnMap`: LEFT.** Of 40 hits, 23 are live:

- the definition (`emit_collect.vl:2114`);
- mono's resume call (`emit_mono.vl:5156`);
- the `buildFnMap` and `buildFnMap#2` pass rows (`emit_sections.vl:7349`, `:7392`) and their `needs`
  edges;
- the lint's pass-name lists (`lint.vl:5129`, `:5389`, `:5393`).

The machinery comes to about 160 lines (`emit_collect.vl:2006–2168`), plus `fmSeenFns` /
`fmResumeArmed` / `fmDirtySlots`. It builds two kinds of thing:

- **The name→position index:** `fnIndexBySid` (11 live refs, 5 files) and `nestedNameBySid`
  (15 live refs, 7 files). This is not a type fact.
- **The annotated return columns,** through `buildFnMapRowOfRetAnn`: `fRetVoid` (`retVoidAnnFlag`),
  `fRetStructIdx` (`retStructRowIndex`/`retStructIndex`), `fRetRArrElem` (`retRefArrElemName`),
  `fRetBool` (`retBoolFlag`) and `fRetKind` (`vtKindOfType`). `fRetRListRow` and `fRetLitAtom`
  are seeded to -1 and 0. Reader counts are 51, 32, 13, 15 and 62 live refs, and 13 and 14 for
  the two seeded ones.

`#7001` made the un-annotated half one `repOf` read (`frsColsOfTy`). The annotated half is
still a per-column annotation ladder, and that is task 2 of this lane.

**collectA, both rows: DONE.** `collectA` has 25 hits, all comments, with no `collectA` or `collectA#2`
row in `EmitPass`. What survives under the name are the per-node mint helpers
(`collectAArrayLit`, `collectAIsExpr`, `collectACallMint`, `collectATypeRef`). `nodeMintOnRead`
calls them at a first read (#6992–#7020), which is the shape the step asks for.

**The name family: DONE.** `rlSlotByNameTwin` and `letInitDeliversRow` have 0 hits.

**The twin-row helpers: DONE.** The 2026-10-25 evidence note (§(iii)) names them:
`structNamesTwoRows`, `rsRowsDiffer` and `objLitNamesTwoRows`. All three have 0 hits.

**The syntax side of the 56 twins: LEFT, 3 named pairs.** The 56 was a hand count of
"syntax and type form" pairs, and its list was never committed. This note re-derives it from
the names: a defined function `XOfExpr`/`XOfNode`/`XExpr`/`XNode` beside a defined
`XOfTy`/`XTy`/`XOfType`. Three pairs remain, all in the step's own vocabulary:

- `repOfNode` / `repOfTy`, with 35 hits;
- `structIndexOfExpr` / `structIndexOfTy`, with 81;
- `njKindOfExpr` / `njKindOfTy`.

`repOfNode` is now a read of the node's recorded type (`repOfNodeAt(n, nodeTyAt(n, fn))`). Its
syntax side is therefore a typed read with a hole-element and union-alias adjustment, not a
second producer. It is a candidate for BY DESIGN, but no ruling says so yet. The name-pattern
derivation is a lower bound: a twin whose names do not follow the pattern is not counted.

**The type-blind classifiers: DONE as ruled.** `scripts/classifier-census.vl` reports 0 probed
(#7082). Statically, `clsCensusEnter(` has one occurrence in `compiler/` (its definition), so no
classifier carries a probe. `emit_classify.vl` is still 14,412 lines and 611 functions. What
stays is either a typed reader or `NOT_BLIND` with a recorded reason. That is the ruling in
DECISIONS.md §"How step 7's classifier half finishes": a classifier that reads the emitter's
own storage is not step-7 debt.

## Absorbs

**The `vtKindOfType` annotation ladder: DONE.** `vtKindOfType` is one line
(`emit_nullable_rets.vl:876`: `annRepKindOf(tyIx) ?? "i32"`). `annRepKindOf` is
`repOfNode(tyNodeIx, -1).rdKind` when it is covered. The ladder is gone. The 17 live callers
read an annotation node's rep, and 6 of them are a function's declared return (`fn.fnRet`).
Those 6 go with the annotated `fRetKind` column.

**The return-kind family: LEFT.** `emit_nullable_rets.vl` and `emit_base.vl` still export 18
annotation readers. Each is shown with its hits in `compiler/`:

- `retNulRefFlag` 8, `retNulVariantFlag` 10, `retNulRefIndex` 6;
- `retStructRowIndex` 11, `retStructIndex` 8;
- `retRefArrFlag` 5, `retNulRefArrFlag` 13, `retRefArrElemName` 3;
- `retMapFlag` 7, `retNulMapFlag` 12, `retMapInFlight` 3;
- `retVariantFlag` 9, `retUnionFlag` 8, `retNulListFlag` 4;
- `retBoolFlag` 3, `retVoidAnnFlag` 8, `retNulStringFlag` 11, `retValueExitCount` 6.

Five of them feed `buildFnMapRowOfRetAnn`.

**The slot layer: rim DONE; producers LEFT.** The rep-descriptor campaign §6.6 converted the
consumer rim (`armDestHeapOf` is a `_`-less `match`). The 183 producers were not re-counted
here. #7017 moved 12 of the 15 `repSlotOfTy` callers, and 3 stand by design. `repSlotOfTy` has 9
hits and `repSlotOfKind` 33.

**VKind derived from the rep descriptor: LEFT.** `VKind` is still a declared closed set
(`emit_state.vl:516`). The descriptor carries it as `rdKind` rather than deriving it, and the
`fRetKind` column and the slot kinds store it.

## Closes

**Family E (9 open): not gradable as filed.** Family E ("rep or row from the type (L2)", 69 filed /
9 open in §1's table) came from a keyword classifier over row text, and its member ids were not
committed. As a **keyword count, not a family**: of the 303 rows `scripts/inventory/ls.vl --status
open` lists, 3 mention `L2`, `same-shape`, `structural twin` or `row from the type`. Those are
D1191, D4883 and D12465. Grading the family needs an ablation (CLAUDE.md "A validator sentence is
not a mechanism").

**D12465 and the same-shape cells: LEFT.**
`vl run scripts/check-filed-witnesses.vl -- --strict docs/internals/inventory docs/internals/inventory-2`
reports 4,691 graded, 4,691 as filed, 0 moved, 0 not graded and 0 unparsed. It lists
`D12465 emit_reject emit_reject as filed`. The pins:

- `tests/cases/unions/error-arm-struct-equality-mixed.vl` still refuses with
  `emitProgram: struct equality is not supported yet`. That is an arm record against a
  same-shape standalone record.
- `error-arm-struct-equality-cross-arm.vl` runs and prints `true`, `false`.

No committed coordinate set holds "65 cells": no file under `scripts/silent-sweep/census/` names
D12465. So the 65 cannot be re-graded on this seed, and the figure is unsourced.

**The L2 §7 deviation: LEFT.** `docs/ARCHITECTURE.md` §7's L2 line cites 50 renders and 86 parses.
`render-parse-census.vl` then `vl check --budget scripts/render-parse-budget-baseline.json
--findings` reports `41 tyToEmitName calls, 82 type-string parses in the emitter (baseline or
below)`. The deviation also says "every row is still minted under a name". `rlRowNameOfTy` (17
hits) and `canonUnionKeyOfName` (22 hits) still key rows by a name rendered from the type.

## What step 7 has left, biggest first

1. The annotated `fRet*` columns and `buildFnMap#2`, with the 18-reader return-kind family
   behind them. This is the next PR on this lane.
2. VKind as a derived field of the descriptor, and the slot layer's producers.
3. The two closes that need a capability, not a deletion: D12465's mixed pair, which needs
   struct rows keyed by canonical type, and the L2 renders and parses.

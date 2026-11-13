# Step 7 D6: the census's unreached parse sites, deleted behind loud floors, 2026-11-13

Lane F, taken over from lane B. The input is `docs/internals/render-parse-sites.md` §"The census's
sites no program reaches": 34 sites. Measured at master `846a645b`.

## Method

I built one probe compiler with a `probeMark` at each site and the driver reporting every mark
it collected. Each site's control is a mark at its function's entry, or at its one caller when
the function is never entered. The sweep ran on 24,208 programs.

| site | probe reaches | control (where) | control reaches | what replaced it |
| --- | --- | --- | --- | --- |
| `shapeFieldParse` (6 sites) | — | no caller | — | deleted, provably identical |
| `nameFieldCodeTy` → `nameStripSpaces` | 0 | `nameFieldCodeTy` entry | 10,754 | floor on the folded-set rung |
| `monoArgTyNameRep` → `arrElemSuffixed(spn)` | 0 | function entry | 255 | floor on a spread-copy pin |
| `sTyIxOfNameTy` → `resolveAnnot` (generic application) | 0 | function entry | 9,883 | floor on `annGenAppSpanEnds` |
| `slotRowTyOf` → `resolveAnnot` (inline shape) | 0 | the name ladder | 9 | floor on `nameIsShapeSpanEnds` |
| `unionHasAtomTy` → `tyTopIndexOf`, `unionHasAtom` | 0 | function entry | 0 (never entered) | rung deleted; the existing floor answers |
| `unionBoxHasNoRow` → `valueAtomKind` | 0 | its one caller's arm | 4,621 | floor after the member count |
| `emitUnionUnionEq` → `valueAtomKind` | 0 | function entry | 43 | floor on an unbanked arm kind |
| `emitMapGetOrUnionBox` → `valueAtomKind` | 0 | function entry | 32 | floor on an unbanked residual |
| `coalValUnionResidualKind` → `valueAtomKind` | 0 | function entry | 296 | same |
| `emitCoalesceCallStash` → `valueAtomKind` | 0 | function entry | 985 | same |
| `emitCoalesceUnionField` → `valueAtomKind` | 0 | function entry | 885 | same |

The wasmEmit floors removed the last callers of `removeAtomFromSet`. Its chain had no other
caller, so it is deleted whole: `removeAtomFromSetOf`, `removeAtomIdOf`, `removeAtomRestOf`,
`msRemoveAtomId`, `msSubAtomOrView` and `msSubAtom`. `msSubAtomOrView` → `roListInnerName` is one
of the 34 sites, so it goes with the chain. `msSubAtom` had no compiler caller; only a comment in
a `tests/cases` file kept it off the dead-export list.

`unionHasAtomTy` is never entered: its only callers, in `emit_map_value_slots.vl`, are not reached.
Its rendered-member rung goes, and the `emitFail` it already had answers.

Two floors keep a parse as their condition: `annGenAppSpanEnds` in `sTyIxOfNameTy` and
`nameIsShapeSpanEnds` in `slotRowTyOf`. A name with no type has nothing else to test. Each is
now a refusal, not a resolution.

`nameFieldCodeTy`'s spelling parameter is unread now (`_t`). It has 8 callers across
`emit_classify`, `emit_collect` and `emit_shape_intern`. Dropping it is a follow-up for after
lane E's step (d).

## Not taken: functions other lanes hold

- `emit_base.vl` (lane E), 9 sites:
  - `nameIsI32KeyedMap` (2), `isVariantBoxUnionAtoms` (1) and `annObjFieldSplit` (5) have no
    caller at all;
  - `normTypeAtom` → `groupInnerOf` (1).
- `emit_union_atoms.vl` (lane H), 6 sites: `registerValueUnionNameTy`, `atomArmUseBits`,
  `unionHasClosureArm`, `unionClosureArmName`, `unionClosureArrElemUnion`,
  `unionRefArrayArmSlotForNestedElem`.

## Measurement

Sweep with fixpoint seeds, master `846a645b` → this: all 24,208 the same (0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps).

Render-parse census: ty-parse-unclassified 54 → 35, and ty-string-parse 66 → 65. The string-parse
site that left is `internShapeDeepTyGo`'s `isValueUnionName`, from #7753, which merged after the
baseline was recorded. `scripts/render-parse-origins.txt` re-points `monoArgTyNameRep`'s graded
site to ordinal 0. The cut removed the earlier `arrElemSuffixed` call, so the graded call's
ordinal fell from 1 to 0.

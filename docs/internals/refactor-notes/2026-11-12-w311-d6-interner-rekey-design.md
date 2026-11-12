# Step 7 L2: the D6 shape interner keyed by type, design, 2026-11-12

Lane F's design for the last three renders in the L2 deviation:

- `internShapeDeepOfTy`, `shapeWalkKeyOf` and `internArmShapeRow` (`emit_shape_intern.vl`) call
  `tyToEmitName`;
- the result is the string the shape interner walks, splits and stores as `sNames[row]`.

The goal is that the interner walks the record TYPE, and that `sNames` becomes a label nothing
decides on. Measured at master `1e3a4f41` plus #7636. Nothing is built yet.

## What keys a struct row today

- **Finding a row is already type-first.** `internInlineShapeTyGo` asks, in order:
  `structRowOfRecordTy(fieldsTy)`, the layout match (`annShapeLayoutRowOf`,
  `annShapeIndexOf`), the same-type row (`annSameTypeRowOf`), then the wider row. Each of these
  reads the record type or the coded fields, never the name.
- **The fields come from the SPELLING.** The interner splits the rendered name
  (`shapeInnerFieldSplit(groupInnerOf(nm))`) into field names and field texts. It codes each
  field from its text and type (`nameFieldCodeTy(ftxt, fldTy)`), and recurses on the text
  (`internShapeDeepTy(ftxt, fldTy)`). Three places put a row's NAME back in as a field text
  (`ftxt = sNames[iidx]`, `ftxt = sNames[xr]`, the arm's in-flight name), and it is parsed
  again one level down.
- **The walk key is a render.** `shapeWalkKeyOf` keys the deep walk on the nominal name, else
  `tyToEmitName(ty)`, else the tagged-set spelling. It feeds `isValueUnionName`,
  `registerValueUnionNameAB` and `unionSetAtomsOf`. Those are union-name readers on the text,
  and the registry is lane G's.
- **A minted row stores the spelling.** `sNames.push(nm)` stores it, and `recordSRowDeclOfName`
  and `sTyIxOfNameTy(nm, tyIx)` read it back.

So the RENDER is the interner's input format: the type exists at every step, but the walk is
driven by text.

## What the key becomes

1. **The walk is driven by the type.**
   - `internShapeDeepTy(ty)` recurses on the type's structure: through `TyNullable`,
     `TyArray`, union members and function parameters and results, to each `TyObj`.
   - The cycle guard is the type stack it already keeps (`shapeWalkStack`).
   - The text parameter goes.
   - `internShapeDeepOfTy` stops rendering, and returns the row's label, not a spelling.
2. **A shape row's fields come from `TyObj`'s fields.**
   - The field names come from the type, in declaration order. `fieldNameOrder` already
     canonicalises the order.
   - The codes come from `fieldCodeOfTy`, which lane H's descriptor work is moving to: the
     field type alone.
   - A nested record field's row is `structRowOfRecordTy(fieldTy)`, minted on a miss, and is
     never re-entered by name. The three `ftxt = sNames[...]` hand-backs go.
3. **The row's key is its record type.** That key already exists: `sTyIx[row]`,
   `structRowOfRecordTy` and `repRowOfTyStruct`. No second key is introduced.
4. **`sNames[row]` is a label only.**
   - A declared record keeps its declared name.
   - A shape row's label is a stable synthetic name, kept equal to today's text where it is
     printed (wat names, diagnostics), so module bytes need not move. The render is computed
     once, at mint time, for output only, which the residue's "rendering is for output" floor
     allows. It is never parsed.
   - The arm mint (`internArmShapeRow`) takes the arm's type and needs no `armMintRenderOf` /
     `tyToEmitName` spelling.
5. **The walk's union keys go to lane G's typed entries**
   (`registerValueUnionOfTy`, `unionTyArms`), so `shapeWalkKeyOf` has no reader left and is
   deleted.

## What each reader of `sNames` needs

The tree has 52 reads of `sNames[...]` in 36 functions, and `structIndexByName` has 19 call
sites. They fall in three groups. **The probe below grades them; the grouping here is from
reading, not measurement.**

| group | readers | what each needs |
| --- | --- | --- |
| **label** (output: a wat or type label, a diagnostic, a row dump, a pin name printed) | `emitTypeLabelNamed` (driver), `rowDumpBuild`, `synthRecEqCoreFn` (a function's name), `bindTrim` (lint), mono pin names (`monoPinSpellRowName`, `monoClosedPinOwnTy`, `monoRecordNominalPin`, `monoRecordRowPin`, `monoBundle*Pin*`, `monoClosedTyName`, `monoArgTyName*`, `monoRetRowName`) | nothing, if the label keeps its text. Mono's pin names are lane D's (w317) and are judged there. |
| **a name handed to a name reader** | `arrLitElemName*`, `anonRefListFieldKey`, `anonFieldElemName`, `anonRefListElemKeyOfTy`, `collectARefArrayAnn`, `collectArrNewIntr`, `rlRepRowNameOfTy`, `mvShapeOfValNameArmTyGo` (4), `fieldRefElemName`, `armTwinRowName`, `anonMintRowFor`, `collectMapFilterUse`, `expObsParamOf`, `isPlainAliasRef` | the row index or `sTyIx[row]` instead of the text. Each one's consumer is a ref-list or map-value label (this lane's, already keyed by type) or a struct-by-name find (lane B's `structIndexByName` population). |
| **a decision on the text** | `internInlineShapeTyGo` (2, the field-text hand-backs), `sIsAnonRow` (the `#anon` prefix), `sNameIxSync`, `wholeShapeRowOf`, `shapeNominalOfTy`, `slotRowTyOf`, `anonRowServes`, `arrLitElemHintTy` | `sIsAnonRow` becomes a column set at mint. The others read `sTyIx[row]`, `sRowDecl[row]` or the row index. |

## The PR sequence

Each cut is a PR with its own note. A cut that moves bytes carries `sweep`.

1. **The instrument.** Add an armed `$VL_OPAQUE_SNAMES=1` mode that stores each shape row's
   label as `#rowN` instead of its text, then record the sweep. Every program that moves names a
   decision reader. This gives the measured population for the table above.
2. **The walk by type** (`internShapeDeepTy(ty)`). Delete the text parameter and
   `internShapeDeepOfTy`'s render (one render). `shapeWalkKeyOf`'s union-name uses go to lane
   G's typed registry entries (tell G first). This deletes `shapeWalkKeyOf`'s render (two).
3. **Fields from `TyObj`.**
   - `internInlineShapeTyGo` reads the field names and types from `fieldsTy`. The three
     hand-backs become row indices.
   - `shapeInnerFieldSplit` keeps its callers that hold no type (`internShapeAs`, the
     declared-alias path), each named as a floor or converted.
   - `internArmShapeRow` takes the arm type, which deletes the third render.
4. **The decision readers.** Convert them as the instrument names them: `sIsAnonRow` becomes a
   column, and the rest read `sTyIx` or the row. Each group is one PR, graded by the instrument
   plus the sweep.
5. **The labels.** Labels need nothing, and the instrument proves it: with the decision readers
   converted, an opaque-label run differs from a plain run only in printed names.

`sFieldElemName` (this lane's) is already filled from the field's type (`shapeFieldElemName`,
cut 4). It moves with cut 3 only if its label stops matching `sNames`.

## The probe that grades each cut

- **Per cut:** fixpoint seeds before and after, over the whole sweep population, and
  `runs → not-runs` 0. A byte-identical cut says so; a cut that moves bytes names its movers and
  checks them by size, type count and wat lines.
- **The opaque-label instrument (cut 1), rerun after each cut:**
  - the number of programs whose output or outcome moves under `#rowN` labels is the number of
    decision readers still live;
  - it must fall with each cut and end at 0;
  - its control is a run with the mode armed on a program known to print a row name: the `#rowN`
    text must appear.
- **The render-parse census:** renders 9 → 6, with this lane's 3 gone. Parses do not rise.

## Cut 1, built: the opaque-label instrument

- `compiler/opaque_snames_state.vl` holds the switch: `setOpaqueSNames(v)` is exported through
  `entry.vl`, and the interner reads `opaqueSNamesOn()`.
- The only change to the interner is its one labelling site. In `internInlineShapeTyGo`, a minted
  shape row is pushed as `#row<N>` instead of its spelling. `recordSRowDeclOfName` and
  `sTyIxOfNameTy` still read the spelling.
- The host arms it from `$VL_OPAQUE_SNAMES=1` in `arm_opaque_snames`. It is called on both
  compile paths: `compile_vl_instance` (`vl run`, `vl build`) and the in-guest CLI instance
  (`vl check`, `vl test`), as `setIdShadow` and `setClsCensus` are.
- The compile cache keys on every `VL_*` variable that is not inert, so an armed compile is
  never served an unarmed result. `vl_compile_cache_test.ts` classifies `setOpaqueSNames` as an
  `input`.

**Inert when unset.** Over the whole sweep population (24,192 programs), the seed with the
instrument and the seed of master `fe0c3ce3` record the same modules and outputs: all 24,192
the same.

**Armed control.**
- The row dump of `const ps: {x: i32, y: i32}[] = …` reads `row 0 {x:i32,y:i32}` unarmed and
  `row 0 #row0` armed.
- A probe build with an `emitFail` behind the switch fires under `vl run`, `vl check --codegen`
  and `vl check --batch` when armed, and never when unarmed.

**Armed against unarmed, the whole population:**

| outcome | programs |
| --- | --- |
| the same | 23,782 |
| bytes-only movers | 230 (`distilled/named` 76, `distilled/cells` 50, inventory 30, `cases/maps` 25, `cases/closures` 20, `cases/soundness` 9, others 20) |
| runs → not-runs | 180 |
| new compiler traps | 1 (`tests/cases/generics/union-of-records-arm-holding-type-param-built-at-instance.vl`) |

The 180 lost runs fail at two sites:

- **178 at `emitProgram: nested-struct field element type is not interned`** (for example
  D1031). This is one decision reader. A nested-struct field's element type is recorded by
  resolving its stored element NAME (`recordSFieldElemRowTy(nm, keyK, -1)`, through
  `recordFieldElemRow`). That name is the row's `sNames` text (`ftxt = sNames[iidx]`).
  `sFieldTgtStructIdx` then reads the recorded type and finds no row. The fix is cut 3's: pass
  the field's own type as the hint.
- **1 at "`is` names a type that is not a union variant"**
  (`distilled/named/d2781_run_generic_pattern.vl`).

The 230 bytes-only movers and the trap are the next layer. They are graded after the
178-program reader is converted, when the instrument is rerun.

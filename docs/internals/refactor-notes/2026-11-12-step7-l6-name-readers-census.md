# Step 7 L6: a census of the name readers, and the first batch that holds the row, 2026-11-12

Lane w310's share of the union-registry split is the callers of `unionSetAtomsOf`,
`unRowOfName`, `unionMemberSetOf` and `unionArmsOf`: 80 calls on 79 lines. A probe tagged each call by its
site and recorded whether the name passed was bound to a row. The population is the whole sweep,
24,119 programs, plus a self-build of `compiler/entry.vl` under the probe compiler, since the corpus
cannot see the compiler's own calls. 29 lines are reached by neither and are left out of the table.

| site | function | callee | programs | name has no row | self-build |
| --- | --- | --- | --- | --- | --- |
| `emit_union_registry:171` | `unMemRowOfName` | `unRowOfName` | 18,366 | 18,116 | yes |
| `emit_union_registry:156` | `unNameBound` | `unRowOfName` | 15,265 | 14,791 | yes |
| `emit_mono:8194` | `monoRegisterPinUnion` | `unionSetAtomsOf` | 7,220 | 6,080 |  |
| `emit_mono:8061` | `monoPinUnionCollapses` | `unionSetAtomsOf` | 5,021 | 4,441 |  |
| `wasmEmit:9775` | `boxDstName` | `unRowOfName` | 4,359 | 3,562 | yes |
| `emit_union_registry:473` | `unionArmsOfSetTy` | `unionMemberSetOf` | 3,642 | 218 | yes |
| `emit_union_registry:163` | `unionMemberSetOf` | `unRowOfName` | 2,768 | 47 | yes |
| `emit_union_registry:246` | `unionSetAtomsOfTy` | `unionSetAtomsOf` | 2,161 | 2,157 | yes |
| `emit_mono:7991` | `monoPinUnionName` | `unionSetAtomsOf` | 1,842 | 1,214 |  |
| `emit_shape_intern:419` | `internShapeDeepTyGo` | `unionSetAtomsOf` | 1,556 | 375 |  |
| `emit_mono:8045` | `monoPinMintedUnion` | `unionSetAtomsOf` | 905 | 720 |  |
| `emit_shape_intern:241` | `internShapeArms` | `unRowOfName` | 618 | 55 |  |
| `emit_anon_fields:248` | `regUnionNameGo` | `unRowOfName` | 488 | 433 | yes |
| `wasmEmit:9392` | `emitUnionCoerceUnder` | `unionMemberSetOf` | 297 | 0 | yes |
| `emit_mono:2609` | `monoSubstLetType` | `unionSetAtomsOf` | 240 | 19 |  |
| `emit_classify:4475` | `memberUnionFieldName` | `unionArmsOf` | 162 | 0 |  |
| `emit_union_atoms:460` | `mvShapeOfValNameArmTyGo` | `unRowOfName` | 153 | 15 |  |
| `emit_mono:8030` | `monoPinMintedUnion` | `unionSetAtomsOf` | 141 | 50 |  |
| `emit_union_registry:507` | `unionRowOf` | `unRowOfName` | 141 | 0 | yes |
| `emit_mono:1220` | `monoNameNarrowsFrom` | `unionArmsOf` | 102 | 80 |  |
| `emit_mono:1289` | `monoWideArmsHoldBrace` | `unionArmsOf` | 102 | 97 |  |
| `emit_shape_intern:427` | `internShapeDeepTyGo` | `unionSetAtomsOf` | 58 | 5 |  |
| `emit_shape_intern:383` | `internShapeDeepTyGo` | `unionSetAtomsOf` | 56 | 0 |  |
| `emit_union_registry:1182` | `isUNameDeclAB` | `unRowOfName` | 56 | 43 |  |
| `emit_classify:10958` | `sharedUnionFieldPlan` | `unionMemberSetOf` | 44 | 0 | yes |
| `emit_union_atoms:2268` | `unionArmMemberTys` | `unionMemberSetOf` | 36 | 0 | yes |
| `wasmEmit:4491` | `unionCarriesLitUnionArm` | `unionMemberSetOf` | 26 | 7 |  |
| `emit_union_atoms:2740` | `unionArmTys` | `unionArmsOf` | 24 | 0 | yes |
| `emit_union_registry:204` | `unionMemberAtomsOf` | `unionSetAtomsOf,unionMemberSetOf` | 21 | 21 |  |
| `emit_start_block:448` | `nodeMixedUnionName` | `unRowOfName` | 20 | 0 |  |
| `wasmEmit:12062` | `emitUnionLitIs` | `unionMemberSetOf` | 19 | 0 |  |
| `wasmEmit:10816` | `emitUnionConcreteEq` | `unionMemberSetOf` | 17 | 0 |  |
| `emit_collect:9209` | `collectDeclaredUnion` | `unionSetAtomsOf` | 16 | 16 |  |
| `emit_start_block:523` | `coalesceResultUnionName` | `unRowOfName` | 16 | 0 |  |
| `emit_collect:9215` | `collectDeclaredUnion` | `unionSetAtomsOf` | 15 | 15 |  |
| `wasmEmit:8211` | `isValueUnionOfSet` | `unionMemberSetOf` | 15 | 15 | yes |
| `emit_union_casts:116` | `unionHasAtomKindArm` | `unionSetAtomsOf` | 13 | 0 |  |
| `wasmEmit:38181` | `njKindsOfUnionName` | `unionArmsOf` | 10 | 0 |  |
| `emit_union_registry:1195` | `unionRowKeyAB` | `unRowOfName` | 4 | 0 | yes |
| `wasmEmit:21902` | `boxRetagNeeded` | `unionSetAtomsOf` | 3 | 0 | yes |
| `emit_union_atoms:1563` | `unRowOfRecordTy` | `unRowOfName` | 2 | 2 |  |
| `emit_union_atoms:2742` | `unionArmTys` | `unRowOfName` | 2 | 0 | yes |
| `wasmEmit:21957` | `emitBoxAtomRetag` | `unionSetAtomsOf` | 2 | 2 |  |
| `wasmEmit:21959` | `emitBoxAtomRetag` | `unionSetAtomsOf` | 2 | 0 |  |
| `wasmEmit:31287` | `staleBoxFrom` | `unionSetAtomsOf` | 2 | 0 |  |
| `emit_shape_intern:829` | `unionSetNamesAtom` | `unionSetAtomsOf` | 1 | 0 |  |
| `emit_union_atoms:2280` | `unionSetHasAtom` | `unionSetAtomsOf` | 1 | 0 |  |
| `emit_value_sites:401` | `memReadBoxedAtomKinds` | `unionSetAtomsOf` | 1 | 0 |  |
| `emit_classify:10964` | `sharedUnionFieldPlan` | `unionMemberSetOf` | 0 | 0 | yes |
| `wasmEmit:21904` | `boxRetagNeeded` | `unionSetAtomsOf` | 0 | 0 | yes |

Three groups follow. A site whose name always has a row is a round trip, and its caller can hold
the row. A site whose names mostly have no row parses a spelling, and needs its caller's type.
The `emit_mono.vl` pin namers are the largest of those.

## Changed

The first batch takes five round-trip sites, each of which holds the row or the type the name
came from:

- `memberUnionFieldName`'s arm walk reads the arms off the read's row (`unReadRowOut`).
- `sharedUnionFieldPlan` reads its member set off the read's row, or the expression's row.
- `emitUnionConcreteEq` and `emitUnionLitIs` read their arm spelling off the box's row.
- `nodeMixedUnionName` reads the row its type keys to, instead of the row its rendered name binds.

`unionMemberSetOfRow` (`emit_union_registry.vl`) is the row-first form of `unionMemberSetOf`.

## Proof

- **Self-compile.** `--prove-fixpoint` holds. The head source built by a master seed and by this
  one is byte-identical.
- **Targeted.** The 200 file cells reaching the five sites were built on a master seed and this
  one: 200 byte-identical modules. CI's sweep is the proof for the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. A fresh `render-parse-census.vl`
  report reads 12 renders and 44 parses, the baseline. A fresh `dead-exports.vl` report has 0 dead
  exports.

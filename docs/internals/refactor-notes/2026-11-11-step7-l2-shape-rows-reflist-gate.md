# Step 7 L2 §7: collectA's ref-list annotation gate asks the type (70 → 69), and the shape-rows floors measured, 2026-11-11

This lane covers nine type-string parse sites in `emit_shape_rows.vl` and their callers:
`refArrShapeKindGo`, `refElemArrName`, `nameIsNulRefList`, `refArrElemKeyDeferred`,
`shapeFieldElemName`, `rlCanonLitUnionAtoms`, `mapValKindLowerable`, `canonLitUnionArms` and
`nameIsLitSpelling`. Base is master `ada32709` with a fixpoint seed of 6,615,486 bytes. The checked-in
seed was not a fixpoint; it converged on the third refresh. The population is the sweep's 23,882
programs.

## Probes

The probes were `emitFail` markers in compilers built from a scratch copy of `compiler/` by the base
seed. None was refreshed into the seed. Each probe had its own compiler, so no marker masked another.
The control for P1N was a program that runs on base and fails with the marker on the probe build.
P2's own disagreements were its control: it fired in 49 programs. Counts are **programs**.

| probe | site | reached |
| --- | --- | --- |
| P1 | `ensureRefElemTys`: spelling kind (`refArrElemKind(refElemArrName(…))`) with `kindTy` held | 10, every one a union of lists (`f64[]\|string[]`, `i32[]\|K[]`, …) or `i32[]` under one, which `refListElemKindOfTy` declines by design |
| P1N | the same, with no type | 1,226 |
| P2 | collectA's `nameIsRefArray(n) \|\| nameIsNulRefList(n)` against `tyIsRefArray \|\| tyIsNulRefArray` of the node's type | 49 disagree: 41 a numeric literal-union list, 6 an unwritten parameter node (`tyName` ""), 2 a union of same-shape lists |
| P2U | the same gate true on a node with no type | 0 |
| P2′ | P2 with numeric literal-union elements and unwritten nodes excluded | 2 (`inline-same-shape-array-union.vl`, `nullable-fold-twin-lists-at-every-delivery.vl`), both where the type folds `A[]\|B[]` to one list |

## Changed

- `collectATypeRef` gates the ref-list annotation rung on `annTyIsRefList`: a written annotation
  whose recorded type is a ref list or a nullable one, and whose element is not a numeric literal
  union. The spelling is no longer read there.
- `nameIsNulRefList` has one caller left, `fieldCodeOfSpelling` (w309's), and is no longer exported.

The two P2′ programs now run `collectARefArrayAnn` on their union annotation. Their wasm is byte-identical.

## What stays, and why

| site | floor |
| --- | --- |
| `refElemArrName` (`ensureRefElemTys`) | 1,226 programs reach it with no type: `ensureRefElem`, the template field at a type parameter (`rlRowOfNameMinted`) and the kind-9 inner recursion. The 10 typed reaches are unions of lists, which have no single element kind |
| `nameIsNulRefList` | `fieldCodeOfSpelling` (w309) |
| `nameIsLitSpelling` | both callers are the shape-spelling row scan, `shapeRowScanK` and `shapeFieldTypeCompatK` (w307) |
| `refArrElemKeyDeferred` | `shapeFieldTypeCompatK` (w307), `shapeFieldElemName`, and `anonRefListElemKeyOfTy` (a nominal render cut to its element) |
| `shapeFieldElemName` | `shapeFieldTypeCompatK` passes -1 by construction (w307); seven other callers hold a field type |
| `mapValKindLowerable` | `fieldCodeOfSpelling` with no record type (w309); `fieldMapLowerable` already asks the type first |
| `refArrShapeKindGo` | the ladder behind `nameIsRefArray` and `refArrElemKind`, the name-keyed ref-list layer |
| `rlCanonLitUnionAtoms`, `canonLitUnionArms` | the spelling descent passes -1 to every nested call, and `mvSlotOfValNameFindK` passes -1 at the top. They become cuttable once the descent carries the element, value and field types |

## Proof

- Refresh ×2 is a fixpoint at 6,615,613 bytes (+127).
- `sweep.vl diff` from base to candidate: **23,882 same**, 0 bytes-only movers, 0 output movers, 0
  `runs → not-runs`, 0 new compiler traps.
- The render-parse ratchet goes from 70 to 69 parses (38 renders unchanged), with `--write-baseline`
  in this PR.
- `scripts/gate.sh`: all 23 rows pass. These include lint-self and fmt, seed size, late demands,
  plumb-shape cost, the kind-ladder, dead-export and render-parse budgets, rep-fuzz, the filed
  witnesses, the capability probes and the distilled corpus.

# Step 7 L6: a list of a record row is found by its element type, and `forceRefListOfTy` keys by type, 2026-11-12

Lane F's cut 1 of the ref-list name producers. Base is master `cf01f012`, fixpoint seed
6,735,476 bytes.

## The re-measure this lane works from

| measure | instrument | master `cf01f012` |
| --- | --- | --- |
| emitter renders / parses | `render-parse-census.vl -- --list` | 12 / 40 |
| `emit_shape_rows.vl` parses | the same | 11: 5 in `refArrShapeKindGo` (F), 2 `mapValNameOf` in `shapeFieldElemName` (F), 4 H's |
| `rlRowNameOfTy` calls (lines naming it, with imports and a comment) | grep | 15 (19) |
| `rlSlotByName` calls | grep | 5 |
| reflist name producers | `vkind-census.vl -- --slots-list` | 4 |

`nulRefElemEmitName` no longer renders (`2026-11-12-w311-nulref-elem-nominal.md`), so D1's render
is gone.

## What changed

| site | was | now |
| --- | --- | --- |
| `arrLitRowOfInnerRows` (`emit_classify.vl`) | `rlSlotByName(rlElemName[r] + "[]")` | `rlSlotOfTy(mkArrayTy(rlElemTyIxAt(r)))`, the type `rlListOfRowMinted` already mints with; a row with no recorded type is an invariant `emitFail` |
| `forceRefListOfTy` (`emit_union_atoms.vl`) | `ensureRefElemTys(name, -1, e)`: keyed by the name | `ensureRefElemTys(name, e, e)`: keyed by the element type |

## Measured

Validated `emitFail` probes over the sweep population (24,170 programs):

| probe | control: reached | disagreements |
| --- | --- | --- |
| `arrLitRowOfInnerRows`: name slot against type slot | 4 (D15159, D15356, D15357, D15358) | 0 |
| the same, the row records no type | 4 | 0 |
| `forceRefListOfTy`: name key against type key | 90 | 0 |

`rlListOfRowMinted`'s stored label differs from `rlRowNameOfTy` of the list type in all 4 reached
programs: the row is an `#anon0` record, whose type renders no nominal name. That label is not a
key; the mint is keyed by `mkArrayTy(rlElemTyIx[r])` already. It stays as a label.

Fixpoint seeds on both sides, the whole sweep population: same 24,170, bytes-only 0, output
movers 0, runs → not-runs 0, new compiler traps 0.

## Counts after

- `rlSlotByName` calls: 5 → 4. The rest are the floors `rlRowOfNameMinted` (2) and
  `sFieldRefSlot` (2): a template field at an open element type.
- Keyed-by-name `rlRowNameOfTy` mints: 4 → 3.
- render-parse unchanged (12 / 40).

## Proof

One refresh to a fixpoint, at 6,735,517 bytes. `lint-self.sh`, `regress.vl` (no runs lost),
`rep-fuzz-check.sh` (exact), `check-filed-witnesses --strict` (4,847 as filed), late-demands,
seed-size (+2.2%), plumb-shape-cost and the render-parse budget pass.

# Step 7 L2 §7: an anonymous inline shape finds its struct row by type first, 2026-11-11

This is step 1 of the D6 inline-shape interner's re-key (census:
`2026-11-11-step7-l2-shape-rekey-census.md`). The interner found a shape's row by its field set
under the walk's spelling. An anonymous record now finds its row by type first, through
`structRowOfRecordTy`. That is the key the struct registry has stored rows under since #7009.
In lane w319's (canonical type, declaration) key, it is the case with no declaration.

The base is master `ebbc4bc2`+, with the cases population.

## Changed

- `internInlineShapeTyGo` asks `structRowOfRecordTy(fieldsTy)` before the field-set find
  (`annShapeIndexOf`), for a record with no declaration name (`tyToNominalName` is ""). A hit
  takes the path a field-set hit takes: the shape's type is aliased to the row, and an
  `#anon` row is marked aliasable.
- A declared record keeps its declaration's name as the key until w319's key lands.
- A type with no row falls back to the field-set find, as before.

## Expected movers

From the census, in 29 programs the field-set find returned a different row than the type key.
Those rows are same-spelling twins, two literal `#anon` rows, and `{f:(i32)=>i32}` against
`{f:(i32)=>f64}`, which the field codes do not tell apart. These programs are where this step
can move bytes. Step 2 (mint only when the type has no row) is the 57-program merge, and it is a
separate PR.

## Proof

- **Local.** One `refresh-compiler.sh`; `cases_wasm` 7,440 passed, 0 failed; distilled
  `regress.vl` reports no runs lost; `check-filed-witnesses --strict` grades 4,722, all as
  filed; lint-self clean; the export, ladder, comment, sentinel, scan and render-parse budgets
  are at or below baseline; `vl_scaling_shape` passes.
- **Sweep.** The PR's `sweep` job is the identity grade, and its movers are listed in the PR.

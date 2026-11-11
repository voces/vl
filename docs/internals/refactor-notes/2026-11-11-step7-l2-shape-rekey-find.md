# Step 7 L2 §7: an anonymous inline shape finds its struct row by type first, 2026-11-11

This is the D6 inline-shape interner's re-key, for anonymous records (census:
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

The census asked `structRowOfRecordTy` at the same point this find does, before the field-set
find. So every census case where the type already had a row now returns at the type find:

- the 29 + 5 programs where a find returned a different row;
- the 57 programs that minted over a row the type already had.

The census's step 2, minting only when the type has no row, needs no change of its own: a mint
is reached only after the type find has missed. The 18 programs whose name finds a row the
type does not reach keep the field-set find.

The census predicted up to 89 programs could move. The sweep found none. Every disagreeing
find either chose a row whose layout is the same heap type, or minted a row no emitted value
reads. So the census's disagreements were all in row identity, never in a module.

## Proof

- **Local.** One `refresh-compiler.sh`; `cases_wasm` 7,440 passed, 0 failed; distilled
  `regress.vl` reports no runs lost; `check-filed-witnesses --strict` grades 4,722, all as
  filed; lint-self clean; the export, ladder, comment, sentinel, scan and render-parse budgets
  are at or below baseline; `vl_scaling_shape` passes.
- **Sweep.** The job ran on `419754d1`. After a re-run of record jobs that failed at artifact
  upload, 23,910 programs are the same: 0 bytes-only movers, 0 output movers, 0 runs → not-runs.

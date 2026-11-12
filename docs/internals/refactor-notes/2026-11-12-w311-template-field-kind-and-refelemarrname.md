# Step 7: a template field's ref-list row takes its kind from the open type; `refElemArrName` deleted, 2026-11-12

After #7342, `ensureRefElemTys`' spelling floor (`refArrElemKind(refElemArrName(name))`) was
reached by one cell, `generics/declared-return-holds-litunion-beside-type-param.vl`. There a
generic struct's field `{ v: (T | K)[] }` is minted by name, because its element type was never
recorded. Three changes answer it by type:

- `iisPushFieldElem` (`emit_shape_intern.vl`) records the field's open element type `T | K` in
  the slot column, `sFieldElemTyIx`. It records it only where the name resolves to no type,
  and leaves `sFieldStoreTy` untouched, as w314 asked.
- `sFieldRefSlot` (`emit_shape_rows.vl`) keeps the row of a field whose open element type no
  row holds on its stored name. It mints that row through `rlNameMint`, which now carries the
  type. Taking every open-typed field to the name route lost 7 cells that the typed lookup already
  serves, among them `d15201_cell_record_list_record.vl` and
  `fn-tagged-ids-in-records-in-nested-lists.vl`. So the name route is taken only on a miss.
- `rlRowOfNameMinted` (`emit_collect.vl`) classifies by that type. `refListElemKindOfTy(T | K)`
  is the box, which is what the spelling gave.

The floor is then unreachable. It becomes an emit failure that names the contract.
`refElemArrName` and its two helpers, `nulStructElemNiche` and `nulBoxUnionElem`, are deleted.
The render-parse baseline's parse total falls from 58 to 56.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population, base master `9d03d3aa`: same
23,953, bytes-only 0, output movers 0, runs → not-runs 0, new compiler traps 0. The final seed,
after the helper deletion, gives the same result. No cell reaches the new failure.

# Step 7 D6: the shape-spelling tests read the type or the row, 2026-11-13

Lane F, the shape-spelling parse family from `render-parse-sites.md`. Measured at master
`653319b0`.

## What changed

The family was the callers of `nameIsShapeSpanEnds` and `tyGroupWrapsWhole`, which decide
whether a spelling is a whole inline record (`{a:i32}`):

| caller | spelling read | now | probe disagreements (24,218 programs) |
| --- | --- | --- | --- |
| `internInlineShapeFieldsTy` (an arm mint's label) | the arm's render | the label is not empty; `internInlineShapeTyGo` already refuses a non-record | 0 (the 6 programs with no brace spelling have an empty render) |
| `wholeShapeRowOf` (a row label) | `sNames[i]` | `sRowIsShape(i)`: a bit `internInlineShapeTyGo` sets on every row it mints | 7, all D14163's quoted-field record, whose spelling fails the brace parse; the sweep does not move |
| `anonHandleTyIx` (a pin name) | the pin | `pinIsAnonRecordTy(nm, ty)`: not an `#anon` handle, and a record no declaration, brand, alias or generic application names | 2 (D4300), which the sweep does not move |
| `sTyIxOfNameTy` (unhinted) | a row name | the shape rung and the generic-application floor are deleted | reached on a shape in 0 programs; the name misses in 9 (D11771), which return -1 as before |
| `slotRowTyOf` (a row's name ladder) | a row name | the shape floor is deleted | reached on a shape in 0; a miss in 9 (D11771), which returns -1 as before |

The two name rungs had no type to read: the name is all they hold. A shape spelling never
reaches either, so they go rather than becoming floors whose condition would be the parse itself.

`nameIsWholeSpanShape` (`emit_field_codes`) and `tyGroupWrapsWhole` (`emit_base`) have no
caller left and are deleted. `nameIsShapeSpanEnds` remains for `unionStructAliasShape`, which
reads a union declaration's source spellings (origin (c), not a render).

`shapeInnerFieldSplit`'s three sites belong to `internShapeAs`, which lane E holds.
`collectShapeVariantFields` no longer parses on master.

## Measurement

- **Sweep:** fixpoint seeds, master `653319b0` → this: all 24,218 the same (0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new traps).
- **Render-parse census:** ty-string-parse goes from 36 to 34 (`tyGroupWrapsWhole`'s walk and
  `sTyIxOfNameTy`'s shape resolution), and ty-parse-unclassified from 20 to 19 (the
  generic-application floor). The baseline is lowered.

# Step 7: a shape field's list and map element names are read off its type, 2026-11-12

`shapeFieldElemName` (`emit_shape_rows.vl`) records a shape-text field's element name. For a
ref-list (code 5), nullable ref-list (28), map (19) or nullable map (29) field, it read that name
off the field's spelling. It now asks `shapeFieldElemNameOfTy` first, which reads the element's
nominal row name off the field's type, a function type in parentheses. `fieldElemRowName` is
`rlRowNameOfTy` without the unfold, written here because `emit_union_atoms` imports this module.

## Measurement

The names differ in two ways:
- for a function element, only by the parentheses;
- for a record element, the spelling names the shape and the type names its declared twin, such
  as `{r:i32}` against `Circle`.

Twins share one heap, so the test is the rep row, not the name. Fixpoint seeds on both sides,
over the whole sweep population, base master `b835dc65`: same 23,962, bytes-only 0, output
movers 0, runs → not-runs 0, new compiler traps 0. Every name read off the type lands on the
same row.

## What still reads the spelling

An `emitFail` probe on the spelling arms of those four codes fires on 3 cells. Each is a template
field whose element type is open: `(T | null)[]` in D14726 and
`error-param-shadow-tyaram-nullable-elem.vl`, and `(T | K)[]` in
`declared-return-holds-litunion-beside-type-param.vl`. `tyToNominalName` gives an open type no
name. The arms, and their three type-string parses, stay until it does.

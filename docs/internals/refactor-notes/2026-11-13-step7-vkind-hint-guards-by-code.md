# Step 7, lane H: element-type hints keyed on the field's code, 2026-11-13

Lane F's FC_STRUCT cut (records no element name for a typed nested-record field) lost 332
runs, all `nested-struct field element type is not interned`. The cause was not
`recordFieldElemRow`'s name fallback. Three hint producers withheld the element type whenever
the element name was empty:

- `fieldElemHintOf` (`emit_collect`), through `if elemNm == "" { return -1 }`. It feeds the
  declared-struct and variant-node `pushFieldRow` callers.
- The anonymous-literal row's fallback (`emit_collect`), through `elemNames[pi] != ""`.
- The shape interner's other-code recorder (`emit_shape_intern`), through `if en != ""`.

Each guard was there so a field with no element records `-1`. That is a property of the field's
code and type, not of its name.

## The change

`fieldCodeHasElemRow(code, fty)` (`emit_lit_atoms`, beside `shapeFieldElemRow`) answers it:

- Union, record, ref-list, map and `| null` literal-union codes always have an element.
- An i32 code has one only as a literal set (`tyIsLitUnion` or a one-string literal).
- An i32-list code has one only as a string-literal set list.

The three producers ask it in place of the name test. Without the type test, a plain `i32`
field or list would start recording its own type, since `shapeFieldElemRow` returns the field
type for both i32 codes.

**Measurement:** sweep (`sweep.vl diff`, #7721's head `f803f4b1` against this, fixpoint seeds on
both sides): 24,205 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new
compiler traps. So with names recorded as before, no field took a different type. This unblocks
lane F emptying the FC_STRUCT name.

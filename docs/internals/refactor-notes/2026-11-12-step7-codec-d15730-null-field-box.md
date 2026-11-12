# Step 7 codecs: a `null` field at an inline nullable numeric literal union is stored in its box, closing D15730, 2026-11-12

The field-writer half of D15730. The registry half is #7332 (w316).

## What changed

`anonMintRowFor` (`emit_collect.vl`) codes a literal's `null` field value `FC_NUL_NONE`, a
`nullref` slot. When the literal is typed at a field whose type is a value union, the field is
now stored in that type's box instead: code 16, with the box's name as the element name.
`anonNullFieldBox` reads the name with `regUnionNameOfTy(recFieldTyOf(nodeTyIxOf(objIx), name))`.
A type parameter, or a field type that is no value union, keeps the `null` unit. So
`string | null`, `i32 | null` (which already built at the annotation's row) and every other
niche are unchanged.

## Measurement

`sweep.vl diff`, master's fixpoint (6,639,270 bytes) against this one (6,639,578 bytes), over
23,943 programs:

- 23,942 same;
- 0 bytes-only movers;
- **1 output mover**: `D15730`, compiler trap (invalid wasm) → runs;
- 0 `runs → not-runs`;
- 0 new compiler traps.

By hand, every delivery position runs: the parameter, the binding (`??` and `== null`), a `let`
store followed by a write, a list element and a return. The controls `string | null`,
`i32 | null` and the alias spelling print as before. The fixture is
`tests/cases/structs/null-field-at-inline-numeric-literal-union.vl`, which is invalid wasm on
master.

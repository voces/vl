# A list widened to its readonly nullable-element list, shared (2026-11-25, lane COV-START)

`argument coercion`'s `elem-storage-class-widening-runs`: a list handed to a `readonly` list of its
element or `null` shares the list, per DECISIONS.md "No implicit container widening". A nullable
ref is the same reftype, and a niche-nullable scalar is the same element with a sentinel. The IR's
list retag (`listRetag`, `ir.vl`) took this only for a record, list or map element.

## The mechanism

`recElemCore`, the element `listRetag` compares, now also names:
- a string, beside the string-or-null its nullable ref holds;
- a boolean, beside a `boolean | null` (niche discipline 2);
- an atom, beside a `K | null` (discipline 3).

The builder and the verifier share `listRetag`, so both admit it. The converting pairs (`i32` to
`i64` or `f64`, `f32` to `f64`) already take the list-copy coercion.

## Measured, on the class's programs

| program | master | head |
|---|---|---|
| `arrays/elem-storage-class-widening-runs` | `argument coercion` (start) | claimed |

It matches legacy byte for byte under the armed shadow, with the same output under
`VL_IR_STRICT=1`. Sweep: `tests/cases/arrays/readonly-shared-list-widening-positions.vl` covers an
argument, a readonly binding and a return, in the start body and a function. On master it misses
in the start (`argument coercion`), `inFn` and `wide` (`return coercion`).

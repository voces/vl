# A literal's list part takes its elements' build (D16765), 2026-11-16

Lane WIDTH. Stacked on #8572 (D16211's `map` half), which carries the D16765 row.

## What changed

`recLitPartBuiltTy` (`check_bind_adopt.vl`) gives a record or list literal's part the type its
value is built at, so the literal is stamped with that part where it differs. Until now it
answered only record parts. It now also answers a list part, a binding or a call, whose elements a
build holds at another record (`recHeldElemBuilt`, which reads a same-elements call as its receiver
since D16763): the part is held at the list of that record. The literal's field or element is
then laid out where the part's elements are, and the read through it no longer reaches a struct its
field type does not name.

## Measurements

| instrument | before (#8572's seed) | after |
| --- | --- | --- |
| `same-elems-result-in-literal.matrix.vl` (new) | 4 of 62 graded run, 1 SILENT | 29 of 62, 1 SILENT (D16767, the same on master), 0 runs → not-runs |
| `same-elems-result-of-built-list` | 22 of 58 | 24 of 58 |
| `map-callback-over-built-list` | 29 of 68 | 33 of 68 |
| `callback-over-built-list` | 45 of 50 | 47 of 50 |
| `kept-maker-delivery-record-list`, `kept-maker-list-result-delivery` | unchanged | 0 runs → not-runs |

The rest of each template is D16766's refusal at an annotated slot, the clause-2 debt D16763 left.

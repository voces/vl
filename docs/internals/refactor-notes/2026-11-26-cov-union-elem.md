# IR coverage: `??` over a field of a narrowed list element; the `index element coercion` families (lane COV-UNION, 2026-11-26)

## The change

`if xs[0] is J { xs[0].r ?? 0 }`, where `xs: (J | string)[]` and `r: i32 | null` (D8145,
`narrowed-element-nullable-field-reads-unbox`). The `??` field arm (`coalField`) reads its
receiver at its storage when legacy unwraps the box itself (`cfCast`), through `storageReadOf`.
That helper handled only a name, so it built `xs[0]` at the narrowed record and `buildIndex`
refused the box element read at a record (`index element coercion`).

- `storageReadOf` (`ir_build`): an element read is built under `storageReadEnter`, as the `is`
  path reads an element at its storage, and so leaves the box.

## Measured

Class cut (the 13 programs whose first miss was `index element coercion`, plus the sweep),
#10229's head before and this tree after:
- `index element coercion`: function rows 15 → 13, start rows 5 → 3.
- Claimed functions: 67 → 69 of 85. Start bodies: 8 → 10 of 13. Fully claimed programs: 0 → 2.
- The D8145 witness's start is claimed as well.

Q58 sweep: `tests/cases/unions/narrowed-element-field-coalesce-in-each-position.vl` (printed,
bound, arithmetic, passed, returned). Its output equals master's. Master reports
`index element coercion` on it; this tree reports blockers none.

## The `index element coercion` families (the re-grade the coordinator asked for)

`buildIndex` misses with this sentence wherever the element rep is not the read's rep and no
named view applies. Grouped by element rep and read rep, over the 24 rows of the member-family
class cut:

| element → read | rows | programs |
| --- | --- | --- |
| box → record / atom / closure (a narrowed union element) | 6 | D4201, D8145, `narrowed-fn-arm-place-call`, `index-place-literal-else`, `narrowed-element-nullable-field-reads-unbox`, `narrowed-arm-unannotated-binding` |
| str → atom (a literal set stored as its string) | 5 | D4916, `string-cell-narrowed-to-literal-set-reads-its-string`, `inferred-string-list-is-atom-list` ×3 |
| nullable(closure) → closure | 2 | D3973, `nullable-closure-return-fallthrough` |
| record → record | 2 | D16800, `generic-list-call-binding-beside-own-instance-runs` |
| map → map | 2 | d16121, `pinned-hole-fn-map-read-through-element-field-or-let` |
| atom → str | 1 | `eq-literal-narrows-boxed` |
| nullable(bool) → null | 1 | `narrowed-null-field-elem-compared-with-other-nullable` (`elem`) |

This change closes the two box → record rows reached through a `??` field. In D4201's box → atom
row, legacy reads the box's string payload (`ref.cast` to the string heap) where the read's
type is the literal set's atom, which is a separate mechanism. The record → record and
map → map rows are row-rep versus legacy-layout disagreements, parked until after I8.

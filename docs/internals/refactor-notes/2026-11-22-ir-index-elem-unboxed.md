# IR: a ref list read of a box element narrowed at its place (2026-11-22, lane IR-N3)

`index element coercion` was `buildIndex`'s refusal of an element read whose rep is not the list's
element rep. Ranked by an instrumented miss, its largest sub-shapes are ref list reads of a box
element: a `T | null` box (`(i32 | null)[]`), or a union box, whose place the checker narrows to
one member. Legacy's `refListGetTail` writes these as the recovered element, then
`emitPlaceNarrowContainerUnbox` for a narrowed container, else `emitUnionUnboxTail` at
`idxNarrowAtomKind`.

## The change

- That decision is `refListReadUnboxOf` (`REF_READ_CONTAINER`, an atom kind, or -1), and
  `refListGetTail` asks it.
- The builder admits a read at the rep that answer leaves (`refUnboxedAt`). That is a list or map
  for a container, or the atom kind's rep (`irBAtomKindRep`), only on the `ref` arm and only where
  the element is not nullable. The lowering already writes `refListGetTail`.
- The verifier admits an element read of a box element at another rep.

## Witness

`tests/ir-shadow-rows/index-ref-box-element-unboxed.vl`: `xs[0]` of `(i32 | null)[]` under
`xs[0] != null`, and of `(f64 | string)[]` under `xs[0] is f64`.

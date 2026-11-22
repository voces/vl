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

## Measured (fixpoint seeds of master 47b9d7bb and the change)

- tests/cases armed shadow: covered and matched +102 (67,752 → 67,854). `uncovered index element
  coercion` 120 → 15, start 17 → 12. No new `fail` or `mismatch` row. The rest is the scalar arm
  over a nullable atom or boolean element and the closure element.
- Corpus: `index element coercion` 51 → 16; no-blocker 44,816 → 44,851 of 45,678.
- Legacy: tests/cases A/B identical 7,324 (differ 0), `--names` identical, mode-3 self
  byte-identical. L2 fuel per PR +0.01%.

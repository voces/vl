# Step 7 L6 (lane G, cut 6c): a let binding's union box by its type, 2026-11-12

The base is master `524e1d27`. `emitLetDeclStmt` named a union-annotated binding's box by rendering
its annotation (`tyNameOf`), and `emitLetInitValue` read the box's type from
`letBindingUnionTy`, which answers -1 for an un-annotated binding whose initializer is not itself
a union.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, ran over the sweep list
(24,170 programs).

| question | answer |
| --- | --- |
| the annotated name against `boxTyName` of the annotation's type | 1,057 equal, 123 the same row spelled differently, 2 member-order spellings of a row the type names; no gate flips |
| a let reaching the box whose `letBindingUnionTy` names no box | 126 |
| … with `letUTy = -1` | 2 (`i32[] \| i32`); `letBindTy` names the box exactly in both |
| … with a type that names no box | 124, all `i32 \| null` from `letNulScalarBoxName`: a nullable function value read out of a function-value map or list (`fn-map-*`, `hole-fn-*`, the d15116 grid, d15187, D9102, D9183, D9252, D15163, D15174, D15353). `nodeTyIxOf`, `elabNodeTyAt`, `nodeTyInOf` and `letBindTy` render no box for any of them |

## Changed

- The annotated binding's box is `boxTyName` of the annotation's type.
- `emitLetInitValue` falls back to `letBindTy` when `letBindingUnionTy` answers -1.
- The function-value case keeps `letNulScalarBoxName` under the function-set contract (#7664's
  sites 56 to 59): a function-value-set row has no element type, so it is keyed by its set.

## Left

The null-hole binding's `nliNameOf` is recorded by name alone; none reached the box without a
type in the census.

## Proof

- **Seed:** fixpoint.
- **Locally:** see the PR.
- **The full sweep:** CI's `sweep` label. The name reaches `emitUnionWideArmBox` →
  `unionArmsOfTy`, which reads the name before the type, so a same-row respelling may move
  bytes. Graded on the sweep's movers.

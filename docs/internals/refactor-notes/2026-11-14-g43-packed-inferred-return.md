# D16120: an inferred union return may hold a packed list arm, 2026-11-14

Lane G, following D16046. `inferRetFloorUnsupported` accepts an inferred union when
`valueUnionRetName` names it. That classifies each leaf with `retAtomKindOf`, whose list arm had
no packed element. A `u8[]`, `i8[]`, `u16[]` or `i16[]` leaf answered -1, so
`valueUnionFromAtomKinds` declined and the union fell to the `TyUnion` floor. `i32[]`, `f64[]`,
`f32[]` and `string[]` arms were never floored.

`retAtomKindOf` now answers 13 for every packed width. The checker asks only whether a leaf is a
single atom, so the widths can share `u8[]`'s kind there. The emitter keys each width's tag by
its row, as D16046 set up. `retAtomsCheap` already admitted a prim-element list, so nothing else
changes.

## Grading

- The D16120 witness prints `2`. So do its `i16` twin and each width beside `i32` and `string`.
  An inferred `W[] | null` also runs, and so does one inferred union holding `u8[]`, `i16[]`
  and `u16[]`.
- The `return_inferred` cells of `packed-list-union-arm-{u8,i8,u16,i16}.matrix.vl` were refused
  in both faces before this change. On the refreshed seed every width runs 82 of 82 cells.
- Gates: fixpoint, `lint-self`, `regress` (no runs lost), `rep-fuzz` (exact),
  `check-filed-witnesses --strict` (4933 as filed), late demands 8/8, seed size +0.5%, and every
  budget at or below baseline.

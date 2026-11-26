# IR box ladder: an assignment of `null` used as a value, boxed (2026-11-26, lane COV-IS)

- **The miss**: `box ladder` for `(s = null)` used as a value and delivered into a boxed `i32 | null`
  (regen-9: `soundness/null-assignment-value-at-its-destination.vl`'s `boxBinding`, `boxArgument`,
  `boxJoin`). The value is the `null`-unit re-read of the store, at a node that is no `null`
  literal, so `holeBoxPlanOf` names no arm.
- **What landed** (IR only; widens the absent-initializer rule): a `null`-unit value whose read
  reads nothing (`nulReadDropped`, which drops it) into a rep that holds the null box is that box
  (`NULL_OWN_BOX`), after the assignment's store.
- **Parity**: `ir-parity.vl --files` reads `same` on the sweep and the regen-9 program. Bytes
  differ in order: legacy writes the store inside the box's payload slot (a block yielding the
  null), the IR writes the store first and the box's bare `ref.null` after; the tag constant
  between them has no effect.
- **Q58 position sweep** (`tests/cases/soundness/null-assignment-value-boxed-positions.vl`, new):
  bound, passed, returned, an `if` arm, a list element, a field and the top level. Master: 6
  functions and the start body `box ladder`; here all claimed.
- Left: that regen-9 program's start body moves on to `assignment value nullLit rep`.

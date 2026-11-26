# Index element coercion: a box element narrowed to a record arm (lane COV-UNION, 2026-11-26)

## The row

`fromNestedElement` in regen-10: a list whose element is held as a union box (`RList` of `RBox`),
narrowed by `is` and read at a record arm (`if xs[0] is A { const q = xs[0] }`). The IR refused
it with `index element coercion`; legacy reads the box element and then unboxes it to the arm's
record (`ref.as_non_null`, `struct.get` of the payload, `ref.cast` to the arm).

## The change

- `indexBoxElemRep(ix)` (`ir_build`): for an `Index` with no pre-path whose array is held as a
  list of boxes, returns the element's box rep, and -1 otherwise.
- `armUnboxOwed` owes the arm unbox for such an index, and `armUnboxTemp` reads the element as
  stored (`irIndexHook` at the box rep) before `RArmUnbox`. It matches legacy's storage, following
  the layout ruling.

## Measured

- Sweep `tests/cases/unions/narrowed-box-element-read-at-record-arm-positions.vl` covers the nested,
  one-level, passed, read-twice, other-arm and top-level positions. On master, five functions and
  the start body block on `index element coercion`. On the head, `VL_IR_REQUIRE_CLAIM=1` exits 0
  and the `@log` lines match on both seeds.
- Census A/B over the regen-10 list plus the sweep: see the PR body.

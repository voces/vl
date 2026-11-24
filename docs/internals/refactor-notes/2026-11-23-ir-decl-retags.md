# IR: two declaration retags (2026-11-23, lane IR-D1)

The last two tests/cases one-offs of `declaration coercion` (#9773's note) are retags. Legacy
writes nothing for either; the builder's retag predicates refused them.

## Mechanism

- `i32[][]` > `(i32[] | null)[]` (`array-new-generic-pin-element-grid.vl::maps`). `listRetag`
  admitted a list whose elements are a record and its `| null`, because a ref list's backing is
  nullable already. `recElemCore` now admits list and map elements beside records, on the same
  ground. The function's next miss is `print mapScalar`, another lane's.
- `(() => Circle | Sq)[]` > `(() => Sq | Circle)[]` (`fn-value-same-rep-type-no-adapter.vl::main`).
  `repFillsHole` refused any two distinct boxes. Every union lowers to the one box, with
  program-global tags, so two boxes of one arm set in either order are one value (`sameArmSet`).

Both predicates live in ir.vl and are the verifier's too.

## Verifier

Keyed self-tests:
- `list-of-lists-retag-into-nullable-lists`: holds, 0;
- `list-of-lists-retag-into-other-lists`: refused, 2.

## Readings

Master 1b69a6af → head, fixpoint seeds: ir-i8 census `declaration coercion` in tests/cases
12 → 10; tests/cases fully IR-only 5,929 → 5,930 of 7,167.

## Legacy tails the IR calls

None new.

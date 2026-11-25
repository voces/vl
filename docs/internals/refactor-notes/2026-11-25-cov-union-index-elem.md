# IR coverage: `operand type` over function-set ids, `index element coercion` at a list's row (lane COV-UNION, 2026-11-25)

Two classes handed over from COV-START's coercion family (coordinator, 2026-11-25). COV-START keeps
`operand type`'s `xrep` route (#10168).

## Mechanism

- `operand type` (`nicheBoolEq`): legacy's numeric compare route over two operands at one `i32` or
  `bool` cell, such as the ids of a hole function set (`f === apply2` over a loop variable), is the
  plain compare. The builder had admitted only a `boolean | null` niche beside a bool.
- `index element coercion` (`buildIndex`): a record element whose rep has no heap of its own
  (`recHeapOf` -1), read at a record rep on the heap legacy lays the list out on (the element of
  `refListSlotOfExpr`'s row), is that record as it stands. `recRowRetagOn` notes the element rep at
  that heap in the function's heap map, so the retag's verifier check reads the same heap.

## Measurements

- Class cut (`index-element-coercion.txt` + `operand-type.txt`, 52 programs), master tree before
  and this tree after: `operand type` 27 → 11 rows, `index element coercion` 29 → 27; claimed
  functions and start bodies 247 → 265. The `operand type` drop includes the four hole function
  list start bodies (D14422, D7180, two cases) and the generic lambdas' id compares in the
  generics cases.
- `index element coercion`: D16134's start and `d15293_bound_returned.vl`'s start are claimed.
- Q58 sweep `tests/cases/operators/function-set-id-compare-in-each-position.vl` (a loop variable and
  an element; a print, a binding, an argument, an `if`, a count; `===` and `!==`): its start missed
  `operand type` before and is claimed after, output equal to master's.

## Open in these classes

- Eight `index element coercion` rows (three record, five list) read an element whose rep's heap
  differs from the heap legacy lays the list out on: the list's IR rep disagrees with its layout. A
  rep-derivation change, to be measured over the population first.
- Three box → record or closure rows are member reads of a narrowed union element (`xs[0].r`), which
  legacy leaves as the box for the field read to open.
- Legacy refuses passing a hole function list's element to another hole parameter
  (`monomorphize: unsupported argument type`), seen while writing the sweep.

# IR box ladder: the null box of a binding's absent initializer (2026-11-26, lane COV-IS)

- **The miss**: `box ladder` for a union `let` with no initializer that a closure captures
  (`let u: U` with `U` a union of records, or `let n: i32 | string`). Its cell starts as the null
  box, which the builder delivers as a `null` value for the declaration node; that node is no
  `null` literal, so `holeBoxPlanOf` names no `null` arm and ladders.
- **What landed** (IR only): in `boxTempIn`, a `null` value (the no-value immediate) the plan has
  no arm for, into a rep that holds the null box (`nullOwnRepFits`), is that box
  (`RNullOf` with `NULL_OWN_BOX`), as legacy writes a bare `null`. The shared plan is unchanged.
- **Parity**: byte-identical (`VL_IR_SHADOW=2` `matched`) on the sweep,
  `closures/shared-let-read-early-traps-union.vl` and `unions/literal-tag-arm-row-not-taken-by-string-record.vl`;
  `closures/shared-let-without-zero-value.vl` moves on to other classes.
- **Q58 position sweep** (`tests/cases/closures/captured-union-let-without-initializer-positions.vl`,
  new): a record union, a value union, read twice, and at the top level. Master: 1 function
  `box ladder`; here all claimed and byte-identical.
- Left: a record literal assigned to the captured cell inside the closure (`const set = () => { u =
  { b: "s" } }`) still misses `box ladder`, another mechanism.

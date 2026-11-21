# IR: a field or element write used as a value (2026-11-21, lane IR-N3)

`assignment value target` was the IR's miss on an assignment used as a value whose target is a
field or an element, on legacy's `reRead` arm (`asgValueArmOf`). `emitAsgValue` writes the store,
then `emitExpr` of the target under `asgReReadEnter`, so a `p.x = v` or `xs[i] = v` used as a
value re-reads the receiver, the index and the field or element.

## The change

- `assignValue` takes a `Member` or `Index` target. The builder writes the store (`assignTo`),
  then builds the target whole under the same re-read context, and refuses a re-read whose rep is
  not the assignment's (`assignment value re-read rep`).
- A store whose value is itself a field or element write (`p.x = xs[0] = 5`) is the named miss
  `store of a field or element write` (`writesPlaceValue`). Legacy writes the inner store's index
  and value through a parked scratch frame there, and the IR's spelling of it mismatched.

## Witness

`tests/ir-shadow-rows/assignment-value-field-element.vl`: a field write as a `print` argument.

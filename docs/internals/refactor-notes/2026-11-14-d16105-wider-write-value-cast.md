# D16105: a wider record's write value under a short-circuit

Lane E, 2026-11-14, on top of lane B's D16104 (#8012). Closes [D16105](../inventory/D16105.md).

D2398 delivers a write whose value is wider than its target by moving the write ahead of its
statement. A write in the right operand of `&&`, `||` or `??` cannot move, because it runs only
when the left side lets it.

The value can still be delivered at the write itself. A record whose struct row extends the
name's row by its `sub` chain (D622) is stored as the same object, with no copy. So after the
store, the name's re-read is that object. `ref.cast` to the wider row gives back the value at its
own type.

* `asgNameWiderRow` (emit_classify.vl) answers the wider row when the target is a name, the
  value and the binding are records, and the binding's row is on the value row's `sub` chain.
* The `=` value arm in wasmEmit.vl stores and re-reads through `emitAsgValue`, then casts. It
  sits ahead of the final refusal.
* `structIndexOfExpr` answers that row for the assignment, so a field read of the value,
  `(a = nb()).y`, finds the wider record's field.

Grading:
* 11 hand probes cover `&&`, `||`, a skipped right side, a `while` condition, function scope, a
  nullable target, a field read of the value, and a differently ordered wider record. All run
  with the right values, and the call runs once.
* `(a = nb()).y` under `&&` was an `unknown struct field` emit reject on the base too, and it now
  runs.

# D16015: an element or field write used as a value yields the cell its store parks, 2026-11-14

An assignment yields its right-hand side. The emitter delivered that value only by re-reading
the target (`assignTargetReReads`), and D2171 spilled the write before a `return` or a
function-level `let`. A write used as an operand, a call argument or a module-level initializer
had neither, so it refused.

An element store already parks its value in a scratch local of the element's rep
(`listIdxValSlot`) before its `array.set`. That local holds the stored cell. `emitBinExprNode`'s
`=` arm gains a rung after the re-read: for a list element or a field whose type is the
assignment's (`asgYieldsParkedCell`), it emits the store and reads the parked local. It adds
`ref.as_non_null` for a non-null reference element and the re-read's unwiden op. A field store
tees its value into such a local only when the rung asks (`asgParkField`: the `i32`, `f64`, `i64`,
`f32` and string kinds), so no other program's bytes move.

Each park records the target node of its own assignment (`asgParkedOwner`), and the rung reads the
park only when it is its own. A write nested in another write's right-hand side runs its own store
first, so without that check a field store that parks nothing could read the inner write's value.
The "across functions" cell `getR().x = (na[j] = 4) + dbl(1)` did exactly that, printing `4` for
`6`, before the owner check.

Nothing is hoisted, so the siblings of a write keep source order. A tee was rejected for D2171
because it cannot deliver a value typed apart from its target; that population is D16016 here
too.

The remaining refusal now names its case:
- a value typed apart from its target (D16016, and D2632);
- a map entry (D16017).

A byte-list element (D16018) always takes the parked cell, never the re-read. Its store parks the
right-hand side before truncating it, which is what DECISIONS rules an assignment yields. That
moves one spelling's output on purpose: `print(b[1] = x)` with `x` 300 printed `44`, a clause-1
wrong value, and now prints `300`.

## Graded

| matrix | base | candidate |
| --- | --- | --- |
| `element-write-value` (`(ws[wi] = 5)`) | 12 of 50 run (after D2171) | 50 of 50 run, 0 silent |
| `field-write-value` (`(fwGet().x = 5)`, the receiver evaluated once, a write nested in the right-hand side) | 0 of 50 run | 50 of 50 run, 0 silent |

Two invalid modules turned up while grading the prototype, and both were fixed before any matrix
ran:
- a string element read from its parked local, missing `ref.as_non_null`;
- a string field teed through a nullable local.

Hand cells:
- `f(next(), xs[i] = next() + 4, next())` prints `163`;
- string, record, list-of-list and `f64` elements run;
- a nullable element written `null` is unchanged;
- a write nested in another (`xs[i] = ys[j] = 5`), two in one expression
  (`(xs[i] = 8) + (ys[j] = 9)`), and a write in a callee run inside a field write's right-hand side.

## Measured

| instrument | result |
| --- | --- |
| full sweep, base master against this change, both fixpoint seeds | SWEEP_RESULT |
| fast set | FASTSET_RESULT |

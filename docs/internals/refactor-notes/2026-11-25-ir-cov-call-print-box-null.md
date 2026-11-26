# COV-CALL: `print` of a box narrowed to `null` (2026-11-25)

Lane COV-CALL; census class `print boxNull` (`classes/print-boxnull.txt`).

## Mechanism

A read the narrowing pins to `null` whose value is a union box (`readNarrowedBoxToNull`) prints
from the box's tag. Legacy's `emitCallCorePrint` takes `boxNull`. It enters storage mode for the
argument, pins the print plan's null arm (`printPlanPinNull`), and runs the print again, where
`printArmOf` now answers `union`. Without the pin the plan has no arm to print the null, and the
arm reads `unrenderable`. The IR refused the arm (`printArmRep` "").

The builder (`printBoxNull`) asks the arm and builds the argument under the same storage scope and
pin, and refuses anything but `union`. The lowering (`printBoxNullOp`) writes the union arm's plan,
operand and tail inside that scope and pin, then lifts both, the order legacy writes them in.

## Proof

- **Census**, class programs on this branch: `print boxNull` 4 → 0; both cases and the witness are
  fully claimed.
- **Q58:** `tests/cases/unions/print-box-narrowed-to-null-positions.vl` prints the null-narrowed
  box from a module binding, a parameter, a record field, a generic instance's result, a loop and a
  hole read before its fill. Its union shapes carry a record, string, float or boolean arm. On the
  master seed five functions and the start body miss on `print boxNull`; on this branch they match.
  The record-field function misses on `is member storage rep` on both seeds, which is another
  class. The armed run prints the `@log` list.

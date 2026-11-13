## Type system (Track A)

- **A union arm's fresh row is interned at the arm's type (step 7, S1).** `internArmShapeRow` passes the arm's type to the shape interner instead of -1, so the row it mints carries its type like every other row; the D34 guard that kept it out is retired, since an arm is now a reference to its type's row.

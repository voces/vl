# IR coverage: `coalesce field after an operand` (lane COV-UNION, 2026-11-25)

`f(x, o.v ?? d)`, `a + (o.v ?? d)`, `[a, o.v ?? d]`: a `??` over a value-union record field
(`emitCoalesceUnionField`) whose earlier sibling operand is already on the stack. Legacy writes
that operand, then the field's test and its `if`; the value it left stays below. The builder
refused any field `??` after a pending temp.

## Mechanism

The union field arms (`fieldBox`, `fieldVal`) join `coalArmStagesLeads`: the lowering's `coalBox`
writes the pending lead temps below the receiver read and the field's test (`stageLead`), as it
already does for the niche, nullable-reference and box arms, whose tests likewise read only their
own operand before the `if` opens. The builder's own `endsInTemp` refusal in `coalField` is dropped.

## Measurements

- Class cut (`scripts/ir-i8-census/classes/coalesce-field-after-an-operand.txt`, 4 programs),
  master tree before and this tree after: `coalesce field after an operand` 4 → 0 (`sj` in the two
  `heap-nullable-cell-q58` cases, `checkUnit` in `scripts/plumb-shape-cost.vl`, D8920's start
  body); claimed functions and start bodies 273 → 277.
- Q58 sweep `tests/cases/records/union-field-coalesce-after-an-operand-in-each-position.vl` (an
  operator's right side, a call's later argument, a list element and a record field after another,
  a scalar and a union result, a parameter, a local and a module-level receiver): 5 functions and
  the start missed before; all claimed after, output equal to master's.

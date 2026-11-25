# IR: a union compare's variant and cross-width doors (2026-11-23, lane S1)

This follows #9749 in S1's union-compare class. On master b03c57be, 46 programs carry a
union-compare miss, and the distilled corpus has 9 "union compare plan" cells.

## Mechanisms

| door | what the IR now takes | legacy's own, split into shared pieces |
|---|---|---|
| variant (`emitUnionConcreteVariantEq`) | a record operand, plain or nullable: the box, then the record, each read once (`RUnionVariantEq`) | route `unionEqVariantRowOf`; head `unionVariantEqHead`; tail `unionVariantEqTail` |
| cross-width (`emitUnionConcreteNumCross`) | a number operand whose kind the box's number arms widen to or from: the box parked, then the number (`RUnionNumCrossEq`) | route `unionNumCrossKindsOf`; head `unionNumCrossHead`; tails `unionNumCrossBoxTail`, `unionNumCrossTail` |

Each route names exactly when legacy's re-reading arms take that door. The variant door covers an
operand with no atom kind, or a union the value-union gate refuses. The cross-width door covers a
union past the gate with no arm of the operand's kind. Both heads reserve legacy's slots in legacy's
order, before the operands.

## Readings

| run | before (master b03c57be) | after |
|---|---|---|
| distilled "union compare plan" | 9 cells | 0 |
| tests/cases programs with a union-compare miss | 46 | 15 |

The 15 that remain:
- an operand with effects, which takes D17068's staged path, not yet in the IR;
- a call operand on a null leg (legacy stages it);
- box shapes: a global list's element, an optional chain, a forty-arm union, a nested niche.

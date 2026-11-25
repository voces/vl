# IR: `p?.f ?? d` over a union box field and over a record field, 2026-11-25

Lane COV-CALL, PR D. The class is `coalesce optional record field`: `coalOptLeafBuild` missed every
field that is no scalar or string leaf (`coalOptLeafPlanOf`'s null `olLeaf`). A scratch split by
the field's row kind gave 27 `union` rows and 4 `nulstruct` rows.

## Change

- **A union box field** (`emitOptCoalesceBoxLeaf`). Legacy writes the chain's null test, then the
  plan's `if` (the result's scalar valtype, or the box), the default, then the base again and the
  field's box, unboxed and widened for a scalar result.
  - It now reads a plan (`optBoxLeafPlanOf`) and two tails (`optBoxLeafOpen`, `optBoxLeafRead`).
  - The new `CoalValArm` `optBoxLeaf` lowers through them, over an unstaged base that is no link
    itself. It reuses the link null test `optRead` lowers.
  - The default is delivered at the result's rep, boxed into the result's union (`obTy`).
- **A record field** (`emitCoalesceOptNulRecord`'s record arm). It takes two null tests: the
  receiver, then the field slot a record leaves nullable (D1180).
  - It reads a plan (`optRecLeafPlanOf`) and three tails.
  - The new `CoalValArm` `optRecLeaf` lowers through them, the default at the result's record rep.

## Delta (`census.sh` with `CENSUS_CLASS` at the class's 27 programs)

| | before (master census, 2026-11-25) | after |
|---|---:|---:|
| `coalesce optional record field` rows (functions + start bodies) | 31 (15 + 16) | 0 |

What those programs now miss on:
- `null test optChain` (6 functions and 1 start body), COV-IS's class;
- `coalesce optional box field chain` (a base that is a link itself: 1 distilled, 2 start bodies);
- `coalesce optional place` (2: a receiver the IR cannot read again);
- `coalesce optional staged receiver` (2);
- `union compare box` and `optional read chain` (1 each).

## Proof

- Q58 sweep: `tests/cases/records/optional-field-coalesce-positions.vl`. A scalar result, a union
  result and a record result, at a scalar and a union parameter, a nested call, a concat operand, an
  interpolation hole, a `return`, a `let`, an `if` arm, a `??` operand, a record field and module
  scope. 10 of 12 position functions and the `@init` are claimed after and unclaimed before. The
  concat and interpolation positions are unclaimed under both, on `string operand after another`,
  a class this PR does not touch; they run and are claimless-identical. Every program builds under
  `VL_IR_SHADOW=6` with no mismatch and is claimless-identical.

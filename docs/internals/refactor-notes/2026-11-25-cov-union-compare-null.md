# IR coverage: union compare null operand, null operand rep, staged operand rep (lane COV-UNION, 2026-11-25)

Three builder refusals on legacy's union compare plans, each a check that named a rep or a place
narrower than the bytes legacy writes.

## Mechanism

- `union compare null operand` (`unionNulStagedEq`): with the box parked (a call), an unparked
  null-leg operand that is no place was refused. A read the lowering writes again
  (`recvReadsAgain`: a global, a field of one, an element) is now carried as `ucOtherAgain`, as the
  unstaged null leg already carries it; the verifier allows `ucOtherAgain` beside a parked box.
- `union compare null operand rep` (`nulLegOperand`, and the unstaged rep check): leg 1 (`K | null`)
  takes an operand read at the bare `K`, a narrowing past the `-1` null: legacy reads the same id
  (`atomIdRep`).
- `union staged compare operand rep` (`stagedOperand`): a `boolean | null` operand parked against a
  box with no null is its niche's i32, whose null (2) no bool payload equals; the unstaged plan
  already accepts it.

A fourth relaxation was tried and refused: a box read again (`ucAgain`) beside an operand read
again. The verifier accepted it, but the lowering refused the start body ("non-stack temp: out of
order"), so a box read again still sits in the lowering's stack order. The five start bodies on
`union compare operand` / `operand rep` stay open on that.

## Measurements

- Class cut (`union-compare-null-operand`, `-null-operand-rep`, `-operand`, `-operand-rep`,
  `union-staged-compare-operand-rep`; 11 programs), master tree before and this tree after:
  - `union compare null operand` 3 → 0 (`glob` in the boolean, literal-union and string
    `place-read-before-a-call-that-writes-it` cases);
  - `union compare null operand rep` 2 → 0 (`field`, `elem` in the literal-union case);
  - `union staged compare operand rep` 3 → 0 (`g` in three `d17065_*bool_x*call*` cells);
  - claimed functions and start bodies 46 → 54; `union compare operand` (3) and `operand rep` (2)
    start bodies unchanged.
- Q58 sweep `tests/cases/unions/union-compare-null-leg-operand-in-each-position.vl` (a return, an
  argument, a binding, an `if`, a loop, `!=`, a narrowed field, a null-free box against a
  `boolean | null` call, module level): before, 7 functions and the start missed these three
  classes; after, all 13 functions and the start are claimed.

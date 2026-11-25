# COV-CALL: an optional chain tested once (2026-11-25)

Lane COV-CALL, classes `null test optChain` (handed over by COV-IS) and `record compare place
operand`. This is the coordinator's general form: the chain is evaluated once and then tested, not
legacy's double write.

## Mechanism

- **`x?.f == null`:** `nulTestOptChain` builds the chain as its value (`irBExpr`) and makes an
  `RNulTest` over it. The lowering's `nulTestOp` takes the tail from the value's rep discipline
  (`repNulTestArm`): 1 `ref.is_null`, 2 the boolean sentinel, 3 the atom sentinel, 4 or a box the
  null tag. Legacy writes the chain's own null test (`emitOptChainIsNull`) and its read separately.
- **`o?.f == y`:** `structEqSide` accepts an optional chain whose value is a record or its nullable.
  The lowering writes that side once to `irOnceRefSlot(sHeapIdx[row])` (CENSUS's fresh-local helper)
  and the compare reads it as a local side. The slot is shared by heap type, so a compare whose two
  sides both need one is a named miss (`record compare two fresh sides`). Legacy re-writes the chain
  at each null test and field read.

The bytes differ from legacy's; the behaviour is the same. This lands after INFRA's #10171, which
makes behaviour parity the gate.

## Census (`CENSUS_CLASS=classes/<class>.txt`, rows)

| row | before | after |
|---|---:|---:|
| `null test optChain` | 15 | 0 |
| `record compare place operand` | 13 | 0 |

Every program of both classes prints the same output as the base seed under `VL_IR_STRICT=1`.

## Proof

- **Q58 sweep:** `tests/cases/expressions/optchain-tested-once-positions.vl` covers both forms at a
  `let`, an argument, a return value, an `if` condition, an interpolation and under a `!`.
  - On master 5 of its functions miss on these rows.
  - With this change all are claimed, with the same output under strict.

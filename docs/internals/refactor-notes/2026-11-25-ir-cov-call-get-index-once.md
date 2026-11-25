# COV-CALL: a `.get(i)` whose index is a call (2026-11-25)

Lane COV-CALL, class `get index staged`, including its `xs.get(next()) ?? d` side (handed over by
CENSUS).

## Mechanism

Legacy stashes a `.get` index it cannot re-read in place (`listGetStageMark`) and reads the stash at
each use. The IR refused such an index.

- **Builder:** `getValueRhs` and `coalListGetOr` take a non-re-readable index when it is exactly one
  temp (`oneTempAt`) and hand it on as the index operand.
- **Lowering:** `irGetIdxBegin` writes a temp index once to `irOnceSlot([127])`. Every read the head
  makes through `listGetIdxHook` is then that local.
  - `listGetIdxUnstage` drops legacy's staging of the index (a `.get` value's
    `listGetStageEnter`).
  - While held, `listGetStageMark` stages no index (`listGetIdxHeld`); `irGetIdxEnd` releases it.
  - Without this, legacy's ref and string tails stashed the index themselves, and the call ran twice.
  - `coalListGetOr` consumes the temp ahead of the head, before the pending temps settle.

## Census (`CENSUS_CLASS=classes/get-index-staged.txt`, rows)

| row | before | after |
|---|---:|---:|
| `get index staged` | 7 | 0 |

The class's programs move on to `coalesce listGetOr staged operand` (3, a staged receiver under
`??`) and `get index operand` (2, an index of more than one temp). Every class program prints the
same output as the base seed under `VL_IR_STRICT=1`.

## Proof

- **Q58 sweep:** `tests/cases/lists/get-call-index-once-positions.vl` covers a call index alone and
  under `??`, at a `let`, an argument, an interpolation, a condition and a return value, over i32, f64
  and string lists. Each `next()` counts once, which the logs pin. On master 6 of its functions miss;
  with this change 4 are claimed, and `next() - k` stays a named miss.

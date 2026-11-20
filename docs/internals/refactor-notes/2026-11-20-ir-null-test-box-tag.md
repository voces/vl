# IR coverage: a union box's null test (2026-11-20, lane IR5)

`x == null` / `x != null` over a union box was the IR's `null test boxTag` miss. Legacy writes the
operand, the box's tag (`struct.get` field 0), the `null` tag's relocated constant and `i32.eq`
(`i32.ne` for `!=`).

## The change

- **One tail.** `nulTestBoxTagTail(invert)` (`wasmEmit.vl`, beside the atom, bool and ref tails)
  is legacy's arm's bytes; `emitNulIsNullTest` and the IR's `nulTestOp` both write it.
- **The builder.** `nulTest` takes the `boxTag` arm when the operand's rep is `heldAsBox` (an
  `RBox`, or an `RNullable` of discipline 4): the arm is legacy's decision, the rep check an
  assertion that the operand carries the tag. The verifier's `RNulTest` rule admits the same two.
- **A receiver the null test now reaches.** Past a `!= null`, a shared field read's box local
  keeps its declared boxed-nullable rep (`irBBoxLocal`); only the stash path checked for `RBox`.
  Both paths now miss as `shared read receiver rep` (the follow-up slice), where the verifier
  refused them with rule 2.

## Witness

`tests/cases/unions/null-test-box-tag.vl`: `==` and `!=` over `i32 | string | null` and a record
union `| null` (discipline 4) and over `U = (("a" | "b") | null) | i32` (an `RBox` with a null
arm), each called with a value and with `null`; the merge-base seed misses all three functions as
`null test boxTag`, and after they are covered, verified and matched.

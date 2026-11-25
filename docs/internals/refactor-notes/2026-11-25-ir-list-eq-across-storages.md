# A list compare across two element storages (2026-11-25, lane COV-START)

`operand type` is one of COV-START's start-body coercion classes: 12 start units on the census of
master 24d858b7. A line-tagged scratch build of the compiler showed that 7 of the 12 are `==` or
`!=` over two lists stored apart. Legacy's `eqRouteOf` names that route `xrep` (`xrepEmitPair`),
and the IR's compare ladder had no arm for it:
- an f64 list beside an i32 one;
- an i64 list beside a literal;
- a list of records whose fields are stored apart.

## The mechanism

- Legacy's `emitListEqXBin` is split: the operands with the list compare's own operand tail
  (`listEqOperandTail`), then `listEqXTail`, the cross-rep loop over the two lists' kinds and
  slots, negated for `!=`. The bytes are unchanged.
- The IR builds the route as the list compare node (`RListEq`), each list at its own rep. The
  lowering writes `listEqXTail` where the route is `xrep`.

## Measured, on the class's programs

| program | master | head |
|---|---|---|
| D15055, D15092, D15550 | `operand type` | claimed |
| `equality-over-lowered-reps` probe | `operand type` | claimed |
| `list-eq-across-element-storages`, `list-literal-eq-across-element-storages` | `operand type` | claimed |
| `eq-fields-stored-apart` | `operand type` | claimed |

Each matches legacy byte for byte under the armed shadow, with the same output under
`VL_IR_STRICT=1`. Sweep: `tests/cases/lists/list-eq-across-storages-positions.vl`.

## Left in `operand type` (5)

- A boolean-niche compare's operands (`nicheBoolEq`) over a hole function list's loop variable:
  D14422, D7180, `hole-fn-list-loop-var-called-with-generic-and-compared`,
  `identity-eq-hole-fn-list-loop-var`.
- A literal union in mixed-width arithmetic: `litunion-mixed-width-arith`.

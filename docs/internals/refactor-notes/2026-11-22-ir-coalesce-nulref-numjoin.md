# IR: a nullable number coalesced into a join of numbers apart (2026-11-22, lane IR-N2)

`coalesce nulRef numJoinIf`, one of the rungs #9547 named. On the forced IR-only census at
master 14d707ae it holds 6 functions and 2 module starts.

Legacy writes the rung as `coalNullTestIf`'s `if` after recording the `??`'s result type on it
(`nodeTyRecord`), so its arms join the numbers apart. That is the shape the IR already builds for
the `pinnedCellIf`, `atomJoinIf` and `cellIf` rungs.

## The change

- The builder takes `numJoinIf` with its siblings, `irBExpr` of `coalNullTestIf`'s node. That
  query is pure: it mints the `if` once per `??` and instance, and writes no table.
- Legacy is unchanged and keeps its own type record. The IR's build does not depend on it: under
  `VL_IR_SHADOW=6`, which builds each function before legacy emits it as well as after, every
  numJoinIf row matches with no `prepost` row.
- There is no print guard. A union `print` of the join matched only once #9599 made legacy take
  its print slot after the operand. A broad `print union of a valued if` refusal was measured and
  dropped: it cost 63 matched corpus functions (45243 → 45180) to hide 3 mismatches.

Row file `tests/ir-shadow-rows/nullable-number-coalesced-into-a-wider-number-join.vl`; witness
`tests/cases/numerics/nullable-number-coalesced-into-a-wider-number-join.vl`.

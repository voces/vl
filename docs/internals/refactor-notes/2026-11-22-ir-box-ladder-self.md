# IR: a valued `if` of one variant boxed whole into its union (2026-11-22, lane IR-N2)

`box ladder`, the self-compile rung. On a fixpoint seed of master 47b9d7bb merged with #9465, 3
compiler functions missed at `box ladder`: `irStrHashFnCode`, `irMapProbeFnCode` and
`irMapProbeI32FnCode`. Each passes `if c { a } else { b }`, over two `OVar` locals, where an
`Opnd` is expected.

Legacy's bytes for the plainest spelling (`num(if w == 4 { a } else { b })`) are the arm's tag, then
the whole `if` at `(ref $OVar)`, then `struct.new` of the box. The ladder reaches
`emitUnionArmValueBox` before its `if` rung (`emitUnionIfValue`, which boxes arm by arm), and
boxes the join as the record it is. `holeBoxPlanOf` returned the ladder for every `if`, so the IR
had no plan for it.

## The change

- `holeBoxPlanOf` (`emit_plan_union.vl`) gives a join that is one arm's record the `rec` arm, by
  `armValuePlainOf`: the answer `emitUnionArmValueBox` itself reads. Every other `if` stays on the
  ladder. Legacy now writes such a join through `emitHoleBox`'s `rec` arm, which writes the same
  bytes. ir-identity `--names` and `--cases` compare them.
- `boxOfJoinAt` (`ir_build.vl`) also takes a join whose condition is the let just before it
  (`ifCondLetAt`, `ir.vl`). The lowering keeps that condition pending until `cond` writes it.
- A valued `if`'s box head is now written in `valuedIfOpen`, after `stageLead` has written the
  operands an earlier argument left pending (`joinBoxHead`). Legacy writes those first:
  `show(if c { "gt" } else { "ge" }, i, if c { lim } else { n })`. A `??` join keeps its head ahead
  of the node.

Row file `tests/ir-shadow-rows/record-join-boxed-whole.vl`; witness
`tests/cases/unions/record-join-boxed-whole-into-union-argument.vl`.

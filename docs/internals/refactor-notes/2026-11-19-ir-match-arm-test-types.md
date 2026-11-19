# IR: the match lowering records its arm tests' type, 2026-11-19

#9146 taught the IR builder a private rule, `untypedBoolOp`: a `==` or `||` with no recorded
type is `boolean`, because the `match` lowering writes its arm tests after the check. That is a
decision legacy does not share, against the mirror rule (IR-REV's follow-up on #9146).

## The change

`matchCondStamp` (check_match.vl), which already visits every arm test the lowering writes,
records `boolean` on each `==` and each `||` joining them (`nodeTyRecord`). The IR reads the
recorded type like any other; `untypedBoolOp`, `BOOL_OPS` and their import go.

Compiler lines are +4 −17, 13 net fewer (`check_match.vl` +4 −1, `ir_build.vl` +0 −16). No legacy
line is deleted or moved to the IR.

Still owed (part 2): the untyped-call rule in `exprTyOf`, an operator a generic instance rewrote
to its overload call, is the same shape; the instance rewrite should record the call's type.

## Readings (base master `8b89f4bc3`)

| reading | master | this change |
| --- | ---: | ---: |
| corpus covered = verified = matched (shadow) | 35,249 of 45,678 | 35,249 of 45,678 |
| self-compile functions claimed (mode 5) | 14,668 | 14,668 |
| L2 self-compile fuel | baseline 99,807,747,280 | 100,498,906,464 (+0.7%, tier +1%) |

ir-identity plain and `--names`: 9,037 identical, 0 differ, self-compile identical. `--cases`:
7,514 identical, 0 differ. Mode 3 corpus: 0 differ. regress: no runs lost, 0 to silent.

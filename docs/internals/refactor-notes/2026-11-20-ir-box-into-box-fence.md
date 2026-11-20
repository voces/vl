# IR: a box into a box passes only where legacy's box plan passes it, 2026-11-20

`widenTo` returned an operand as it stood whenever its rep equalled the destination's. Every value
union's box shares one `RBox` rep, so that let a box of one union through into a box of another,
whose tags differ. Legacy converts the members there. #9222 met it as a runtime cast failure in a
record field, `{ v: x }` with `x: i32 | string` built at `{ v: f64 | string }`, and fenced the
field. At every other position the conversion is a recorded pre-path coercion that
`exprPrePathWhy` refuses first, so the field was the only exposed place. This closes it at
`deliver`, as IR-REV asked.

## The change

- `deliver` and `widenTo` take the destination's checked type, `dstTy`.
- `boxIntoOtherUnion`: a box operand into a box rep with no box recorded at the node passes as it
  stands only where `holeBoxPlanOf(ix, dstTy)` is `pass`, legacy's own decision that the box goes
  in whole. Otherwise it misses as "box into another union".
- An unknown `dstTy` (-1) fails closed. Measured with each caller's code in the miss, the closing
  cost 0 self-compile functions and 2 corpus functions, both at a declaration's initializer. That
  caller now passes its variable's type. The other 19 callers pass -1 at no measured cost; each is
  plumbed when a program reaches it.
- `scripts/capability-probes/box-into-another-union-field-at-destination-row.vl` is the no-record
  witness. It runs, behind #9222's field guard and this fence.

Compiler lines are +40 −24, all in `ir_build.vl`. Most of that is the new argument at each call
site. No legacy line is deleted or moved.

## Readings (base master `3f4cd8575`, fixpoint seeds on both sides)

| reading | master | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 18,231 | 18,232 |
| corpus covered = verified = matched (shadow) | 40,123 | 40,123 |
| L2 self-compile fuel | 103,306,694,606 | 103,346,141,418 (+0.038%) |
| seed size | 6,885,953 | 6,886,225 (+272 bytes) |

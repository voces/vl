# IR: a value `if` joined at a string or a list (2026-11-19)

`expression if ref str` and `ref list` were legacy's `emitIfExprRef` path: a reference blocktype
and a per-arm ladder (`emitRefIfArm`). The ladder is now `refIfArmOf`, which legacy matches on;
`ifRefJoinOf` is `emitIfExpr`'s kind and slot, and `fbRefIfOpenType` the blocktype both write.
The IR builds one link (`else if` links share their head's kind, so a chain is a miss) whose arms
are each `plain` at the join's rep; the lowering asks `ifRefJoinOf` at the node.

Three places the IR's statement-level `if` cannot follow legacy became named misses, found by the
armed shadow and by `--cases`:
- a valued `if` past the first operand of a string `+` chain or an accumulator append
  (`string operand after another`), which legacy writes in place above the earlier operands;
- `print` of a `string | null`, whose blocks legacy opens before its operand;
- a binding whose `if` initializer legacy writes in each arm (`emitLetIfInit`): `letIfInitRep` is
  that choice, which `emitLetIfInit` reads, and `letIfInitPerArm` asks it for a declaration.

Measured on fixpoint seeds against master `f4b395101` (m50; functions with no blocker, blocker
census): self-compile 14,923 of 19,045 → 15,030 of 19,054, corpus 35,258 → 35,258 of 45,678;
combined 77.53% → 77.69%. In the self-compile `expression if union` (114 alone on m50) now
reports where it stops first, `declaration if per arm` (120); `arm not lone` 43 and `string
operand after another` 7 remain.

Legacy lines deleted: 0. Moved to `@ir`: 0.

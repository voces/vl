# IR coverage: a union join's literal-true condition and its nested-`if` arms (2026-11-23, lane IR-N2)

The class is `union if static condition`. A value `if` built on the union-join rung
(`unionIfLink`, legacy `emitUnionIfValue`) whose condition is an immediate missed unless it was a
decided `is`. Once that miss is gone, most of its functions stop next at `union if arm`, an arm
whose tail is itself a value `if`. Both are taken here.

## Design

- **Literal `true` condition.** The checker's value rewrites (`luValueAt`, `luValueNode`, the
  match desugar) write `if true { <stmts> } else { <placeholder> }`. A coalesce over an instance
  that is never null takes that shape too. Legacy's `staticValueIfCond` decides it off
  `valueIfLitTrue` and writes the `else` arm dead (`emitDeadValueArm`). `unionIfLink` now accepts
  `bareConstIs(...) || valueIfLitTrue(n.ifCond)` as its decided condition. The scalar
  (`ifExprAt`) and ref (`refIfLink`) links already did.
- **Nested `if` arm.** `emitUnionIfArm` takes an arm whose tail is a value `if` in one of two ways:
  - as the next link of the same join (`emitUnionIfValue` at the outer box);
  - when `ifJoinAdaptsScalar` holds, as one wider number boxed once (`emitUnionBoxOwed`).

  `unionIfArm` now builds the first case as `unionIfLink` into the arm, written to the outer out,
  just as `unionIfLink` already handles an `else if`. The second case goes through
  `floorDeliver`. `atDst` is threaded to the inner link.

No legacy code changes, and no verifier relaxation.

## Legacy tails the IR calls

- None new. The dead arm is the existing `tpWhy: 0` lowering, and the inner link is the
  existing `unionIfLink` lowering.

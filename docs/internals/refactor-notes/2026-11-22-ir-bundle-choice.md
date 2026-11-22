# IR: a choice handed to a bundle parameter (2026-11-22, lane IR-D1)

The last `bundle argument` arm, after #9466 and #9492: `choice`, 9 tests/cases functions in 7
files. Every arm is a function read, e.g. `both(if c { inner } else { ask })`.

## The change

- `bundleChoiceArg` / `bundleChoiceRec` (ir_build.vl) mirror `emitBundleChoiceArg`.
  - The row is that of the parameter's annotated type (`repRowOfTyStruct`), as for `fnRead`.
  - An `Ident` arm is `bundleRecBuild`'s function-read record. A one-statement block is its
    statement's. An `if` with an `else` is a nested choice.
- The `if` names its join with IR-N4's decided `SIf` field (`siJoin` {`struct`, row},
  `siJoinNul` false). Legacy opens it with `fbIfRef(sHeapIdx[si])`, a non-null reference. It
  writes no chain head whose join the lowering could ask (`ifRefJoinOf`), so the field is the
  one place the row is named.
- The dispatch is legacy's own `bundleArgArmOf` answer, `"choice"`. No new admission or route
  predicate.

The measurements are in the PR body.

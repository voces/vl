# IR: `is staged`, a receiver stashed before its rungs (2026-11-25, lane COV-IS)

`emitIsTest` evaluates a receiver that is no re-readable place (`isRecvStageRep`, D12060) once
into its stash, code 42 keyed by rep. It then runs the rungs, and every read of that node is a
`local.get` of the stash, made non-null for a string. The IR missed every such test as
`is staged`.

## What landed

- **`RIsStaged`** `{ stV, stVar, stKey, stTest, stAt }`. The builder builds the receiver first and
  holds it in a `local` variable with no slot of its own. It then builds the rungs from rank 0
  with legacy's `isRecvStagedIx` and `isRecvStagedNonNull` set, so the plan queries
  (`unionEqOperandOk`, `isArmOf`'s staged flag, `unionLitIsPlanOf`'s `ulOnce`) answer as they do
  for legacy. Every rung read of the receiver node is that variable (`exprAt`, past the
  dead-never, coercion and tag-dispatch pre-paths, which miss by name).
- **The lowering** writes the receiver, `local.set`s it into `isRecvStashSlot(key)`, binds the
  variable's slot to it, marks the stage, and writes the rungs' test, a temp used only there.
  `irLOpnd` reads the stash non-null while the stage holds a non-null string, as `emitExpr`
  does. `framedLocals` skips a variable on a stash slot (`isRecvStashHolds`), as it skips the
  list-fit shadow.
- **Named misses**: a rung that builds a statement (`is staged statement`), a nested stage, and
  a receiver rep the key's stash does not hold (`is staged rep`). A box key takes a null-tagged
  box too, and an atom key a `K | null` atom, since legacy stashes both in the same slot.

## Legacy tails the IR calls

- `isRecvStashSlot` (`emit_if_arm_values`), plus the new `isRecvStashHolds` beside it. Legacy's
  stage globals (`emit_base`) are set by the builder and the lowering around the rungs.

## Witnesses

- The 8 functions the census missed as `is staged` on master 7eddff27 (6 tests/cases, 2
  witnesses) all claim and match under the armed shadow.
- Q58 sweep: `tests/cases/literal-unions/is-staged-receiver-positions.vl`. Every stash key (a box
  with a literal-union arm, an atom, a nullable string, a string, a float box against integers, a nullable box and a nullable atom)
  sits in an `if` condition, a return, a `let` initializer, a call argument, a `&&` operand, an
  `if` arm value, a negation, a record field, a list element, an interpolation hole, a `while`
  condition and a lambda body. `gEv` proves each call ran once (27). Base: 3 `is staged`. Head:
  71 matched, and 1 `is rung` (the float box's `floatLits` rung, which #10028 claims).

# D16034: a union `==` reads a narrowed `let` operand's arms from the union it is stored as, 2026-11-13

Lane E. Approved by the coordinator to land ahead of `===` (D15975). Found by the `==` control of
the `identity-eq-record-union` matrix.

## Defect

`let v: A | B = src; v == held` was a loud emit refusal (`` `==` over a struct union is not
supported yet ``). The initializer narrows `v` to `A`, so a cast reports "`v` is already `A`
here", yet `v` is stored as the `A | B` box. `emitUnionUnionEq` takes its arm columns from
`unionEqOperandTy`, which returned the narrowed `A`. `emitStructUnionEq` then found no union arms
and declined. A non-narrowable initializer (`let v: A | B = pick()`) ran.

## Changed

`unionEqOperandTy` returns `unionBoxStoreTyOf` when it answers, before falling back to the node
type. That is the union a narrowed read is stored in. The arm columns are then keyed by the type
the value is stored as, the step 7 direction. The box itself is read as before.

## Proof

- D16034's witness moves from `emit_reject` to runs (`check-filed-witnesses --strict`). The row is
  closed.
- `tests/cases/operators/union-eq-narrowed-let-operand.vl` has eleven cells:
  - the witness, a literal initializer, both operands `let`, differing arms, `!=`, swapped;
  - inside a function, a `let` reassigned to the same arm and then to the other arm;
  - an `is`-guarded parameter compared in both branches.

  On the base seed the file is refused at emit.
- `identity-eq-record-union` `==` control matrix: 65 → 66 of 66 (`local_assign` annotated moves to
  RUNS), nothing lost.
- Sweep with fixpoint seeds on both sides: SWEEP.
- Render-parse census: CENSUS.
- `scripts/gate.sh`: all rows pass.

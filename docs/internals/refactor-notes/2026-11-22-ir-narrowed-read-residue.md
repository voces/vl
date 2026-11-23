# IR: a record written at a row its binding is not declared at (2026-11-22, lane IR-N5)

Family B3 of the `narrowed read` residue left after #9544 (D16463). A `let` initialized by a
record literal whose own row is not the row legacy declares the local at is built at the
declared row. A later read typed at the literal's row, and a function whose inferred result is
that literal, then disagree with legacy's rep.

## The change

- `irBDeclVar` arms `ibDeclRowSeen` when `letLitUndeclaredRow` holds, so `declRowParamVarOf`'s let
  arm is asked. That arm also answers a read typed at a record of a different row than the slot's
  declared one, reading at the declared row.
- `resultTy` returns at `retDeclRowTy`: legacy's declared result row (`fRetKind`,
  `fRetStructIdx`, through `declRowTy`) where the recorded type's row is not that row. This puts
  the bundle arm first, so a recorded result (`fRecRetTy`) passes through the declared-row arm too.
- New test case `assignment/record-write-value-read-at-slot-row.vl`.

The measurements are in the PR body.

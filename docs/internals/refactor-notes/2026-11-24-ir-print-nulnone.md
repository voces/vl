# A `print` of a `null`-typed argument (2026-11-24, lane IR-N5)

`printArmOf` names a `null`-typed argument (a unit binding, a bare `null`, an assignment of `null`)
`nulNone`; legacy writes `emitNulNoneForEffect` then `emitPrintNullWord`. The IR's `printArmRep`
had no rep for the arm, so `printStmt` missed as `print nulNone` (33 rows in 22 tests/cases files).

## The change

- `printStmt` builds the argument through `nulNoneEffect` (legacy's `emitNulNoneForEffect`, already
  used by `??`) and emits `RPrint` with its no-value operand.
- `printOp` writes the `nulNone` arm with legacy's null word.

## Legacy tails the IR calls

- `emitPrintNullWord` (`wasmEmit.vl`), now exported.

New test case: `null/print-null-typed-argument-from-each-source.vl` (a local, a module binding, a
literal, a parameter, a generic pinned at `null`, a field, a call with an effect, an assignment, a
`??` of two units).

## Not in this change

- `lambda-null-result-inferred.vl`'s start stays at `null test of null`;
  `null-only-optional-read-and-call.vl`'s start moves to `optional read of null`;
  `infer-null-hole-never-filled.vl` moves to `box of a null-typed value`; an `if` argument stays
  `coalesce nulnone effect if` (D1's family).

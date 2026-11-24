# IR coverage: an assignment's value re-read from a wider cell, narrowed back (2026-11-24, lane IR-N11)

`assignment value unwiden` on master 7a0704e1 was 19 functions in 8 tests/cases programs (5 sole), and none in the corpus. Legacy (`emitAsgValue`) writes the store, then the target re-read whole, then one opcode from the shared `asgReadUnwidenOp`. A probe compiler that names the opcode gave 167 `i32.wrap_i64` ×10, 170 `i32.trunc_f64_s` ×4, and 212 `ref.as_non_null` ×5. The 212 cases are records, closures and maps written into their own nullable cell.

- **`RAsgUnwiden { uwV, uwOp, uwAt }` (ir.vl)** holds the re-read and the opcode. The builder fills `uwOp` from `asgReadUnwidenOp`, the same function legacy calls, so the decision is not mirrored. The lowering writes the operand, then the byte. The rhs is in the `scalar` family.
- **The verifier (`unwidenAgrees`)** checks the opcode against the operand/result rep pair: an i64, f64 or f32 into an i32, an f64 into an f32, or a nullable reference into that reference. It has four self-tests, two that hold and two that fail. A truncation claimed for an i64 fails, and so does `ref.as_non_null` of a plain record.
- **`assignValue` (ir_build.vl)** re-reads the target at its own type's rep and builds the unwiden. A nullable scalar cell is re-read under legacy's narrowing: `exprTyOf` answers an assignment's re-read with the type it pinned (`asgReReadOf`/`asgReReadTy`), as legacy's `readTyHere` does. The builder declines two shapes:
  - `assignment value unwiden after an operand`: an earlier operand temp would wait across the store.
  - `assignment value unwiden of a recovered read`: the checker already narrowed the cell past null. Legacy then writes `ref.as_non_null` twice (recover, then unwiden), and the verifier refuses a non-null cast of a non-null reference.

## Measured

Base 052fa48d (D17109's guard included), both seeds fixpoints. The base census ran in a worktree at the merge-base, and the head census in this tree.

- `assignment value unwiden`: 19 → 0 functions, starts 3 → 0. Moved:
  - 1 function and 1 start to `... after an operand`;
  - 1 function to `... of a recovered read`;
  - 10 to `widen radix` and 1 to `box ladder`. These are uncovered further on (`hex-width-through-assignment-value`, `assign-expression-widens-by-cell`).
- IR-only census: 6260 of 7287 → 6267 of 7290 tests/cases programs fully IR-only. The 3 new programs are the position files below.
- Mode-4 corpus: `blockers none` 46880 on both seeds; starts covered/matched 9697/9697.
- Position sweep (Q58): `tests/cases/assignment/value-unwiden-positions-{wrap,trunc,non-null}.vl`. Each is check-clean, and its output is identical to a claimless compiler on both seeds. Under mode 6 every covered function matches: 75, 75 and 6 functions, with 1 declined at `of a recovered read`.
- Order: `v` in `functions/tail-assign-nullable-i64-if` and `toName` in `assignment/record-literal-write-yields-place-record` disassemble identically under both seeds. Each is the store, then the re-read, then `i32.wrap_i64` or `ref.as_non_null`.

Row: `tests/ir-shadow-rows/assignment-value-unwiden.vl`.

## Legacy tails the IR calls

`asgReadUnwidenOp` (the opcode), and `asgReReadOf`/`asgReReadTy` (the re-read's pinned type), all shared with legacy's `emitAsgValue` and `readTyHere`.

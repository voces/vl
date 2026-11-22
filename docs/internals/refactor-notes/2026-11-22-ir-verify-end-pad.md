# IR verifier: a valued body's end pad is the builder's record (2026-11-22, lane IR-D1)

The second D17049 retirement. Rule 5's last check accepted a valued function that falls off its end
only when `fnFallThroughPadOf(f.irAt)` (wasmEmit) named a pad. The IR lowering asked the same
query for the padding it writes.

## The change

- `IrFn.irEndPad` (ir.vl), "" by default: "", "null" or "unreachable", as `fallThroughPadOf`
  defines them.
- `ibReset` (ir_build.vl) records it when the builder starts function `fnIx`. A thunk, `@start`
  or `@init` keeps "", which is what the query answered for `irAt` -1.
- `irVerify` and `lowerBody` (ir_lower.vl) read `f.irEndPad`. Neither imports
  `fnFallThroughPadOf` now, and the builder is its one IR caller.

## Control

The falls-off-end verifier self-test (a valued function whose body ends in an `if` that falls
through, record "") is refused under rule 5, as it was under the query. The measurements are in
the PR body.

# IR shadow: the distilled corpus clean, 2026-11-15

Lane I. This is split out of I1b-2 so master's `ir-shadow.vl` harness is green before the claim work. Measured on
fixpoint seeds of this branch and of master after #8448.

## What landed

- **An open-typed parameter or local is a builder miss** (`open parameter type`, `open local type`).
  - #8448 resolves a parameter read by wasm index, which let `function fw(f) { return f }`
    (`named/d16301_main_lifted.vl`) reach the verifier with an open-typed variable.
  - The verifier refused it under rule 1: one `fail` row, which the harness exits 1 on.
- **Float `%`** lowers as legacy's `emitF64RemCall` writes it: both operands at f64 (an f32 operand
  is promoted), a call to `__f64_rem__`, and an f32 demote at f32.
- **One variable per wasm local.** An instance's read of a template-declared `let` resolves to the
  template's declaration, which has the same slot as the instance's. The builder now maps a slot it already holds to
  that variable, where it used to make a second variable on the same slot. Two declarations on one slot
  with different reps are a miss.

## Measurements

| reading | master (after #8448) | this branch |
|---|---|---|
| `ir-shadow.vl`: covered, verified, matched | 12,259, 12,259, 12,243 | 12,259, 12,259, 12,259 |
| mismatch classes | 3 (`locals layout` ×6, `rem over f32` ×5, `rem over f64` ×5) | 0 |
| verifier `fail` rows | 1 (rule 1 in `fw`) | 0 |
| self-compile, armed: covered and matched | — | 2,124 of 2,127, 0 byte or span mismatches |
| armed self-build byte-identical to the seed | yes | yes |

The harness baseline is rewritten to empty. Master's harness exited 1 on both the `fail` row and the
three classes that rose above the old baseline.

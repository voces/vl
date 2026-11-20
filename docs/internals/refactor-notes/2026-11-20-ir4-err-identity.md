# The claims gate compares refusals (2026-11-20, lane IR4)

IR-REV's refusal-bypass census found that `ir-identity.sh --cases` could not see one class
([D17006](../inventory/D17006.md)'s): a legacy refusal that a claim turns into a build. Such a
refusal is filed as an inventory witness, not as a tests/cases program, so `--cases` never built
it.

## What `--cases` compares now

- **A program that fails under both seeds** used to count as `fail under both` on its exit code
  alone. Its first diagnostic line (`path:line:col: message`, else the log's first line) is now
  compared too, at no extra build. Today 68 programs fail under both, and several are emit
  refusals (`emitProgram: …`).
- **Every filed witness whose outcome is an emit reject** (59 today) is now built under both
  seeds. `scripts/inventory/witnesses.vl` writes the witnesses out, reading the same row grammar
  as `ls.vl --status`. Each is compared on its exit code and its first diagnostic line, or on its
  wasm when both seeds build it (`witnesses: same N, differ N`). Every one is an emit refusal
  today. Three of them (D15155, D15157, D15158) refuse only through the test-only hook
  `__vl_test_emit_refusal__`, so the leg builds with `--test-emit-refusal`, as
  `check-filed-witnesses` does. Without the flag those three build.
- The two-seed mode (`<seed-a> <seed-b>`) still compares exit codes only. There a PR may reword
  a refusal on purpose.

## Not taken: the `@error` cases

An earlier version of this PR also built the 1,327 `@error` tests/cases under both seeds. The
checker refuses every one of them: 0 pass `vl check`. A claim acts only at emit, so it cannot
reach them. That leg cost +1 min 28 s wall and guarded nothing, so it was dropped.

## Measured

| | result |
|---|---|
| `--cases` on master 585f51b42 | `cases: identical 7516, fail under both 68, differ 0`; `witnesses: same 59, differ 0` |
| cost | 3 min 36 s → 3 min 45 s wall at `JOBS=4`, back to back |
| control (`tests/vl_ir_identity_compare_test.ts`) | Injected bypasses red under `--compare` and `--compare-errors`: a refusal that builds, a refusal that changes, and a built witness whose bytes change. The untouched builds pass. |

**Lines: scripts +153 / −5, tests +107.**

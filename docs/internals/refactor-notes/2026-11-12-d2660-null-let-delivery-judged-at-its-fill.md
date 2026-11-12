# D2660: a `let x = null` read delivered before its filling write is judged at the filled type, 2026-11-12

This contains D2660, a clause-1 row, per the orchestrator's ruling. The row stays open at
clause 2: running it is the owner-ruled flow-sensitive-read backlog item (w316's lane), which
permits the program, so the refusal is interim.

## Mechanism

`let x = null` binds a nullable with an open inner (`mkNullableTy(-1)`). The first non-null write
fills that inner in place.

- A read delivered while the hole is open is accepted as `null`.
- The binding is stored at the filled type, `i32 | null`.
- So a `string | null` destination received an `i32 | null` box, which is invalid wasm.

The checker types a read after the fill by the write (`const y: string | null = x` after `x = 5`
is refused). The same read inside a loop, before the write in the body, also checked clean, so
an emit-side `null` would be wrong on the second iteration.

## What changed

- `constrainEmptyExpr` (`check_fit_rules.vl`) records each delivery of an open A-infer-null hole
  to a closed destination (`noteNullHoleDelivery`, `check_null_holes.vl`).
- `judgeNullHoleDeliveries` (`check_narrow_flow.vl`) runs once checking ends, beside
  `judgeHoleLinks`. It refuses a recorded delivery whose destination cannot take the filled type.

The judgement is static, so a back-edge cannot make it unsound. A fill the destination takes,
and a hole nothing fills, run as before.

## Witnesses

These spellings were invalid wasm and are now refused:

- the row's generic call;
- an annotated `const`;
- a call argument;
- a `.push`;
- the same read in a function and in a loop.

`x = "t"` (the grading list), and an `i32 | null` destination with `x = 5`, run. There are two
fixtures under `tests/cases/inference/`.

D1578's witness and `tests/vl_invalid_module_position_test.ts` used D2660's program, because that
row is about the invalid-module diagnostic. After D2660 and D15927 (#7570), master holds no
check-clean invalid program in reach, so the test now builds its invalid module with
`$VL_FAULT_INJECT=corrupt-validate-bytes`, over a valid program whose first body is `main`. An
uninjected control run prints `42`. D1578 is restated as closed, with that program as its runs
witness.

## Measurement

This moves outcomes, invalid wasm to check reject, so the sweep is CI's under the `sweep` label.

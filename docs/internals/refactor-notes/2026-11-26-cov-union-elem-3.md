# IR coverage: a captured nullable closure narrowed non-null (lane COV-UNION, 2026-11-26)

## `index element coercion`, nullable(closure) → closure

`let k: ((n: i32) => void) | null = …`, written by a closure that captures it, and then
`if k != null { k(2) }` (D3973, `nullable-closure-return-fallthrough`'s `main`). The capture
holds `k` in a one-element cell, so the read is an element read: the element is the nullable
closure, and the read's rep is the narrowed closure. Legacy reads the element and calls through the
nullable reference (`struct.get` takes it). The builder refused the element at the closure.

- `buildIndex` (`ir_build_ref`): a nullable closure element on the `ref` arm, read at its inner
  closure and not already recovered by the place's proof, is read as stored and recovered to the
  closure (`RRecover`, `rcNn` 1). For a call this behaves as legacy's does: a null traps at the
  `ref.as_non_null` instead of at the `struct.get`. Byte identity is informational (#10171).

## A clause-1 defect this closes (legacy, no row by the brief)

Delivering the narrowed closure to a non-null closure slot, `apply(k, 2)` or `const h = k`:
legacy writes the nullable element read with no recover, and the module fails to validate
(`type mismatch: expected (ref $clo), found (ref null $clo)`), though `vl check` passes. With
the IR's recover the function is claimed and runs. The sweep holds both positions.

## Measured

Class cut (the `index element coercion` programs plus the sweeps), #10239's head before and this
tree after:
- `index element coercion` function rows: 11 → 8.
- Claimed functions: 85 → 88 of 98. Programs fully claimed: 4 → 6.

Q58 sweep: `tests/cases/closures/captured-nullable-closure-narrowed-in-each-position.vl`
(a call statement, printed, arithmetic, passed, bound, returned, cleared). Master emits an invalid
module for it. This tree runs it, with blockers none.

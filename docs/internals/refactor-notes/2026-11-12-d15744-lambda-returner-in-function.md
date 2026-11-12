# D15744, half (b): a lambda bound inside a function, returning a bundle, runs, 2026-11-12

A `const` bound to an un-annotated lambda that returns a hole lambda's bundle record was refused
in every spelling: the elaboration follows a returned record only through a named function
(`elabResScanCall`, `elabPlainCallee`, `elabRetRecordShape`, `elabResMayReturnRecord`). Inside a
function a call through such a binding is a direct call to the lifted lambda
(`cloLiftCalleeOf` → `emitDirectCall`, which already picks a returned record's member).

- `elabCalleeFn` (emit_elab.vl): a callee binding inside a function names its lambda, so the
  lambda's reads, callee reads and plain calls count as a named function's;
  `elabRetRecordShape` takes such a lambda.
- `elabRetValues` / `elabResScanRet`: a body ending in a holder's read returns it, as a `return`
  of it does (an expression-bodied `() => c`).
- `elabHolderCanHoldReturned`: a `const` holder returned by a lambda nested in its function.
- At the top level the call is a closure call whose signature carries no record; the binding is
  left to the refusal (half (a), D15744's row, now widened to the measured table).

**Position matrices**, master against this branch: `lambda-bundle-returner-in-function` (new)
0 → 42 of 48 run, 0 SILENT; `lambda-bundle-returner` (new, top level) 0 → 0, 0 SILENT;
`bundle-copy-handed` unchanged. Admitting top-level bindings too ran 25 cells but built 17
SILENT ones, so they are excluded until the closure signature carries the record.

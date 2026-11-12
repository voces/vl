# Step 7 inst: a returned container of functions at another storage than its result is refused, 2026-11-12

Lane w321, D15753 and D15755. In both, a function with an inferred result returns a binding (or a
value join of bindings) holding un-annotated functions, and the call is bound at an annotated
container of functions. The module did not validate: the result is built at the mono storage its
holey type gives (`$6`, an `i32`-valued map, or the `i32` default for a list), while the returned
bindings are closure containers their slot facts close.

## Contained, not fixed

The fix was traced one timeboxed step and not found; the trace is in D15753's row for the next lane.
`frsRecordedRetCore`'s two gates both decline (the holey type's rep token is non-empty, and a
returned value join had no `frsValueBuiltTy` rung). Opening both makes the recorded result the
`(f64)` map, but the emitted signature does not read it, since `fn_ret_shadow.vl` is a shadow.

`retStorageMismatch` (`emitReturnValue`, wasmEmit.vl) refuses the return instead:
`emitProgram: a returned container of functions is built at another storage than this function's
result`. It fires only where all of these hold:

- the function's result is inferred, since a written result converts what is returned;
- the returned value's type holds a function and still holds a hole;
- its map shape, or its ref-list kind or row, differs from the result's (`repOfFnSlot`).

## Rejected cuts, caught by the instruments

- Guarding a written result too took `return_annotated` (both faces) of the D15393 matrix from
  runs to not-runs.
- Guarding a closed returned type too took two corpus cases, `tests/cases/closures/
  hole-fn-in-unannotated-map.vl` and `generic-fn-in-unannotated-map.vl`, from runs to an emit
  reject. The sweep caught them: their returned map's slot numbers are D15753's, but its type is
  closed.

## Measured

`scripts/capability-probes/matrix/value-join-of-maps-of-hole-fns.matrix.vl`: 49 of 58 run on both
seeds, with 0 runs → not-runs. Its silent `return_inferred` (annotated) cell is now a loud reject,
D15753. The record-write and bound-list matrices from this lane are unchanged and have no losses.

D15755's witness, a function returning the bound list `inner` at `((a: f64) => f64)[]`, refuses at
the return too. Its row is re-graded here, since #7459 has landed.

## Proof

**Full local sweep.** Fixpoint seeds, base master `2fdf5714`, 24,029 programs:

| | count |
| --- | --- |
| same | 24,027 |
| bytes-only | 0 |
| output movers | 2 |
| runs → not-runs | 0 |
| new compiler traps | 0 |

The two movers are D15753 and D15755, which go from check-clean invalid wasm to a loud emit
reject. The guard asks the returned value's type for a map and compares list kinds directly, so
there is no ladder over `VKind` literals.

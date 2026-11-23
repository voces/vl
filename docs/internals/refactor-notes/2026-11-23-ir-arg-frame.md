# IR coverage: `start: argument coercion` cut 1, delivery at the callee frame's type (2026-11-23, lane IR-N8)

`start: argument coercion` on master fa7f0009: 19 start bodies in 19 tests/cases programs. Naming the
reps at each miss: 10 are a record built wider at its delivery (D14730, D15129), whose fields
differ from the parameter's checked type (`nullable(i32)` against `null`, a box against `i32`).

- **`calleeParamTy` (ir_build.vl)** delivers a struct parameter at legacy's declared row where its
  checked type's row is another, as the callee's frame holds it (`paramHeldTy` →
  `paramDeclRowTy`, which the thunk builder forwards at). Legacy's instance takes the record at
  that row (`paramStructIdxOf`): `ignore` in `soundness/mixed-instance-unrelated-arguments-runs.vl`
  takes `Circle`'s struct, and the call passes the global as it stands. Any other parameter keeps
  its checked type. The answer is memoized per parameter for the function being built
  (`ibCalleeParamAt`), since every direct-call argument asks it: calling the full `paramFrameTy`
  per argument cost +0.48% L2 fuel.

## Measured

7 of the 10 match. 3 move on: `soundness/bound-record-built-wider-at-unpinned-generic-runs` to
`coalesce field place`, and the two `soundness/mixed-instance-*` to `pre-path null unit read`.

Left in the class: 3 lists of hole closures, 2 width-subtype receivers of an overloaded UFCS call,
and 4 one-offs (covariant field, record pattern, a map of a wider record, `list<str>` at
`list<str?>`).

Row: `tests/ir-shadow-rows/arg-built-wider-at-frame-row.vl`.

## Legacy tails the IR calls

None new: `vtKindOfParam`, `paramStructIdxOf`, `repRowOfTyStruct` and `declRowTy`, which
`paramHeldTy` already calls.

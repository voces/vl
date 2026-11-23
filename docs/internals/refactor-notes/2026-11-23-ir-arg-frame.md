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

## Price

One `start` leaves the IR: tests/cases/modules/overload-generic-fresh-binding-runs, filed D17087.
Base `1 start covered` / `1 start matched`; head `1 start uncovered argument coercion`. The global
cell of `const i` is noted at its checked type's rep while legacy stores it at its `letBindTy` row,
`V`'s, which is now the delivery rep (probe: cell 7, scope 7, storage 6, delivery 6). Legacy's
bytes do not move (A/B differ 0) and it runs. Neighbours: the local-binding spelling gains its
function; the single-import spelling holds. Narrowing `calleeParamTy` to checked types with a struct
row of their own keeps it but loses two of the seven wins. Covered-fell: tests/cases fell 1, rose 11;
corpus fell 0, rose 6. Queue ruling 2026-11-23 23:32: accepted as this price; the close
(`globalInitValue` storing a record cell at its storage row) is N8's next claim.

## Legacy tails the IR calls

None new: `vtKindOfParam`, `paramStructIdxOf`, `repRowOfTyStruct` and `declRowTy`, which
`paramHeldTy` already calls.

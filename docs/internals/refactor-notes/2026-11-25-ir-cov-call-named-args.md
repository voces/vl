# COV-CALL: a direct call with named arguments (2026-11-25)

Lane COV-CALL, class `named call` (7 rows: 6 start and init bodies, and one generic `main`).

## Mechanism

`callRhs` refused any call with named arguments. Legacy's `emitDirectCall` binds them to the
callee's parameters with `orderedDirectArgs` (over `orderArgsByParamNames`):
- a named argument goes to its parameter;
- a positional one goes to its written index;
- a missing one becomes a `-1` slot, which legacy refuses;
- the operands are then written in parameter order, which is also their evaluation order.

- **`orderedDirectArgs` is exported:** the IR's `directCallAt` walks the list it returns (named
  calls only; a positional call keeps `c.callArgs`). It misses on a `-1` slot as legacy refuses
  one, and on a captured callee (`capturedCallRhs` reads the source list).
- **`namedCallRhs`:** sends a named call to `directCallAt` only where `emitCallCoreUserFn` sends it
  to `emitDirectCall`. That is a name resolving to a declared function, no holder, no lifted
  closure, and no binding that routes it to a closure (`userFnCallRoutesRef`). Every other named
  call stays `named call`.

## Proof

- **Census (`CENSUS_CLASS=classes/named-call.txt`):** `named call` goes from 7 to 0, with no
  function or start body left unclaimed in those programs. Every class program is byte-identical
  under `VL_IR_STRICT=1 VL_IR_SHADOW=6`.
- **Q58 sweep:** `tests/cases/functions/named-arg-call-positions.vl` covers out-of-order names, a
  positional argument after a named one, a defaulted parameter left out, a UFCS receiver, a
  generic callee and a bound result, each in a function and at module scope. On master one
  function and the start body are uncovered on `named call`; with this change none is.
- **Byte identity** against the merge-base seed (default build, equal exit codes): `tests/cases` 0
  of 9,422 differ, distilled + capability probes + witnesses 0 of 18,150, and the self-compile is
  identical.

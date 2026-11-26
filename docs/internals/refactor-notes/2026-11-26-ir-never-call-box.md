# IR box ladder: a call that never returns, delivered into a union (2026-11-26, lane COV-IS)

- **The miss**: `box ladder` where a call that never returns (a function value typed `=> never`, or
  a direct `never` function) is delivered into a union: `takeU(bail("x"))` with `takeU(x: i32 |
  string)`, an interpolation hole (regen-9: `closures/never-function-value-call-positions.vl`'s
  `argUnion` and `hole`). The call's temp took an `i32`, and boxing it found no plan arm (legacy's
  `callIsNever` writes the call alone: its `unreachable` satisfies any destination).
- **What landed** (IR only): in `boxTempIn`, a temp the last node defines by a call that never
  returns (`RCall.caNever`, `RCallRef.crNever`) takes the box's rep, its consumer's, with no box:
  the verifier's never-call-temp rule admits it at any rep.
- **Parity**: byte-identical (`VL_IR_SHADOW=2` `matched`) on the sweep and the regen-9 program.
- **Q58 position sweep** (`tests/cases/closures/never-call-into-union-positions.vl`, new): a
  function value and a direct call as an argument, a binding and an interpolation hole. Master: 4
  functions `box ladder`; here all claimed.
- Found on the way, filed to the coordinator: `return bail("x")` into an `i32 | string` result in
  the callback-specialized instance (`retUnion$cb0`) builds invalid wasm on master, legacy and IR
  alike (clause 1); the sweep leaves that position out.

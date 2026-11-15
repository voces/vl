# L3 A2: a wider row forwarded through a generic function

**Change.** A delivery whose source is typed at a type parameter (`show(t)` inside `fwd<T>`)
leaves a record-widen pin (D2060), which each call of the generic re-asks with its binding
(`validateRcwPins`). That re-ask refused `fwd(v)`'s wider row into `show`'s `P` before the
width phase could make `show`'s parameter a row slot, because the pin knew neither the call nor
the parameter it fills.
- The pin now records the parameter as (declaration, position): `rcwPinDecl` and `rcwPinPi`
  in `check_covar_pins.vl`.
- `callFtyArgAssign` sets them while it checks the argument (`rcwArgDecl` / `rcwArgPi`),
  and a pin that moves out to a caller's pin keeps them (`rcwPinNoteAt`).
- At the re-ask, a wider row into a declared record parameter is noted as a width candidate
  (`rcwPinWidthNote`), as at a direct call, instead of refused.

The coordinator's sketch put the parameter position on the argument-constraint row. A named-seed
trap of the refusal (`--names`) showed it raised by `validateRcwPins`, through
`callFtyPinCstrs`, not by `validateArgCstrs`, so the position went on the record-widen pin.

**Reclassified.**
- **D16401**, a declared `: P` return of the wider row: `P` and a non-prefix row are unrelated
  WasmGC struct types, so the return needs a converting store. It waits for the accessor view,
  with D16402.
- **D16403** (new), `hole_fwd`: an un-annotated forwarder's parameter takes `P` from its body,
  and the rewrite respells only a written annotation.
- **D16400**, lambdas: VL has no generic lambda to respell into. Still A2's, with its own
  mechanism.

**Measured.** `record-param-width-before` and `-between`, master fixpoint against this
branch's: 24 → 26 of 30 graded run (`generic_fwd`, both faces). `-after` stays 30/30.
0 runs → not-runs, 0 silent. Seed +785 bytes.

**Size.** Net +42 compiler lines; pin-helper delta 0.

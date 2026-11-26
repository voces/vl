# Legacy: a closure returning its captured hole parameter returns it at the capture row (2026-11-26, lane COV-CLOS)

## Defect

D17676: `viaReturn(y)` is keyed at its hole `{f: null}` while its capture slot for `y` stores
`J`'s row (D15173, read there by the IR since D17578). The closure `() => y` returned that `J`
value at its own result type's row, `{f: null}`, so the module failed to validate inside the
closure. Legacy wrote it; the IR declined the lambda (`convert record -> record`), so legacy's
bytes shipped. The premise run found the named spelling (`function b() { return y }`) invalid too.

## Fix

* `fnRetCaptureRow(fe)` (emit_classify.vl): the one capture slot row (`captureValStructIdx`)
  every returned value of `fe` is stored at, where each is a read of a captured unannotated
  parameter.
* `criColsFromRecorded` writes that row to `fRetStructIdx` for a struct result. The lifted
  closure carries a result annotation the monomorphizer stamped, so this runs ahead of the
  annotated early return.
* `cloRetKeySuffix` keys the `$fnsig` result at that row, so the closure's signature and every
  `call_ref` through it agree. Without it the closure validated and the caller did not.
* `readCloSigKey` keys an un-annotated binding of such a closure by the closure
  (`capRowLetFe`), ahead of the binding's type.

Each part was ablated. Without the `fRetStructIdx` write the closure is invalid. Without the key
suffix the caller is invalid. The binding rung is needed by the call's own row.

## Positions

Run one by one on base and head, claims on and off:

| position | base | head |
| --- | --- | --- |
| lambda, `b().f` | invalid | runs |
| named closure | invalid | runs |
| `if` join of captures | invalid | runs |
| block body | invalid | runs |
| annotated parameter (control) | runs | runs |
| `const r = b()` | invalid | invalid (D17682) |
| `{ v: b() }` | invalid | invalid (D17682) |
| closure in a record field, `o.b()` | invalid | invalid (D17682) |
| a captured `let` | invalid | invalid |
| through an annotated parameter | check refuses | check refuses (D17681) |

The holding positions fail without any closure too: `const r = top(y)` with
`function top(y) { return y }`. That is D17682.

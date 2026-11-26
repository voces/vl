# IR: a hole-typed closure call at its key's scalar result (lane COV-CLOS, 2026-11-26)

A call whose own type is a hole (`run(2)` where `run = (x) => apply2r(h, x)` hands on a captured
hole function) has no rep of its own; `openCallValue` builds a direct call at its callee's result
rep and missed any other call (`rep unsup`). A call through a closure is now read at the scalar its
plain key's result names (`sigKeyRetKind`, `keyScalarRep`), the value legacy's `call_ref` leaves.

## Measurements

MEASUREMENTS_PLACEHOLDER

# IR: a hole-typed closure call at its key's scalar result (lane COV-CLOS, 2026-11-26)

A call whose own type is a hole (`run(2)` where `run = (x) => apply2r(h, x)` hands on a captured
hole function) has no rep of its own; `openCallValue` builds a direct call at its callee's result
rep and missed any other call (`rep unsup`). A call through a closure is now read at the scalar its
plain key's result names (`sigKeyRetKind`, `keyScalarRep`), the value legacy's `call_ref` leaves.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `903f71519`): `rep unsup` 4 → 1 unclaimed functions; the three on a call (`viaReturn$1` of
`captured-hole-fn-handed-on-two-generics.vl` and the position test's two) are claimed, and the one
left is an index's (`hole-fn-list-named-callback.vl`'s start), another class. Claimed functions
97,876 → 97,879, claimed starts 8,434 → 8,434, claims fallen back 16 → 16; 0 claimed functions or
starts lost, no other class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on `tests/cases/closures/captured-hole-fn-handed-on-two-generics.vl`:
base fails (`rep unsup`), head runs with every body claimed.

Q58 position sweep (`tests/cases/closures/hole-typed-closure-call-at-key-scalar-positions.vl`:
printed, bound and used in arithmetic, returned from the instance; at two generics): base 2
functions miss `rep unsup`, head 0; the bound position still misses `local rep unsup`, another
class. Output identical claims-off and on. A float argument there is D17664 (legacy writes
invalid wasm); the test leaves it out.

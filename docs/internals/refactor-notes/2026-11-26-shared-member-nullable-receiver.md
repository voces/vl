# IR: a shared member's nullable record receiver (lane COV-CLOS, 2026-11-26)

`take(a) { a?.f(2) }` handed a nullable record reads `f` as a generic's shared template member
(`sharedFieldCallee`): legacy reads the field at its storage off the nullable reference the `?.`
chain tested (`sharedField`, with legacy's own non-null recovery where `memRecvOwesNonNull` owes
it). The builder refused a nullable receiver because the verifier admitted no field read of a
nullable. The builder now resolves the field through the nullable's inner record, and the
verifier admits a nullable-record receiver on a shared member read only (`gfRecvRecord`).

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `e71640fbf`): `shared member callee nullable receiver` 6 → 0 unclaimed functions; 4 claimed,
2 (the position test's `const r = a?.f(…)` bindings) move on to `box null`. Claimed functions
97,769 → 97,773, claimed starts 8,420 → 8,420, claims fallen back 11 → 11; 0 claimed functions or
starts lost.

`VL_IR_REQUIRE_CLAIM=1 vl run` on `tests/cases/closures/optional-call-hole-param-nullable-record.vl`:
base fails (`shared member callee nullable receiver`), head runs with every body claimed.

Q58 position sweep (`tests/cases/closures/optional-call-hole-param-nullable-record-positions.vl`:
through `??`, bound to a `const`, as another call's argument, tested with `!= null`): base 4
functions miss, head 0 in this class; output identical claims-off and on. The chain returned
whole is D17662, a checker typing defect legacy and the IR share; the test leaves it out.

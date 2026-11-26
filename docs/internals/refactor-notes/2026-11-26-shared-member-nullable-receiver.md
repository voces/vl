# IR: a shared member's nullable record receiver (lane COV-CLOS, 2026-11-26)

`take(a) { a?.f(2) }` handed a nullable record reads `f` as a generic's shared template member
(`sharedFieldCallee`): legacy reads the field at its storage off the nullable reference the `?.`
chain tested (`sharedField`, with legacy's own non-null recovery where `memRecvOwesNonNull` owes
it). The builder refused a nullable receiver because the verifier admitted no field read of a
nullable. The builder now resolves the field through the nullable's inner record, and the
verifier admits a nullable-record receiver on a shared member read only (`gfRecvRecord`).

## Measurements

MEASUREMENTS_PLACEHOLDER

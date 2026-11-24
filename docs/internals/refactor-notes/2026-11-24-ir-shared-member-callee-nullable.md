# IR: a shared member callee over a nullable receiver misses by name (2026-11-24, lane S1)

`sharedFieldCallee`'s two functions on master (`closures/optional-call-hole-param-nullable-record.vl`'s
`take` and `bound`, `a?.f(2)` on an un-annotated parameter handed a nullable record) missed as
`shared member callee row`. They now miss as `shared member callee nullable receiver`, which names
the mechanism: legacy reads the field off the nullable reference the chain tested, and the IR's
verifier admits no field read of a nullable record. Taking the row from the inner record and the
receiver at its nullable rep was tried; the verifier refuses it (`a field read of a non-record`).

The route if this class grows is a verifier rule: a field read of a nullable record under an
optional chain whose guard tested that receiver, with the builder shape beside it. A recover
before the read would cover it too, but legacy writes none, so its bytes differ.

D16789's row gains an addendum naming the `capture binding` mechanism of its three functions.

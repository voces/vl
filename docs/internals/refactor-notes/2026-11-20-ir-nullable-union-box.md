# IR: a nullable union held as its box (2026-11-20)

A nullable value union (`A | B | null`, discipline 4) is the same `{tag, payload}` box legacy
holds a value union in. Two IR sites required a bare `RBox`: the seeded-box binding of #9197
(`declaration if per arm rep`) and the narrowed field read off a box local (`irBBoxLocal`,
`box receiver`). In the self-compile they blocked together: on master `7a7482ce` the pair was the
top row, about 317 functions blocked by the two alone.

Both sites now take `heldAsBox` (a box, or a boxed nullable), and the verifier admits a
discipline-4 receiver for `RBoxField` and the null box `RNullOf` at `NULL_OWN_BOX`, as it already
did for `RBoxNarrow`. No lowering changed: the same box is read and written.

Measured on fixpoint seeds against master `7a7482ce` (functions with no blocker, blocker census):
MEASURE.

Legacy lines deleted: 0. Moved to `@ir`: 0.

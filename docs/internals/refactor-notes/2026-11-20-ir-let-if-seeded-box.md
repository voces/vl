# IR: a union binding's `if` initializer into a seeded box (2026-11-20)

The census split `declaration if per arm` (#9188's miss for a binding legacy writes in each arm)
by legacy's rep and writer: in the self-compile it was all union boxes on the seeded path, 133
functions it blocked alone (691 with other blockers), none on the binding sink or on
`emitUnionBoxArg`; the corpus held 14 on the sink and 8 at `string | null`.

Legacy's seeded path (`emitLetIfInit` rep 0, not `letIfInitSinks`) writes the null box, then a
void `if` chain whose arms each box their value into the binding (`emitUnionBoxOwed`, on the box
table `boxOwedAt` or a box already). The IR builds the same: `RNullOf` at `NULL_OWN_BOX`, which
`emitNullOwn` writes and `emitNulNullToLocal` now writes through, then a statement `if` whose arms
deliver into the binding's box rep. `letIfInitSinks` is legacy's sink choice, which both read.
The sink, a nullable union binding (`rep`), an arm the IR cannot deliver at the box rep
(`coercion`) and an arm with a prelude stay named misses.

Measured on fixpoint seeds against #9188's head `d5aabb35b` (functions with no blocker, blocker
census): self-compile 16,022 of 19,077 → 16,115 of 19,083, corpus 35,492 → 35,492 of 45,678;
combined 79.55% → 79.69%. L2 fuel 100,661,507,344 → 100,558,365,431 (−0.1%). Remaining alone in
the self-compile: `declaration if per arm coercion` 29, `rep` 12.

Legacy lines deleted: 0. Moved to `@ir`: 0.

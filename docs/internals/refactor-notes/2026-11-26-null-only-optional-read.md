# IR: a `?.` off a name only ever `null` (lane COV-CLOS, 2026-11-26)

`a?.f` where `a` is only ever `null` reads `null` (D16841): legacy writes its receiver for its
effect (`emitNulNoneForEffect`), then the null its destination seeds (`emitNullAt`). The IR missed
every such read (`optional read of null`). Where the receiver writes nothing for its effect (a name
or a bare `null`, `nulNoneWritesNothing`), it is now that null (`nullUnitTemp`), byte-identical to
legacy. A receiver legacy writes first (`o.d?.e`, `a?.p?.q`) still misses: the verifier's null-unit
fact carries a read only for a place read, and that statement form also declares its locals apart
from legacy's.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `903f71519`): `optional read of null` 3 → 0 (`null-only-optional-read-and-call.vl`'s start, the
position test's start and its function), every one claimed. Claimed functions 97,861 → 97,862,
claimed starts 8,433 → 8,435, claims fallen back 16 → 16; 0 claimed functions or starts lost, no
other class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on the position test
(`tests/cases/closures/null-only-optional-read-statement-positions.vl`: at the top level, in an
`if` arm, in a loop body, off a local inside a function): base fails (`optional read of null`),
head runs with every body claimed and the start byte-matched; output identical claims-off and on.
The witness `null-only-optional-read-and-call.vl` keeps one function on `expression if optional
guard`, another class.

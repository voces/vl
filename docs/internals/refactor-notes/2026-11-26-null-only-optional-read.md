# IR: a `?.` off a name only ever `null` (lane COV-CLOS, 2026-11-26)

`a?.f` where `a` is only ever `null` reads `null` (D16841): legacy writes its receiver for its
effect (`emitNulNoneForEffect`), then the null its destination seeds (`emitNullAt`). The IR missed
every such read (`optional read of null`). Where the receiver writes nothing for its effect (a name
or a bare `null`, `nulNoneWritesNothing`), it is now that null (`nullUnitTemp`), byte-identical to
legacy. A receiver legacy writes first (`o.d?.e`, `a?.p?.q`) still misses: the verifier's null-unit
fact carries a read only for a place read, and that statement form also declares its locals apart
from legacy's.

## Measurements

MEASUREMENTS_PLACEHOLDER

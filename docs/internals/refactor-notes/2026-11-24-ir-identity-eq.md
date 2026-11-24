# IR: reference identity (2026-11-24, lane IR-D1)

The capability probe `identity-eq-record`, the first of the probes batch. The miss read
`operator ==`: `===` parses as `==` with `binIdent`, and the IR refused every identity compare.

## Mechanism

Legacy's `identRef` route (`emitIdentityBin`) writes each operand, then, for a union box, its
payload as an `eqref`, then `ref.eq`, and `i32.eqz` for `!==`. `RIdentityEq` builds both operands
and lowers through `identityOperandTail`, the payload read now shared with legacy. An operand
legacy reads by its box's payload must be the box (`identityOperandUnboxes`): a read narrowed out
of a union's storage is built at its member, so it misses as `identity compare narrowed box
operand`, a FREE class. A union of record and function arms (`identMixed`) is untouched.

## Verifier

`identityEqCheck` refuses an operand no reference is. Keyed self-tests:
- `identity-eq-of-records`: holds, 0;
- `identity-eq-of-string`: refused, 2;
- `identity-eq-of-i32`: refused, 2.

## Readings

READINGS

## Legacy tails the IR calls

`identityOperandTail` (wasmEmit.vl), new.

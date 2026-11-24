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

Master 1e6bf0e0 → head, fixpoint seeds:
- ir-i8 census `operator ==`/`!=`: tests/cases 19 → 6, probes 2 → 1, witnesses 4 → 2, distilled
  0 → 0; no claimed function lost in any population. What stays is `identMixed` (a union of
  record and function arms: `identity-eq-mixed-*`, D7701, D16039), two dead-test `eqTest`
  functions, and `function-values-in-two-union-arms-equality.vl`'s start body.
- `identity compare narrowed box operand`: 2 tests/cases functions, both narrowed-union reads.
- Identity: names 9,433, cases 7,790 and claimless 14,457 identical, 0 differ; A/B 7,852 same.
- L2 self-compile fuel: +0.22% on the base's own L2; the head seed on the base tree, +0.005%.

The Q58 sweep (`tests/cases/operators/identity-sweep-*.vl`, `identity-of-list-and-union.vl`)
delivers the compare at nine positions and the narrowed-union operand; `concat` is refused at
check (`string + boolean`). Claimless over them: 10 identical, 0 differ.

## Legacy tails the IR calls

`identityOperandTail` (wasmEmit.vl), new.

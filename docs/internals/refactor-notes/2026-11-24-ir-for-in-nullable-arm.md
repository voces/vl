# A walk over a nullable union-arm list is legacy's plain walk (2026-11-24, lane IR-N5)

A `for` over `(Circle | null)[]`, with `Circle` an arm of a union (D3096), has element kind
`nulvariant`. `forInElemPlain` (`wasmEmit.vl`), asked only by the IR's `forInPlainWhy`, left that
kind out, so `forInStmt` missed as `for in element nulvariant`.

Legacy's walk has no arm of its own for the kind: `forInLoopAt`, the backing read and
`emitForInLoop` are kind-generic, and `forInElemRecovers` leaves `nulvariant` out as it leaves out
`nulstruct` (a nullable element, no non-null recover). `nulstruct` was already plain.

## The change

- `forInElemPlain`'s exhaustive match moves `nulvariant` to the plain side. No legacy byte moves.

New test cases:
- `loops/for-in-nullable-arm-list-each-element.vl`: a Circle first, a null, a Circle last, an
  empty list, an index pair.
- `loops/for-in-nullable-arm-list-in-each-position.vl`, the position sweep: the loop variable at
  a nullable-arm and a union parameter, a nested call, a concatenation, an interpolation hole, a
  return, a binding, an `if` arm, a `??` operand, a record-literal field and a closure call.

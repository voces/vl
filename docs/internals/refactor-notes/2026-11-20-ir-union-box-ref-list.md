# A ref-element list and a list index read boxed into a union (2026-11-20)

After #9225 the corpus's largest remaining list rows were ref-element lists (`(C | D)[]`,
`string[][]`) delivered into a union with a matching ref-list arm, and the self-compile's last
`box ladder` row was a list index read (`rtNode[r]`) into `RepNode | null`.

## Shape
- **`refList`.** `emitUnionCoerceRefArray`'s first rung boxes a ref-element carrier under the
  tag of the ref-list arm its own slot names (`refListSlotOfExpr`, `refArrBoxTagOf`): tag, the
  list as built, `struct.new`. The plan's `refList` arm is that rung, with the tag in `hbKind`;
  an empty literal (the empty literal's rung) and a nullable list (the niche's) stay the ladder.
  A literal-only own-arm rung (`arrLitRefSlotAtTy`) was measured and took no corpus case.
- **Index.** The plan refused every index read; only a map read has a rung of its own
  (`emitUnionBoxArgGo`'s map get, which delivers the miss as the union's box). A list index
  read now takes the plan like any other value.

## Measured
See the PR body.

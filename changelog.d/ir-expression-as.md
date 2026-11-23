## Codegen, memory & runtime (Track B)

- **IR lowers five more `as` arms as legacy writes them** (`expression as`).
  - `m[k] as? V` over a scalar-valued map is the box plan's boxed read, and `m[k] as! V` the fused probe that traps on a missing key (`RMapGet.mtTrap`, over legacy's split-out `asMapProbeTrapTail`).
  - An infallible `as` over a numeric union converts at the member it holds (`RNumUnionConvert`, as a numeric-union delivery does).
  - `as?` at an instance whose operand it can never hit evaluates and drops the operand, then answers the cast's null.
  - `u as? N` over a type parameter where the cast cannot fail is either the null box (pinned at no number or `boolean`), or the plain cast boxed under the tag legacy writes ahead of it (the new `RHoleOptBox`). The verifier refuses a box of a non-scalar; keyed self-tests pin both sides.

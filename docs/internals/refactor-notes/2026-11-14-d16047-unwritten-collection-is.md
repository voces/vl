# D16047: an unwritten collection fits every `is`; writes through a narrowing pin it (2026-11-14)

Owner ruling (a1), DECISIONS "A collection whose element nothing writes fits every `is T[]`". An
empty `[]`, `Map()` or `Set()` keeps its element as a missing slot in its own arena row (`aElem`,
`mKey`, `mVal` at -1). A write pins that row in place. Before this change, three things stood in
the way:

- An `is` narrowing bound the branch to a fresh row for the tested type, so a write inside the
  branch never reached the open row: `r` stayed `_[] | i32` after `if r is i32[] { r.push(5) }`.
- Nothing settled an open member of a union (`unresolvedHole` is false for a `TyUnion`), so the
  emitter met a member with no row ("a union's arm rows were asked of a type no row holds").
- The inferred-return floor named the union by its emitter render, which has no spelling for a
  hole, and refused it.

## Change

- `isOpenMemberOf` / `openFit` (check_leaf_steps): the member of an `is` operand that fits the target
  only through an unwritten collection, nested in a list element or map value too. `checkIsExprNode`
  records the test as vacuous.
- The narrowing keeps the target's row and links it to the open row (`noteNarPin`). A write through
  it (`push`, `.set`, `.add`, an index store; `narPinWriteAt`) pins the open row to the target's
  element. A write at another type than an earlier pin is refused, as `xs.push(1); xs.push("a")` is.
- At the program's end (`settleOpenUnionRows`) every unwritten union member a binding or an inferred
  return holds takes the unbound default (`i32`), as an unwritten binding does. A vacuous `is` whose
  rows no write pinned is re-banked to the member's own row, so it tests that arm. A row the default
  settled is recorded (`settledRows`), and a later check of the test during elaboration banks the arm
  at once.
- An `[]` or `Map()` beside `null` alone keeps closing for its rep only, so hover still shows `_[]`.
- A delivery of such a union into a concrete union pins the member it fits only through the hole
  (`openFitArmOf`, `constrainEmptyD`'s union-source arm).
- The inferred-return floor for a union with an unwritten member runs after settlement
  (`flushDeferredRetFloors`), so a settled shape the emitter cannot lower keeps its hole-free twin's
  refusal (filed as D16171 and D16172). An if-expression binding's union name is exported then too
  (`settleOpenLetNames`).

## Not taken, pending the owner

The ruling's text says two writes at different types join into `(i32 | string)[]`. Direct writes do
not join today (`push: cannot add string to i32[]`), so writes through a narrowing follow the
direct-write rule. Its example's post-pin `s is string[]` is a check error under the existing `is`
rule, and calls to one function share its return row, so a pin through one call's result pins the
others.

## Measured

Master `a1e5fe53d` fixpoint seed against this branch's fixpoint seed:

- 5 templates `matrix/unwritten-*.matrix.vl` (list, map, set, a list of maps beside a map, a list of
  maps or `null`; un-annotated vacuous-test cells and write-through-narrowing cells): 358 of 358 run
  after, 0 before, 0 `runs -> not-runs`, 0 silent.
- D16024's eight `inferred-*-union` templates: 66 of 66 before and after.

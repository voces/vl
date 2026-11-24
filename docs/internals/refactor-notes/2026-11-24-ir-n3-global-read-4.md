# IR-N3: `global read coercion`, part 4 — a tagged set's id global delivered as its member's closure (2026-11-24, lane IR-N3)

A module binding holding a tagged set's id (an i32 cell) listed where a closed function type is
delivered — a list literal whose element write closes its type (D16270's `monoUncalledListElems`)
— carries the tag decision's closure coercion (`fnCloCoerceAtNode`). Legacy writes the value as
the cell holds it, drops the id, and writes the member's closure (`fnCloTail`). The IR's
`coerced` built the inner read at the coercion's closure rep and missed as `global read
coercion`.

## The read and the coercion

- `identRead`'s global path: a read the tag decision coerces to a closure, of an i32 cell read at
  a closure rep, is read as the cell holds it (`tagId`, `globalStoredRead`).
- `coerced`: the `fnClo` coercion takes an operand at a rep other than its destination's, since
  its tail drops the operand and writes the closure; the retag rep check is for the other kinds.

## Grading (tests/cases, mode 1, fixpoint seeds on master 8caa1ba2)

| class | program | before | after |
|---|---|---|---|
| i32 tag cell read at a closure | `closures/tagged-binding-listed-in-uncalled-written-list` start | `global read coercion` | covered, matched |
| the same, node-in array | its 2 list literals | `node-in array: miss global read coercion` | matched |

`start uncovered global read coercion` 10 → 9; `node-in array: miss global read coercion` 4 → 2;
start covered and matched 7,269 → 7,270.

## Legacy tails the IR calls

None new: `globalStoredRead` and the `fnClo` coercion the IR already lowers (`fnCloTail`).

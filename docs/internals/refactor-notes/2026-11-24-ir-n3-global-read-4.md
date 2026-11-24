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

## Grading (tests/cases, fixpoint seeds)

| class | program | before | after |
|---|---|---|---|
| i32 tag cell read at a closure | `closures/tagged-binding-listed-in-uncalled-written-list` start | `global read coercion` | covered, matched |
| the same, node-in array | its 2 list literals | `node-in array: miss global read coercion` | matched |

On master 86dd79148 (mode 4): `start uncovered global read coercion` 6 → 5; `node-in array: miss
global read coercion` 4 → 2; start covered and matched 7,277 → 7,278. The corpus is unchanged.

## Legacy tails the IR calls

None new: `globalStoredRead` and the `fnClo` coercion the IR already lowers (`fnCloTail`).

## Position sweep (Q58)

The shape — a global holding a tagged set's id delivered at a closed function type — in ten
positions under `VL_IR_SHADOW=6`: list element, direct call argument (function and nullable
function parameter), nested call argument, `return`, annotated `const` and `let` initializer,
`if` arm value, `??` operand, record-literal field. Every covered function matched in all ten;
the claim moves only the list element, whose start is covered; every program prints the same
under both seeds, and `ir-identity --claimless` over the ten reads identical 10, differ 0.
String-concat and interpolation operands do not apply (a closure is no string).

## Measured (fixpoint seeds on both sides)

Full proof on base master 8caa1ba2: byte A/B 20,126 programs 0 moved; `ir-identity --cases`,
`--claimless`, `--names` differ 0 / differ 0 / self-compile identical; mode 3 self byte-identical;
corpus shadow 45,559 matched, 0 order rows; self-compile guest fuel 124,801,649,434 →
124,802,244,644 (+0.00%). After a mechanical merge of master 86dd79148: `gate.sh --fast` passed,
`ir-identity --cases` differ 0, byte A/B 20,523 programs 0 moved.

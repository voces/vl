# IR: a closure global initialized by a call is the value emitExpr writes, 2026-11-22

Lane IR-N6. `start: closure value of a call` was the coordinator's current priority, at 107
tests/cases functions. A start body that initializes a closure-kind global from a call,
`const add2 = adder(2)`, sent the call to `cloInit`. `cloInit` asks `cloValue`, which reads only a
function literal or a name, so the start body missed with `closure value of a call`.

## The change

`cloInit` keeps `cloValue` for a function literal or a name. It hands any other initializer to
`globalInitValue`, the route a non-closure global already takes. Legacy writes such an initializer
through `emitStartGlobalInit` → `emitStartGlobalInitValue`. The arm is `"plain"`, which is
`emitExpr(g.letInit, -1)`, followed by `emitGlobalInitArmUnbox` and `emitUserGlobalSet`. A
`"alias"` initializer, a generic function's name, is an `Ident`, so it stays on `cloValue`.

`--claimless` and `--cases` both differ 0 over the released start bodies, which is the evidence
for that mapping. The change adds no admission predicate, node kind, builder query or state. The
split is on the initializer's node kind, `FuncDecl`/`Ident`, which is exactly what `cloValue`
reads.

## Readings (base master 228cfa5e1, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases `start: closure value of a call` | 107 | 0 |
| tests/cases start covered / matched | 5,441 / 5,440 | 5,517 / 5,516 |
| corpus `closure value of a call` | 35 | 0 |
| corpus start covered / matched | 8,709 / 8,636 | 8,738 / 8,665 |
| self-compile functions with no blocker | 19,790 | 19,790 |
| `ir-only-census`: tests/cases programs fully IR-only | 4,021 of 7,047 | 4,079 of 7,047 |
| `ir-only-census`: self-compile missed functions | 60 | 60 |

Of the 107 functions, 76 now lower and match. The other 31 miss at their next blocker:
`call result coercion` +6, `global read coercion` +7, `argument coercion` +4, `box receiver` +1,
and a tail of smaller classes.

Legacy lines deleted: 0. Moved to `@ir`: 0.

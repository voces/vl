# IR: an untyped closure value at its destination's type, and one span guard retired, 2026-11-21

Lane IR-N6. This is the `rep ?` residue IR-N5 left: a function literal or name read as a value with
no type of its own. The type is missing because the value sits in a generic hole, for example
`function mk() { return (a) => a + 2.5 }`, whose signature only a later call fixes.

## The change

- `deliver` sends such a value (`untypedCloValue`: no recorded type, no pre-path, and a function
  `cloValueFeOf` takes) at a closure-rep destination to `cloValue`. `cloValue` builds it at the
  destination's rep and type: `dstTy`, else `repTyOf(dst)`, the precedent `deliver` already uses
  for a join. Legacy writes the value by `emitClosureValue` whatever the hole, so the bytes agree.
- `cloValue` takes the temp's type as an argument. Its other three callers pass the node's own
  type, as before.
- **Span guards.** #9377 fixed the read-index spans of a `??` whose default is a nested list
  literal, so `index of a coalesced nested list literal` is retired. Its row is now covered and
  matched. `index of a tagged call` stays: removing it still mismatches `spans: read index` on
  `tests/ir-shadow-rows/tag-dispatch-ref-result.vl`, so #9377 does not cover that case.

Compiler lines +29 / −23, all in `ir_build.vl`. The new row `tests/ir-shadow-rows/closure-value-untyped.vl`
has covered and matched floors of 6.

## Readings (base: #9386's gated head `c227adfa`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 62,927 | 62,997 (+70) |
| armed `tests/cases` covered / matched | 62,927 / 62,926 | 62,997 / 62,996 |
| `tests/cases` `rep ?` (any / alone) | 259 / 142 | 135 / 69 |
| corpus functions with no blocker | 44,225 | 44,235 |
| corpus `rep ?` (any / alone) | 22 / 18 | 10 / 8 |
| self-compile functions with no blocker | 19,467 | 19,467 |
| L2 self-compile fuel | 106,309,722,120 | 106,326,208,141 (+0.016%) |

The armed fail and mismatch rows are the same three on both seeds.

The `rep ?` left is mostly a capture or a local holding an untyped function value, for example
the `d15110_captured_*` cells. Those reads have no destination rep to borrow, so they need the
value's own signature.

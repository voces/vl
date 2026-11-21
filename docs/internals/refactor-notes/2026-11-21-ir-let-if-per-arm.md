# IR: a binding's `if` initializer written per arm, all four rungs, 2026-11-21

`emitLetIfInit` writes a nullable or union binding's `if` initializer in each arm. Before this
change the IR took one rung of it: a union box binding that legacy seeds with the null box. The
other rungs were misses: the binding sink (`declaration if per arm sink`), an arm with statements
before its value (`declaration if per arm prelude`), `string | null` (`declaration if per arm 1`)
and `boolean | null` (`declaration if per arm 2`).

## The change

- **Sink.** Under `letIfInitSinks`, every arm builds its box, so legacy pops each box into the
  function's sink pair, and the missing `else` writes the null tag and payload into the pair. One
  `struct.new` follows the `if`. Three new raw effects carry this: `sink.put` (an arm's box),
  `sink.null` and `sink.close` (the box built from the pair into the binding). Each lowers through
  a legacy writer factored out for it: `unionBoxToPairTail`, `emitUnionNullToPair` and
  `unionLetSinkClose`. `sink.put` keeps legacy's `uBoxNewIsLast` peephole and its fallback through
  the binding's local. The verifier holds each effect to a union box in and out.
- **Prelude.** Each arm's statements before its value are built with `armPrelude`, as the value
  `if` builds them (legacy's `emitIfArmOpen`), in both the sink and the seeded forms.
- **`string | null` and `boolean | null`.** The rungs `letIfInitRep` 1 and 2 are the seeded chain
  without the seed: legacy pre-seeds only the box, the one cell that is not defaultable. A missing
  `else` writes `NULL_OWN_STR` or `NULL_OWN_BOOL`, legacy's `emitNulNullToLocal` bytes.

## Readings (merge-base `f96b16fc8`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 41,969 | RESULT |
| corpus `declaration if per arm sink` (alone) | 67 (20) | RESULT |
| corpus `declaration if per arm prelude` | 10 (3) | RESULT |
| corpus `declaration if per arm 1` | 8 (8) | RESULT |

Legacy lines deleted: 0. Moved to `@ir`: 0.

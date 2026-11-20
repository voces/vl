# IR coverage: a null test of a union box or a scalar map read (2026-11-20, lane IR-N1)

Two arms of `nulTestArmOf` the builder refused: `null test boxTag` (8 self-compile functions alone)
and `null test mapHas` (7). Measured on fixpoint seeds of this branch and of its merge base,
`6851d881`, each building this branch's source.

## The shapes

- **`boxTag`**: `x == null` over a `U | null` union box, mostly `const n = repNodeAt(r)` then
  `n == null`. Legacy writes the box, its tag, `null`'s tag and `i32.eq` (`i32.ne` for `!=`). That
  tail is now one shared writer, `nulTestBoxTagTail`, which legacy and `RNulTest`'s lowering both
  call. The operand must be held as a box (`heldAsBox`: `RBox`, or the discipline-4 nullable, which
  is the box itself and never `ref.null`), and the verifier's `RNulTest` rule accepts that rep.
- **`mapHas`**: `m[k] == null` over a scalar-valued map read. Legacy's `emitMapHas` is the same
  writer `m.has(k)` uses, so the builder builds the `RMapHas` that `mapHasRhs` builds for the call,
  now taking a receiver and key node, and negates it with `not` (`i32.eqz`) for `==`.

No new IR op and no new decision: both arms are legacy's `nulTestArmOf` answer.

## Coverage

MEASUREMENTS

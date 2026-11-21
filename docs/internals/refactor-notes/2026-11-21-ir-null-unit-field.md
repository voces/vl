# IR: a `null`-unit record field takes its slot's null, 2026-11-21

A variant literal's field of the `null` unit type missed as `object variant field nulnone` (33
corpus functions, 15 alone). Legacy writes that field as `emitNulNoneForEffect` on the value, then
`ref.null none`. For a bare `null` or a name, the effect writes nothing.

## The change

- `nulNoneWritesNothing` in `wasmEmit` is the one test of "a bare `null` or a name read", and
  `emitNulNoneLeafForEffect` now asks it.
- The IR builds such a field, for a variant arm or a struct (`nulnone` arm), as `RNullOf` with
  `NULL_OWN_NONE`. That is the bottom ref legacy writes after an empty effect. A value that runs
  for effect (a call, a `??`, an `if`) stays the named miss.
- The `null` unit's rep is `RPrim "null"`, which the verifier's `RNullOf` rule refused.
  `NULL_OWN_NONE` into that rep is now admitted in the builder's `nullOwnRepFits` and in the
  verifier, since the unit's one value is the bottom ref. No IR op is added.

## Readings (merge-base `4c186c336`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 43,118 | 43,133 (+15) |
| corpus `object variant field nulnone` (alone) | 33 (15) | 0 |
| self-compile functions with no blocker | 19,239 | 19,239 |
| L2 self-compile fuel | 104,227,990,241 | 104,236,647,314 (+0.008%) |

The class's other 18 functions stop at a later blocker. A `null`-typed local's own rep
(`local rep null`) is the next one in the witness.

Legacy lines deleted: 0. Moved to `@ir`: 0.

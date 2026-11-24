# IR: a compare of two `null`-typed sides (2026-11-24, lane S1, D17088's follow-up)

`a == b` with both sides typed `null` is the constant `true` (`false` for `!=`). Legacy's
`emitNulNoneEq` still runs each side for its effect, left then right (`emitNulNoneForEffect`). The
IR handled such a pair only when neither side wrote anything (`nulNoneWritesNothing`):
- through `nulTest`, with a `null` literal on one side, it missed `null test of null`;
- two non-literal sides took the numeric dispatch and missed `operand at null`.

## The mechanism

- `nulNonePairEq` passes each side to `nulNoneEffect` with a sink (one walk, R8). It returns the
  constant, or `RAfterEffects` over it when a side has an effect, so the effects are written where
  the answer is read, as legacy writes them. No new node kind.
- Two callers: `nulTest`'s `null`-typed-pair arm, and the binary `==`/`!=` dispatch, which takes it
  only on legacy's own route (`eqRouteOf` `nulNone`).
- `(m = null) == n` with `n` a nullable name is not this arm. It is N9's `null name test`
  path, and it is unchanged.

## Measured

- Census on master `cea354ff6`: every `null test of null` row is covered with no mismatch. The
  remaining misses in those programs are other classes:
  - `print nulNone` (five built-list lambdas)
  - `print operand rep`
  - `assignment value lit after an operand` (D17109's guard; `deep-is-arm-write-in-expression`)
  - unmasked, not a regression: `hole-guarded-call-through-null-field-no-declared-row` and
    `-null-typed-field`, whose `F` moves to `uncovered method f`.
- `matrix/null-pair-compare.matrix.vl`: runs 78 of 78 graded on both seeds. Under
  `VL_IR_SHADOW=6`, 78 cells go from `operand at null` to clean. The cells read the call trace, left
  then right.
- An assignment of `null` as a side (`(s = null) == n()`) is an invalid module on master. That is
  legacy's bytes, filed as D17423, and out of this change.

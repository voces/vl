# D17423: an assignment of `null` as a side of a `null`-typed compare (2026-11-24, lane S1)

`(s = null) == n()` passed `vl check` and emitted an invalid module (`expected i32, found
nullref`). A route probe, `emitFail` markers on `emitEqRoute`'s `nulNone` and `deadNull` arms,
showed the compare took neither. `eqRouteOf` asks `nulNoneEqSides`, which asks `exprIsNulNone` per
side, and `exprIsNulNone` has no arm for an assignment. So the pair fell to `numeric`, which wrote
`i32.eq` over two nullrefs. `(s = null) == null` ran only because a bare `null` pairing takes an
earlier route.

## The fix

- `nulNoneEqRoute(l, r, fnIx)` (`emit_plan_null.vl`) holds where `nulNoneEqSides` does, or where
  a side is an assignment of `null` typed `null` (`asgYieldsNullLit`) and each side is such an
  assignment, the unit, or a bare `null`.
- `eqRouteOf` reads it for its `nulNone` route, whose writer, `emitNulNoneEq`, already runs each side
  for its effect and then writes the constant.
- `nulNoneEqSides` and `exprIsNulNone` are unchanged. Widening `nulNoneEqSides` instead cost two IR
  claims, because the IR's `nulTest` reads it (`deep-is-and-operand-reads-copy`'s start, at
  `(w = null) == null`).

## Measured

- Legacy A/B over the corpus: identical 9433, differ 0; self-compile identical. Over tests/cases
  and the capability probes, only the new fixture moves: from an invalid module to valid.
- IR claims, master to candidate: tests/cases 87950 covered and 87939 matched, unchanged; the corpus
  46923, unchanged.
- The IR still declines these spellings (`operand at null`), so legacy writes them. With #9969 the
  IR's `nulNone` dispatch pre-filters on `nulNoneEqSides`, so it declines them too. Covering the
  assignment pair in the IR is a later step.

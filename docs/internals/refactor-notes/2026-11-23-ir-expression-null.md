# A bare `null` literal: the null box, the bottom ref, a parenthesised sentinel (2026-11-23, lane IR-N5)

`expression null` was 18 tests/cases programs on master fa7f0009. It is `exprAt`'s fall-through: no
arm built a `null` literal, only `deliver`'s rules at a sentinel, ref or box destination. A probe
printed the asked rep, `nullOwnAt` and the function for each miss. Every miss is in the program's
own code (the two dead-tail programs' high function index is the `std:fmt` import ahead of them).

| family | programs | the `null` | legacy writes |
|---|---|---|---|
| A | 10 | a shared `let` with no initializer, rewritten to a `[null]` cell list over the `T \| null` box (D16023) | the null-tagged box, `ref.null none` its payload |
| B1 | 4 | a lambda body `(null)` at a `boolean \| null` or `K \| null` closure result | the sentinel (`i32.const 2`) |
| B2–B5 | 4 | a bare `null` statement, a dead tail after `return`, a `null` argument through a hole callee, a loop's value | `ref.null none`, the `null` unit's one value |

## The change

- **A.** arrayLit's union-row arm builds a `null` literal element as no value (`unionElemValue`):
  the box writer then writes the null tag alone, as it does for `deliver`'s `null` literal.
- **B2–B5.** `exprAt` builds a `null` literal at the `null` unit, where it names no null of its
  own, as the bottom ref (`RNullOf` with `NULL_OWN_NONE`), as legacy's `emitNullAt` does.
- **B1.** `deliver`'s `null`-literal rule asks `nullOwnAt` of the literal, not of the parens
  around it; the parens' own answer is no sentinel.

No new node, verifier rule or legacy hook. New test cases:
- `closures/shared-let-no-init-set-by-one-closure-read-by-another.vl`
- `statements/null-statement-dead-tail-and-hole-argument.vl`
- `closures/parenthesised-null-lambda-at-a-sentinel-result.vl`

## What it unblocks

All 18 programs leave `expression null`; 9 have no uncovered row left. Five of family A stop next
at `store element`: the rewritten cell write `u = k` stores an unboxed value into the union list,
which `idxStorePlainWhy` refuses where no box is owed. `loops/loop-value.vl` stops at `declaration
coercion` (D1).

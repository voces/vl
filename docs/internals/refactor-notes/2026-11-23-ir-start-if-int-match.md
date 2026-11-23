# IR coverage: `start: expression if int match` (2026-11-23, lane IR-N8)

The IR-only census on master e6cb8541 ranks `start: expression if int match` at 19 start bodies in
19 programs, 17 of them the program's sole blocker. A probe at the miss recorded each head's
switch plan and scrutinee: 18 of the 19 have no `br_table` plan (`intSwitchPlanOf` null), with a
scrutinee that is not a plain name (`match 1`, a member read), and 1
(`computed-scrutinee-evaluated-once`, a string join) has a plan with an `else`.

- **`ifShapeWhyOf` (wasmEmit.vl, read by the IR alone)** refused an integer `match` head whose
  scrutinee is not an `Ident` even with no plan. Legacy's `emitIfExprAsLink` asks `emitIntSwitch`,
  which declines without a plan, and writes the plain chain whatever the scrutinee; the IR now
  takes the plain chain the same way. A head with a planned `else` stays `int match` (the IR's
  `valuedSwitch` covers a scalar join; a string join stays legacy's).
- **Integer `-` over a valued `if`** is now the named miss `integer negation of a valued if`
  (`ifBelowLead`): legacy writes `0 - x` with the zero first, above the `if`, and the IR's lowering
  refused that order at lowering time (`stack value read out of order`). On master this already
  made a function holding `-(if c { … } else { … })` at an integer a claimable function that did not
  match; it is now uncovered, and the start of `negated-join-adopts-typed-peer` is the same miss
  instead of a mismatch.

## Measured

On the 19 programs, master ff34a69e's tree on a one-step seed against this branch:
`start matched` 1 → 17; left: `expression if int match` 1 (the planned string join),
`integer negation of a valued if` 1, `float literal at an integer` 1.

Row: `tests/ir-shadow-rows/start-match-plain-chain.vl`. On master: the start uncovered `int match`,
and the `-(if …)` function a mismatch and a claimable-function failure. Here: the start matched and
the function uncovered, with the same output.

## Legacy tails the IR calls

None new.

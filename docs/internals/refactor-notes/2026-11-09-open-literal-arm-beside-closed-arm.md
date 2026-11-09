# Step 4: an open literal arm beside a closed one takes the closed arm's type (2026-11-09)

Lane "fn-value rows 10". Base: master `5c46eb2b`, built to a fixpoint (6,572,040 bytes). The
candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`g(if c { { f: inc } } else { { f: id1 } })`, `inc` annotated and `id1` not (D15331). The
checker joins the arms at the open arm's type, `{f: (_) => _}`, so `elabCallHoleParamTy`
answers no closed type for `g`'s `r` and no pin delivers `id1` at `(i32) => i32`. It reached
codegen with no instance. Bound to a `const` first (D15304) or listed, the same `if` refused at
the same site. Both arms un-annotated already ran (D15301 M2), and so did an open arm that reads
a binding (`const o = { f: id1 }`).

| producer | change |
|---|---|
| `monoCoerceIfArms` (emit_mono.vl) | when the `if` is open and exactly one arm is closed and holds a function, an open record or list literal arm is delivered at the closed arm's type (`monoElabDeliver`), and the `if` is typed there. `monoWalk` visits an argument before its call, so the call's pin then sees a closed argument |

Two candidates that did not move it, kept here so nobody re-tries them: walking value `if`s in
`mfrLitsVal` (the flow table's literal roots), and queueing a literal leaf in `adoptArmAt` with
`recPend` as a binding read is.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,752 programs | | 23,750 same, 0 bytes-only, 2 output movers, 0 `runs → not-runs`, 0 new traps, 1 only in candidate (the new fixture) |
| the 2 movers | emit reject | D15331's and D15304's witnesses run and print their Want |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.6% / −2.7% |
| plumb-shape peak RSS, main / tail | | +0.0% / +0.3% |
| late demands | 6 | 11: the fixture's five instances, demanded by this delivery after the elaboration ran (baseline written) |
| seed (fixpoint) | 6,572,040 | 6,572,342 (+302; +2.7% of the seed-size baseline) |
| `if-arm-record-fn-field-{two,same}-member` matrices | 36 / 48 | 36 / 48 (no cell has an annotated member) |

## What stands

An `if` whose closed arm reads a binding (`if c { o } else { { f: id1 } }`, `o = { f: inc }`) is
a check reject on base and candidate alike (`cannot be delivered as {f: (_) => _}`): the checker's
join is the open arm's there too. That join is the checker's to fix; this PR only reconciles a
literal arm. A lambda arm (`{ f: (a) => a * 3 }`) is `cannot infer a type for parameter` on both.

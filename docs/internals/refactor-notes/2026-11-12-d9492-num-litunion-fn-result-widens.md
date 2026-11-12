# D9492: a numeric literal-union function result widens where a `return` delivers it, 2026-11-12

The owner ruled that a function result widens through any delivery a `return` already makes.

## What changed

- `fnSlotRetAssignable` (`check_relate_core.vl`) also admits a result through
  `litNumUnionConverts`, the relation a binding or `return` uses for a numeric literal union: the
  destination holds each literal exactly. This applies to the result itself and to the non-null
  part of a nullable destination.
- The delivery's adapter (`fvaAdapt`) converts the value at its `return`, as it does for D15896's
  prim widening. A parameter stays invariant.

So `() => 1 | 2 | 5000000000` is a `() => i64` and a `() => f64`. A member the destination
cannot hold keeps the union refused there: `16777217` in `f32`, `5000000000` in `i32`.

## Merge with master

master's #7552 (D15896) only reworded `fnSlotRetAssignable`'s header, and this branch keeps its
own wording. DECISIONS.md and the D9492 row keep this branch's text. `changelog.d/w320-fn-result-widen.md`,
which #7605 folded on master, is dropped again.

## Measurement

`scripts/capability-matrix.vl`, the master seed (`cf01f012`'s compiler) against the merged tree:

| template | after |
| --- | --- |
| `fn-value-num-litunion-result-as-i64` | 48 of 48 |
| `fn-value-lambda-num-litunion-as-wider-scalar` | 48 of 48 |
| `fn-value-num-litunion-result-as-i32`, `-i32-generic` | 48 of 48 each |
| `fn-value-lambda-num-litunion-as-nullable` | 48 of 48 |
| `litunion-mixed-width-into-f64` | 48 of 48 |
| `litunion-mixed-width-return` | 66 of 66 |

Every template: 0 runs → not-runs, 0 → silent, 0 program trap.

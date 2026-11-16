# One storage decider: class 2, partial sets, 2026-11-16

Lane STORE, after the producer-coverage PR (#8636). Class 2 is a set the check left because a
place it reaches is also reached by another set (reason P in the progress note's table).

## What was wrong with "partial"

`sbPartialNote` marked a set partial when any other set reached the same parameter, at any call.
- A declared function's instance is keyed by the set its parameter holds, so `f(add)` and
  `f(mul)` are two instances, each with a one-set parameter. Neither set is partial.
- A function read as a value (aliased, held, passed, a lambda) is different: its instances share
  the call, so two sets there do join. `sbValueFn` records those, and only they keep the old rule.
- A field or path read (`sbPathCallKeys`) keeps the old rule: one place, many writers.

Two exclusions keep the late decision where the elaboration still owns it. Each was found as an A/B
regression of the bare change:
- a one-member set whose member is inside a larger called set follows that join
  (`fnTagDecide`'s two passes decide it with the join);
- a set handed to a parameter annotated with a closed function type builds a closure there, so its
  tag waits for the elaboration's delivery note.

This PR also carries one coverage slice: calls through a `const` bound to a hand-back call, and
`const` list aliases chained.

## Measurement

ftlate probe, all 6,528 `@run` programs, fixpoint seeds:
- programs whose decision the late pass changes: 352 → 341;
- late drops: 2, the same pre-existing pair;
- P sets 268 → 205 (programs 141 → 110).

| reason | sets | programs |
|---|---|---|
| P, partial | 205 | 110 |
| N, never found | 190 | 94 |
| G, a generic member (S3) | 117 | 93 |
| T, refused by the check (S3) | 85 | 66 |
| V, handed to or by members | 14 | 5 |
| J, follows a join (new exclusion) | 12 | 9 |
| C, delivered to a closed fn type (new exclusion) | 9 | 7 |
| S, stored parameter (S3) | 7 | 7 |

By blocker: P only 86, G only 70, T only 61, N only 58, N+P 14, N+G 12, C only 6, J only 5,
V only 5, G+P 5.

A/B: wasm and output byte-identical on all `@run` programs, fixpoint seed against master's own
fixpoint seed.

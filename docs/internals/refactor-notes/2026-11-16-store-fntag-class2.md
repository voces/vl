# One storage decider: class 2, partial sets, 2026-11-16

Lane STORE, after the producer-coverage PR (#8636). Class 2 is a set the check left because a
place it reaches is also reached by another set (reason P in the progress note's table).

## What was wrong with "partial"

`sbPartialNote` marked a set partial when any other set reached the same parameter, at any call.
- A declared function's instance is keyed by the set its parameter holds, so `f(add)` and
  `f(mul)` are two instances, each with a one-set parameter. Neither set is partial.
- This holds for a function read as a value too (`const k = apply2`, `[apply2]`): a call through
  its set still mints an instance per argument set. Only a lambda, which has one instance, keeps
  the old rule.
- A list element or record field reached through a parameter (`sbPathCallKeys`) is the same: the
  parameter's type, set included, keys the instance.
- What is left of P is the `lack` arm: the place is also reached by a value the check gives no
  set, typically a forwarded hole parameter (`const hh = h; apply2(hh)`). Only the instance knows
  that set, so this residue is an instance fact and waits for S3 with class 1.

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
- programs whose decision the late pass changes: 352 → 331;
- late drops: 2, the same pre-existing pair;
- P sets 268 → 120 (programs 141 → 68). 68 sets move from P to T: the check now tries them, and
  refuses them until S3 gives the member results.

| reason | sets | programs |
|---|---|---|
| T, refused by the check (S3) | 153 | 98 |
| N, never found | 190 | 94 |
| G, a generic member (S3) | 117 | 93 |
| P, partial | 120 | 68 |
| V, handed to or by members | 14 | 5 |
| J, follows a join (new exclusion) | 12 | 9 |
| C, delivered to a closed fn type (new exclusion) | 9 | 7 |
| S, stored parameter (S3) | 7 | 7 |

By blocker: T only 92, G only 70, N only 58, P only 45, N+P 14, N+G 12, C only 6, J only 5.

A/B, fixpoint seed against master's own fixpoint seed, all 6,540 `@run` programs: output
byte-identical everywhere; two named wasm movers, both smaller:
- `closures/local-alias-of-hole-fn-handed-two-sets-beside-loop-list-call.vl` and its
  `-other-order-` twin. `const k = apply2; k(add); k(mul)` beside `[apply2]` called with `add`:
  `{add}` was a closure in master's output and the check now tags it (451 → 398 bytes).

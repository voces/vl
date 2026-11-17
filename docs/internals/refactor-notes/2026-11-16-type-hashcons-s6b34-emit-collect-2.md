# Type hash-cons stage 6b, tier 2: emit_collect.vl's union-registration walks, part 2 (lane HASH), 2026-11-16

Stacked on part 1 (s6b33). `emit_collect.vl` goes 11 → 8: the three registration walks, which carried
depth-graded memos.

| census row | function | was | now |
| --- | --- | --- | --- |
| 335 | `collectTyReachRegister` | `depth` 16 down; memo of the deepest depth a walk completed at | per type and `underFunc`: `CTR_OPEN` while the walk is inside it (a revisit is a cycle and registers nothing more), `CTR_DONE` once a walk completed (off under the A/B shadow, as before) |
| 336 | `collectTyMembersReach` | `depth` 15–16 down lists and maps | types seen |
| 337 | `collectTyReachCloSigs` | `depth` 16; memo of depth and generation | the generation a node was visited at, plus `ctwOpen` for the nodes the walk is inside |

A cycle through a recursive union now ends at its first revisit instead of unrolling to depth 16.
The registration order of the unions the identity sweep covers is unchanged: every module is
byte-identical.

## Grading (fixpoint seeds, part 1 vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- `tests/vl_scaling_shape_test.ts`: passes (`scripts/gate.sh`).
- Self-compile fuel: 94,023.4M against part 1's 94,063.7M (−0.04%).
- `walk-limit` baseline: 524.

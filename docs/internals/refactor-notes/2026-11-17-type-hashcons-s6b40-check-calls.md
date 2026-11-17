# Type hash-cons stage 6b, tier 2: check_calls.vl's type, literal and binding walks (lane HASH), 2026-11-17

The last tier-2 change, converted before the stop ruling and landed by coordinator ruling.
`check_calls.vl` goes 11 → 1. This covers the census-reached `calleeSlotOf` (row 27),
`holeFieldCopyOf` (row 21) and `checkHandedFns` (row 17).

| function | was | now |
| --- | --- | --- |
| `calleeSlotOf` (+ `calleeMapGetSlot`, `calleeCopyCallSlot`) | `depth > 8` | nodes seen |
| `calleeJoinOperands` / `calleeJoinOperand` | `depth > 8` | the `??` / `if` tree's own end |
| `noteHandedOpenIn` | `depth > 8` | nodes seen |
| `checkHandedFns` | `depth > 4` | nodes seen |
| `holeFieldCopyOf`, `holeFieldCallWidened` | `hops < 8` of `const` copies | bindings seen |
| `constLambdaOf`, `calleeReassignedFnValue` | `hops < 8` of aliases | nodes seen |
| `bindHoleElemWalk` | `depth > 8`; `depth == 0` meant "the parameter itself" | types seen; the first visit is the parameter |
| `nameDeclaredAround` | `guard < 64` enclosing functions | the climb's own end |

`holeParamUnreadIn` (row 19, `HOLE_FWD_UNREAD_MAX`) keeps its bound. It follows a forwarded
parameter into other functions, which makes it a call-graph walk, and it belongs to the
cross-question memo design item (s6b39).

## Grading (fixpoint seeds, master `e45d81194` vs this branch, then re-checked after merging master)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class, before and after the merge.
- Deep-nesting grid: 240 of 240 run.
- Self-compile fuel: 94,228.1M against master's 94,202.7M (+0.03%).
- `walk-limit` baseline: 495 after the merge.

# Type hash-cons stage 6b, tier 2: emit_rep.vl's walk limits (lane HASH), 2026-11-16

`emit_rep.vl` goes 5 → 0: the census-reached `repNeverCanon` (row 515) and the file's four
unreached sites.

| function | was | now |
| --- | --- | --- |
| `repNeverCanon` | `depth > 8`; the memo kept answers computed at any depth | `RNC_OPEN` in the memo while walking a type; a revisit is a cycle and stays as it is |
| `valueBoxArmsInto` | `depth > 8`; `depth > 0` meant "nested" | path of types; nested is `path.length > 1` |
| `btSoftMembersGo` | `depth > 8`; `depth > 0` meant "nested" | path of types, as above |
| `btSoftElemSame` | `depth > 8`, but every caller passed 0 | the dead bound is gone |
| `tyDenotesFunc` | `steps < 8` peeling one-member unions | types seen |

`valueBoxArmsInto` and `btSoftMembersGo` keep a path, not a global set, because both answer false
for the whole walk on a revisit, and a shared member is not a cycle.

## Grading (fixpoint seeds, master `846d9d9e9` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- `scripts/rep-fuzz-check.sh` (in `scripts/gate.sh`): ok.
- Deep-nesting grid: 240 of 240 run.
- `tests/vl_scaling_shape_test.ts`: passes.
- Self-compile fuel: 94,147.1M against master's 94,142.3M.
- `walk-limit` baseline: 528.

# IR door guard: the push receiver's strict cast (2026-11-20, lane IR4)

This is ir-design §10.2.1, step 2, built as IR-REV specified. Step 1 (#9196) left 3 live hits at
the list-literal door, all `push receiver cast`.

## What changed

- **`emitListPayloadCast(wrap)` is now `listPayloadCastTail(wrap, strict)`.** Its three callers in
  `wasmEmit.vl` pass `listCastForPush`, so the flag is read at the call, not deep in the tail.
  Bytes do not move.
- **The guard drops `listCastForPush`.** The flag changes only the list payload cast. No IR module
  reaches that cast, because the IR's `is` builder admits only the variant and `armTag` rungs, so a
  narrowed list-arm read misses `is rung` before lowering.
- **The tripwire enforces it.** A test fails when any `compiler/ir*.vl` imports
  `listPayloadCastTail`, `emitUnionUnboxTail`, `emitPlaceNarrowContainerUnbox` or
  `emitRefArrayUnionUnboxRead`, and its message names §10.2.1. It was checked by injecting an
  `emitUnionUnboxTail` import into `ir_lower_ref.vl`: the test failed, naming the file. The day an
  IR module needs one of these, `strict` becomes a door parameter.

## Controls (`tests/vl_ir_door_guard_test.ts`)

- `[[]][0].push(2.5)` now matches with no live row, so dropping the context costs nothing today.
- A list-arm narrowing in a push receiver still misses with `uncovered is rung`: the first route
  that would need `strict`.
- The import tripwire above.

## Measured

Fixpoint seeds: step 1's head (9a7ad39a4) against this branch.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,516, differ 0 |
| `--claims` / mode 3 | ok / identical |
| L2 fuel | 100,606,982,366: flat on step 1 (100,608,023,712) |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, `deno lint`, ladder-sets, dead exports, comment budget | clean |
| phase state, late demands | ok / 307 tag rows |
| `deno task test` | 9,584 passed, 0 failed |

**Lines: compiler +9 / −9 (net 0), tests +53.** This is a refactor and a guard narrowing. Nothing
is deleted.

# A generic copy's shared list field takes its type in the instance's frame (2026-11-08)

Lane "two open function-holding rows, then the set join at instanced signatures". It follows
[2026-11-08-generic-copy-frames-and-slots](2026-11-08-generic-copy-frames-and-slots.md) (#6785).

## D15551: the list field had no type in the frame

The copy of `{ fs: [inc0], x: x, y: [x] }` in `mk<i32>` is minted from its literal in the
instance's frame (`mintGradualObjLitRows`). Its fields are the template's shared children.
`monoRecordObjLitAt` recorded the shared read `x` in the frame, but a shared list literal only
when it held functions (`monoPinFieldContainer`). So `y` read `T[]` in the frame, had no field
code, and `anonMintRowFor` minted no row. With no row in the module, `emitObj` refused with
`object literal but no struct type declared`.

The fix records a shared list of values at the field's type in the frame (5 lines). The record
sits outside the open test of the list's own column. The first frame to record a node also
writes that column (`nodeTyRecordIn`), so the second instance saw a closed list and skipped it.
That first cut turned `{ fs: [inc0], y: [x, x] }` at `"q"` and `3`, which runs on master, into
invalid wasm. It is now a named cell.

## Measured

Base: this branch's parent (`bc340bde`, #6785) at its fixpoint, 6,511,380 bytes. Candidate: a
fixpoint at 6,511,452 bytes (+72). `scripts/sweep.vl -- diff` over 23,649 programs: 23,648 same,
0 bytes-only, 1 output mover, D15551 (`emit_reject → runs`). 0 `runs → not-runs`, 0 new traps.
The four new `named/` cells (`d15551_*`) and one case were added after the sweep. All run; three
were refused on the base and `d15551_bare_record_two` already ran there.

## Still refusing

- [D15552](../inventory/D15552.md), `[mk(1)]` with the set called at a literal. Ablated this far:
  the set is tagged when it is called at a literal, and the binding then holds the rep
  `{fs: i32[], x: i32}[]` (D15350). Three misses stack:
  1. `mintPinnedObjLit` deep-interns the copy's closed type before `mintGradualObjLitRows` can
     mint it from the literal, so the copy's row has a closure-list `fs`.
  2. No ref-list slot exists for the held rep's element. `collectA` interns that slot for a held
     map, not for a held list.
  3. `rs[0].fs` asks for the row of the checker's type `{fs: ((_) => _)[], x: i32}`. In the
     non-generic twin the literal's own row is keyed by that type. The generic copy's row is
     keyed by the copy's closed type, so no row answers.

  Fixing 1 and 2 (a defer and a list twin, both in `emit_collect.vl`) moves the refusal to
  `field access receiver is not a struct`. An exact-id alias of the instance's checked result
  to the copy's row (`structTyIxAlias`) did not move it: the readers ask `repRowOfTyStruct`.
  Parked, since the next step is a rep-key decision.
- Built at different rows (D15226/D15510): not started here.

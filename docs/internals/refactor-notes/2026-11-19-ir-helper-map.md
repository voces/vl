# Runtime helpers through the IR, step 3: the map and list helpers (2026-11-19)

Family F of §10.1(b) (`ir-design-2026-11.md`), on the door and raw layer of
`2026-11-19-ir-helper-door.md`. Built as IR and lowered to the bytes their hand-written writers
emitted:
- `__map_probe__` and `__map_entry__`, `__map_probe_i32__` and `__map_entry_i32__`,
  `__map_probe_i64__`;
- `__map_get_<row>__`;
- `__map_resize__`, `__map_resize_i32__`, `__map_resync__`;
- `__map_compact__` (one per map shape), `__grow_<row>__`.

The writers and their helper-only sub-writers are deleted: the two probe loops, the back edge,
the trap reason, `emitMapPlaceEntry`, the five `mapCompact*` steps and `fbMapSlotOf`.

## Shape
- Two raw ops:
  - `array.fill`, for the compaction's in-place index clear;
  - `tag64`, an i64 key variable's pair tag. It lowers through `fbMapTagOfI64`, the writer the
    inline map append also uses, so the two cannot tag differently.
- The slot generator (`slotOf`, Fibonacci hashing of a tag under a mask) is now built only in
  `ir_helper.vl`. Every map index placement goes through it.
- `MapCompactTys` moves to `ir_helper.vl`, with `keyStr`/`keyI64` in place of the checker's key
  kind, so the helper module imports no checker constant beyond `TY_*`.
- The i64-keyed helpers type their key and sequences with `TY_I64`, a fifth type-id constant in
  `ir_helper.vl`'s phase-state surface.
- A moved entry element in the compaction passes untyped (an i32 rep) from `array.get` to
  `array.set` of the same heap type. No table keeps the element type.

## Measured
- The self-compile, the compiler being `Map`'s heaviest user, is identical: the current source
  built by the seed with the hand writers and by this one.
- A map program over string, i32 and i64 keys, with deletes, growth and a keys walk, builds to
  identical wasm and identical output.
- `tests/cases` and the distilled cells against the master seed: see the PR body.
- Lines, compiler only: +637 / −939. The bodies are about 0.6× the hand lines they replace.

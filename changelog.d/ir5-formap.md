## Codegen, memory & runtime (Track B)

- **IR: a `for` walk over a map's keys or values.** A walk over a map global (`for k in m`, `m.keys()`, `m.values()`) is claimed: the IR reads the global and legacy's stash and list halves (`forInMapStash`, `forInMapList`), which `emitForInStmt` also calls, write the rest.

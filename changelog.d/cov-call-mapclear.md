## Codegen, memory & runtime (Track B)

- **IR claims a map or set `.clear()` statement:** the receiver is read as any map operation reads it (a global with its recovery, or a local), then legacy's reset in place, split out of `emitMapClear` as `mapClearTail` and shared by both emitters (`RMapClear`). `method clear` falls from 9 rows to 0.

## Codegen, memory & runtime (Track B)

- **IR coverage: a capturing nested function read as a value through its function-value cell.** The value is now legacy's cell fill, and an environment that carries the cell reads it where the frame reaches it (`makeClo`, `emitCloCellRef`). In the 308 tests/cases programs with a nested function, `closure env cell` drops from 11 to 0, `closure env capture` from 8 to 2, and covered = matched rises from 4403 to 4420. Legacy's bytes don't change.

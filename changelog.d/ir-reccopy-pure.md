## Codegen, memory & runtime (Track B)

- **IR coverage, record copies of a pure source:** the IR builder now builds a record copied into another row whose source the copy re-reads per field, as a migration leaf legacy writes whole (`RRecCopyPure`, retires at I8).

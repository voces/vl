## Codegen, memory & runtime (Track B)

- **IR: a bundle parameter builds as its record of closures**: its open type is `bundleRecordTyOf` over its signatures, a function returning it whole returns that record, and it is read whole as that variable. A named closure call statement drops as legacy's split-out `callStmtIdentDrops` decides. tests/cases `open parameter type` 197 → 0; +186 claimed functions there, +243 over the five I8 populations. Byte-identical.

## Codegen, memory & runtime (Track B)

- **IR coverage, control-flow batch 4: a range loop over a hoisted list header, a range proven over its list's length, and a `for` walk over a list of closures.** The IR opens legacy's header hoists and range proof at the point `emitForRangeStmt` does, so a proven read skips its guard exactly where legacy's does and an unproven one keeps it. tests/cases: covered functions +67, starts +29. `for range hoisted` 29 → 0, `for range proven` 14 → 0, `for in element closure` 28 → 0. No legacy bytes moved.

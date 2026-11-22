## Codegen, memory & runtime (Track B)

- **IR coverage: a dense integer `match` is one `br_table` (`SIntSwitch`).** The IR builds legacy's `emitIntSwitch` from the plan both now share (`intSwitchPlanOf`), in tail and statement position, at i32 and i64; tests/cases `tail if switch` 63 → 0 and `if switch` 23 → 0, self `tail if switch` 1 → 0.

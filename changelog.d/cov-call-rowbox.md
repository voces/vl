## Codegen, memory & runtime (Track B)

- **IR reads a field stored wider than its read:** take a record held at a later view's row, whose number field is stored wider and beside `null` (`i64 | null`, `f64 | null`, or `f64 | string | null`). A field read at its own `i32` or its own box now builds through the IR. Before, it missed `field read of a stored row's box`. As legacy's tail does, the read takes the stored field past its null and narrows it to the read's own rep (regen-10 class 4 programs -> 0: two tests/cases programs and the witnesses of D15716 and D3403).

## Codegen, memory & runtime (Track B)

- **IR coverage:** a shift-mask fold whose source is an i64 shift wrapped to i32 is built by the IR: the source at i64, then `i32.wrap_i64`, as legacy writes it. The narrowing form without an outer shift is the same fold at shift 0. `shift-mask fold narrowing source` 43 → 0 and `shift-mask fold narrowing` 12 → 0 on tests/cases.
- **IR coverage:** a render call whose template hole the instance pins to a string or a literal atom is that hole's string, as a value or as a dropped statement. `template hole pinned` 32 → 0.

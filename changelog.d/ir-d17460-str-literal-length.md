## Codegen, memory & runtime (Track B)

- **The IR builds a string literal's `.length` (D17460):** `"ab".length` reads its interned literal and the header's byte count, as legacy does, so its function no longer falls back to legacy. Over `tests/cases`, 4 more functions are claimed and matched, including the last miss in `utf8-lenient.vl` and `utf8-bytes.vl`.

## Codegen, memory & runtime (Track B)

- IR coverage, `array null sentinel` (lane COV-IS, coordinator ruling (a)): a `null[]` list's IR elements are legacy's i32 storage. Its literal writes each `null` as the sentinel 2, and an unstamped `null` stored into one writes it too. Over the programs these classes held: tests/cases distinct functions claimed 36 → 46 of 58, witnesses 4 → 7 of 9.

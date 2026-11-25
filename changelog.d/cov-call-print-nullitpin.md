## Codegen, memory & runtime (Track B)

- **IR claims a `K | null` read narrowed out of a wider box:** `if v is i32 { … } else { print(v) }` over `i32 | K | null`, `K` a literal union, and the same read delivered to a `K | null` parameter. The read is taken at its storage and converted to the atom niche (`RNicheRead`, `NICHE_NUL_LIT`), as `emitNarrowedNicheRead` does. `print nulLitPin` falls from 19 rows to 0, and `pre-path nul atom niche` from 2 to 0. Legacy's bytes are identical across `tests/cases`, distilled, the probes, the witnesses and the self-compile.

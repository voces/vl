## Codegen, memory & runtime (Track B)

- **IR covers a field the checker narrowed to `null`, read for its effect (lane COV-UNION):** `o.f` under `else` of `o.f is boolean` reads the stored field, drops it, and is the `null` unit, as legacy writes it. An effect-free `null` side to the right of a name's null test is written ahead of the test (`member record` 3 → 0 function rows, `null name test of a non-name null side` 2 → 0).

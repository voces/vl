## Codegen, memory & runtime (Track B)

- **IR coverage, an `is` test on a boxed-nullable field:** `w.s is f64` where `s` is a nullable number held boxed is read at its storage and tested there, as legacy's `memStruct` arm does; the verifier's stored-read rule takes a boxed nullable as a box. Distilled corpus `start: is member storage rep` 24 → 0; covered = matched.

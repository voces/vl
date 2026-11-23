## Codegen, memory & runtime (Track B)

- **IR coverage, a field read off a receiver held at its storage row:** a receiver held at the row its record was built as (a binding wider than its own type, D14426) reads that row's field as legacy does — the field's own rep, a stored kid read at its storage, or the null member of a boxed nullable. Distilled corpus and tests/cases `field read of a stored row` 37 starts and 1 function → 0; covered = matched.

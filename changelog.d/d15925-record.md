## Type system (Track A)

- **D15925, the record half (clause 2):** a function whose tail is a value `if` or `match` of records holding un-annotated functions, called through its result, runs as the same arms returned do, where it was refused at emit with `cannot take the generic function … as a value`. The list spelling stays open, shared by `return if`.

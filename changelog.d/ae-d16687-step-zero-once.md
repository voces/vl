## Type system (Track A)

- **D4057 closed:** a literal `step 0` range is reported once, by the checker's `range-never-runs`, where `vl check` printed the same sentence twice. The lint's `for-step-zero` arm is deleted: its literal-`0` case was a strict subset of `checkRangeNeverRuns`, which also fires in unused and generic functions.

## Codegen, memory & runtime (Track B)

- **IR coverage: a `null`-typed field or method-call read.** A member or method-call read whose storage is the `null` unit is now built as legacy emits it: the read for its effects, dropped, then the null its destination names. `memberReadPlain` no longer refuses the inner read for being null-typed. On tests/cases, the class's 21 functions leave `pre-path null unit read` and `member record`; 17 more functions match over the class and a new neighbour case (10 of them start bodies), and no program loses one. Legacy's bytes don't change.

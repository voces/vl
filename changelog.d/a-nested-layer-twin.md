## Type system (Track A)

- **D16002 closed: two records holding one union through a nested layer share one canonical row (step 7).** `sRowsTwin`'s function-set comparison flattens nested union layers and compares members as a set, so `{u: ((i32 | string) | f64)[]}` and `{u: (i32 | string | f64)[]}` fold. The struct-row label table passes the canonical-key test: every `structIndexByName` lookup finds a row of the name's own type.

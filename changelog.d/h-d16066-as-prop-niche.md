## Type system (Track A)

- **A propagating `as` over a nullable record, list or map runs (D16066).** Inside a function
  whose return type admits `null`, `const p = x as P` over a `P | null` (or a `string[] | null`,
  or a `{[string]: i32} | null`) yields the value, and a null returns the function's own null.
  The O5-ruled sad path was previously lowered only for `string | null`. All five ref-niche
  payloads now share the string case's single block. `nulNicheHeapOf` names the heap type for
  each payload.

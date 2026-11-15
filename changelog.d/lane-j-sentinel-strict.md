## Type system (Track A)

- **`assignable` refuses a negative type, and the corpus oracle counts it:** `TY_OPEN` is now
  -3, apart from -1 (no type: a missing record, a poisoned annotation), so `assignableOrOpen`
  accepts only a component minted open. `assignable` answers `false` for any other negative type
  and bumps `asgNegCount`; the corpus oracle fails a case that compiles clean with a non-zero
  count. Two mints that spelled open as -1 (the hole-map demand's value, `litElemSrcTy` on an
  element with no record) now say what they mean. Behaviour unchanged on the corpus.

## Codegen, memory & runtime (Track B)

- **IR coverage, an empty list into a scalar list arm:** an empty `[]` into a union whose list arm holds scalars (`u8[] | B`) boxes under that list's atom tag, as legacy's value-atom rung writes it once the empty-list rung declines. Corpus and tests/cases `box ladder` 41 → 39 functions, 16 → 9 starts; covered = matched.

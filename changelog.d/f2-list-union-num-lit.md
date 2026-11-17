## Type system (Track A)

- **D4770 closed:** `.length`, an index read and `for … in` over a union of lists one of whose members holds a numeric literal union (`i32[] | K[]`, `K[] | string[]`, `K[] | f64[]` with `K = 0 | 1`) run, in the direct and pinned spellings, as the string literal-union twin already did. A write through the index keeps its refusal: the value would have to fit every member's element.

## Codegen, memory & runtime (Track B)

- **D16370 closed:** `is C` over an `A | null` value, where `C` has a field `A` lacks, tests the record and not only the null: `const a: A | null = { v: 3 }; a is C` is false, a narrowed `a.s` read no longer refuses at emit, and a `C` handed to an `A | null` parameter still tests true. Filed beside it: D16377 (the same function called with a `C` and with `null` refuses at emit) and D16378 (`4294967296 >> 65535` passes the checker, which E6.2 refuses).

## Type system (Track A)

- **D16326 closed:** `x is 1 | "a"` over `i32 | string` answered `false` for `1`; a literal set over two kinds now tests one kind at a time, through `is`, a negation, narrowing, an open parameter and a record field (**D4086 closed**). **D16327 closed:** a set holding `null` tests over a nullable scalar. **D16328 closed:** `as?`/`as!` to a literal set the operand may hold.

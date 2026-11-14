## Type system (Track A)

- **D16152 closed:** two recursive record aliases spelled with `| null` that name each other (`type A = { v: i32, b: B } | null` beside `type B = { w: i32, a: A } | null`), in either order and generic, build and run; a recursive annotation's canonical rewrite now banks its own type rather than a parse of its render, so each record has one struct row.

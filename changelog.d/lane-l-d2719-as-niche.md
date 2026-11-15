## Codegen, memory & runtime (Track B)

- **D2719, D4031 closed:** `as?`/`as!` over a `T | null` parameter is lowered at the instance's own type, so `size<Set<i32>>(s)` with `const w = u as? Set<i32>` runs where it was an emit reject (`needs a BOXED union operand or a nullable-REF one`); so do a list and a record pin, and `x as! T` over `T | null` (D4031). A pin the target can never fit is still refused (D16323).

## Type system (Track A)

- **D16323 closed:** `u as? X` over a `T | null` parameter, pinned where no member can be `X` (`size<string>` with `u as? Set<i32>`), misses there, as a type parameter pinned at no number does (D2791), instead of being refused at the call: `as?` is `null`, `as!` traps, and a bare `as` propagates the operand; the direct spelling's refusal (E8.6) and D2906's numeric-member refusal stay.

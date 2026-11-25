## Type system (Track A)

- **Fixed D17446** (clause 1, silently wrong): a generic's join of a written union holding a type parameter and a concrete member (`A | i32`) with a concrete type that member does not take (`string`) dropped that type, since the parameter takes anything inside the body. `G<i32>(5, false).x` of `if b { return { x: v } } return { x: "s" }` printed `0` and tested `is string` false; the list spelling built invalid wasm. The join now keeps the type apart, bare and in a same-field record field or list element, so each pin reads `i32 | string`.

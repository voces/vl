## Type system (Track A)

- **D17667 closed:** an un-annotated function whose guarded return calls a value typed `null` at its instance takes the type its live returns agree on, instead of a default `i32` (an invalid module at an `f64` or string result, `1` printed for `true` at a boolean one); the IR writes the never call with no dead widening after it, so `returned trap widened` and `never arm widened` are gone.

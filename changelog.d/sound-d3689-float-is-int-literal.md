## Type system (Track A)

- **D3689, D3703 closed (ruled):** `is` is a type test first. An integer literal pattern on a subject with an integer arm, such as `i32 | f64` or `1 | 2 | f64`, tests that arm. A subject with a float member and no integer arm (`f64`, `f32`, `f64 | string`, `f64 | null`) compares by value, with the literal converted to the float. So `1.0 is 1` is true and `-0.0 is 0` is true, and the subject stays a float in the tested branch.
- **D16703 and D16704 closed:** these were found under that ruling. Narrowing an `f64` to an integer literal built an invalid module, and a boxed or `f32` receiver answered `false` for an equal value.

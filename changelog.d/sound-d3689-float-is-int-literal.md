## Type system (Track A)

- **D3689, D3703 closed (ruled: compare by value):** a float tested against an integer literal compares by value, with the literal converted to the float. So `1.0 is 1` is true and `-0.0 is 0` is true, and the operand stays a float in the tested branch. This covers `f64` and `f32` receivers, literal unions, `i64`-range literals, boxed receivers (`f64 | string`, `f64 | null`, `i32 | f64`) and hole parameters.
- **D16703 and D16704 closed:** these were found under that ruling. Narrowing an `f64` to an integer literal built an invalid module, and a boxed or `f32` receiver answered `false` for an equal value.

## Type system (Track A)

- **D16075 closed (clause 2):** a lambda returning a generic function where a written function type closes its result (`const m: () => (x: i32) => i32 = () => inc`, or a typed parameter) runs, the generic built at that result (was "cannot take the generic function `inc` as a value").

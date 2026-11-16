## Type system (Track A)

- **D16799's generic spelling runs:** a generic maker returning a lambda over its parameter (`function adder<T>(n: T) { return (a) => a + n }`), called at an `i32` and an `f64` argument, now builds each binding's lambda at its own instance instead of being refused at emit. Two residues are filed: the wider pin called first, or the lambda bound to a local before it is returned (D16815), and a maker's result handed to an un-annotated parameter (D16816).

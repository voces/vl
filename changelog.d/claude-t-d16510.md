## Codegen, memory & runtime (Track B)

- **D16510 closed:** an empty list handed to an un-annotated callback (`function empty(h) { return h(3, []) }`, called with an `f64[]` and a `string[]` callback) is now built, in each instance, at the parameter type that instance's callback reads. This also covers a `{ ys: [] }` record argument and lambda callbacks. Before, the second instance built the first one's list and the module was invalid. Filed D16601 (`[[]]`), D16602 (`Map()`) and D16603 (a `const xs = []` argument).

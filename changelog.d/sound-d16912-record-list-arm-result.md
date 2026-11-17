## Type system (Track A)

- **D16912 closed:** an un-annotated lambda that returns a list literal at a list result whose element union holds a list-of-records arm takes that result, as its annotated twin does. For example, `const v: () => ({a: i32}[] | f64)[] = () => [1.5]` was refused at check.

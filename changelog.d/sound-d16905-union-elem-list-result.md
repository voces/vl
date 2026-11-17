## Type system (Track A)

- **D16905 closed:** an un-annotated lambda that returns a list literal at a list result whose element union holds a function arm or a list-of-records arm takes that result, as its annotated twin does. For example, `const v: () => ((() => i32) | boolean)[] = () => [false]` was refused at check.

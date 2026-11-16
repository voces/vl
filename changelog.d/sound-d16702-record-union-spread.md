## Codegen, memory & runtime (Track B)

- **D16702 closed:** a list literal of records spread inside a list literal of a record union now runs, such as `const u: (string | {n: i32})[] = [...[{ n: 1 }]]`. Before, it built a module that failed to validate.

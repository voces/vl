## Codegen, memory & runtime (Track B)

- **D16434 closed:** a hole lambda bound to a `const` and returned from a function whose inferred
  result closes is built at that result, as an annotated result's is. `wrap(f: (n: i32) => i32)`
  returning `const l = (x) => f(x)` trapped when its result was called, and now prints `6`.

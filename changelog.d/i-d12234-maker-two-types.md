## Codegen, memory & runtime (Track B)

- **D12234 closed:** a function returning a hole lambda (a maker), named or a `const`-bound lambda, with or without annotated parameters, may be delivered at two or more function types: each call builds its own closure at the type its result is delivered at. It used to refuse with "returns one function value and its calls deliver it at two function types".

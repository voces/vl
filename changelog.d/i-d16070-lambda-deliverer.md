## Codegen, memory & runtime (Track B)

- **D16070 closed:** a `const`-bound lambda that returns one hole lambda delivered at two function types is now refused, naming the binding, as its named twin is. It used to pass check and trap with `indirect call type mismatch`. The un-annotated spelling's refusal is filed as D16072.

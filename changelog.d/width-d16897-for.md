## Codegen, memory & runtime (Track B)

- **D16897 closed (step 2b):** a `for` over a union of lists read through an un-annotated parameter now runs. Each pin binds the loop variable at the element union and the pair index at `i32`, without rewriting the shared body. The instance walks whichever list arm the box holds: it reads the length per arm, reads each element per arm, and boxes the element into the element union. A record element keeps its refusal (D16930).

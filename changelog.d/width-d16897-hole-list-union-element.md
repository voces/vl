## Codegen, memory & runtime (Track B)

- **D16897, step 2a:** an element of a union of lists read through an un-annotated parameter now runs. Each pin types the read at the element union without rewriting the shared body. The instance reads whichever list arm the box holds under a scoped read override, and boxes the element into the element union. `for` stays open.

## Codegen, memory & runtime (Track B)

- **D16897, step 2a; D3368 closed:** an element of a union of lists read through an un-annotated parameter, or a generic's join, now runs. Each pin types the read at the element union without rewriting the shared body. The instance reads whichever list arm the box holds under a scoped read override, and boxes the element into the element union. A join of lists apart only by `null` keeps its refusal (D3367), as does an element union holding a record, filed as D16930. `for` stays open.

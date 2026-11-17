## Codegen, memory & runtime (Track B)

- **D16897, step 1:** `.length` of a union of lists read through an un-annotated parameter or lambda now runs. Each pin types the read without rewriting the shared body, and the instance reads the length out of whichever list arm the box holds. Element reads and `for` stay open.

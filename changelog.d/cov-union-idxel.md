## Codegen, memory & runtime (Track B)

- **IR reads a list element that is a map at a twin map's rep (lane COV-UNION):** the element is read as stored, then retagged, as a record twin already was. The two maps' values must be stored alike (`mapRetag`) or differ only in a closure's openness. Before, the IR refused (`index element coercion`).

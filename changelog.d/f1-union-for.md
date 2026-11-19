## Codegen, memory & runtime (Track B)

- **Union `for` at a pin, per arm:** a `for` over a union of lists or of maps handed to an un-annotated parameter tests the arm once and walks that arm in its own loop. The per-iteration tag chains are gone. A union of maps now walks `for k in v` and `for k, x in v`, the value boxed into the value union. A walk nested in a walk of the same binding takes the known arm alone, so same-receiver nesting is linear in its depth.

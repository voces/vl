## Codegen, memory & runtime (Track B)

- **IR builder:** a coalesce of nullable records into an annotated union is boxed at the union its destination holds, and an `is` over a list element tests the element's box; D17663 filed.

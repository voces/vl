## Codegen, memory & runtime (Track B)

- **IR builder:** an `is` over a record field holding a `U | null` box is tested at its storage, and a nullable record wider than a union arm is boxed under that arm, so four more programs build whole on the IR.

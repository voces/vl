## Codegen, memory & runtime (Track B)

- **IR builder:** an `is` against a literal set whose receiver is a list element or map value read once per member builds on the IR, the receiver held in a local; the lowering declares a nullable reference local.

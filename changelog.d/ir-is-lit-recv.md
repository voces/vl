## Codegen, memory & runtime (Track B)

- **IR coverage: a literal `is` test over a list element, a field or a global.** The receiver legacy writes once per member is read again as the builder read it (`litRecv`, `opndAgain`).

## Codegen, memory & runtime (Track B)

- **IR coverage: `xs.map(f)` and `xs.filter(f)` by a function literal that captures.** `RMapFilter` gains the callback's captures (`hfEnv`), read where legacy's closure writer reads them. The lowering builds the closure inline after the receiver's store, as `RMakeClo` writes it, so legacy's order holds.

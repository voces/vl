## Codegen, memory & runtime (Track B)

- **IR: a shared field read off a module global union is built (`shared read global receiver`).** Legacy's unstashed shared read (`emitMemSharedRead`) pushes the receiver's box once per arm, and for a module global that push is the global's read (`emitUnionBoxPush`). `RSharedRead` now carries the global (`srGlobal`), and the lowering reads it once per arm with the same recover, so a start body's `r.tag` over `const r: A | B` is the IR's. Legacy bytes are unchanged.

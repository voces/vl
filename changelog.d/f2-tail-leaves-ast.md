## Self-hosting & modules (Track H)

- **`tailValueLeaves` moved to `ast.vl`:** the value-tail walk and its three arm helpers are a pure AST walk, so they live in the parse phase; the emitter imports one fewer checker symbol (phase-state surface `emit_mono` 220 → 219, `elab_stub` 5 → 4). Codegen-identical.

## Self-hosting & modules (Track H)

- **35 groups of cloned function bodies folded to one definition each** (net −274 compiler lines, seed −4,525 bytes). Generic list and string helpers now live in `listutil`. The deduplicated compiler compiles master's compiler byte-identically. Clones in `emit_mono`, `emit_elab`, `emit_rep` and `check_types` are held for the lanes that own those files.

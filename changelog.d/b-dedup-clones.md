## Self-hosting & modules (Track H)

- **39 groups of cloned function bodies folded to one definition each** (net −312 compiler lines, seed −5,443 bytes). Generic list and string helpers now live in `listutil`. The deduplicated compiler compiles master's compiler byte-identically. Clones in `emit_mono`, `emit_elab`, `emit_rep` and `check_types` are held for the lanes that own those files.

## Codegen, memory & runtime (Track B)

- **Inventory: D17049**, the IR verifier's queries into legacy emit and checker-emit helpers (30 imports from 10 modules, in 12 verifier functions). Each is I8 debt, to be retired by the builder recording the fact on the IR, as `irGlobalNote` does for a global's rep.

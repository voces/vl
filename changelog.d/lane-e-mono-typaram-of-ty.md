## Self-hosting & modules (Track H)

- **Step 7 L2:** a generic's bare `T` / `T[]` parameter is found from its recorded type (`monoTyParamOfTy`), not its spelling; `monoTyParamOf`'s `[]` parse is gone (render-parse 40 → 39 parses), and emit_mono's private twin is folded into it.

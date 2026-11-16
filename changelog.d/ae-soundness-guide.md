## Type system (Track A)

- **`docs/guide/soundness.md` re-checked (ROADMAP Next item 10):** the stale "a `Cat[]` into an `Animal[]` parameter emits invalid wasm" corner now says the read runs and the write is a loud clause-2 refusal; a clause-1 / clause-2 section is added; the runner's strictness, the `_` hole-render examples and six fixture paths are corrected. Every example was re-run by hand. Files D16687 (a literal `step 0` is reported twice).

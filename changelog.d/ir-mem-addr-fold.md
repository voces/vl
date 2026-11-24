## Codegen, memory & runtime (Track B)

- **IR coverage: the declaration-time memory address fold, byte-identical to legacy.** A local `const p = K + bounded` used as a memory address now builds in the IR as legacy writes it: the bounded part teed into the scratch local legacy's frame reserves for it, and each scalar, atomic or SIMD access through `p` reading that local at offset `K`. The IR derives the fold rows itself, so the optimisation survives a shipped claim. All 15 `memory address fold` functions on tests/cases match; legacy's bytes don't change.

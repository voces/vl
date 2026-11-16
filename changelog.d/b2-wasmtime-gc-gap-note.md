## Infrastructure (Track F)

- **Measured: `vl run` (wasmtime 49) against V8 on the same `-O3` module.** At parity on scalar arithmetic, and 1.2×–2.8× slower on GC array and struct reads, across ten `bench/` fixtures. No host `Config` setting moves it. The cost is Cranelift reloading the array length and re-checking that the object fits the GC heap on every access (`refactor-notes/2026-11-16-wasmtime-gc-array-gap.md`).

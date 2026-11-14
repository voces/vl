## Infrastructure (Track F)

- **Stale "soft no-op" comments corrected:** three test comments still said `-O3` without `wasm-opt` prints a note and exits 0; it fails with exit 1 and leaves no module (`selfhost_native_release_test.ts` pins it). `vl run -O` stays inert by design: it writes no artifact.

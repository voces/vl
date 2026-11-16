## Tooling

- **`scripts/late-demands.vl` measures the checkout's seed by default:** without `--seed` it now reads `build/vl-compiler.wasm`, and says so when it has to fall back to the host's embedded seed, which gave a false rise when run by hand.

## Infrastructure (Track F)

- **`scripts/fn-coverage.ts`:** an exact per-function coverage instrument for the compiler (binaryen `--log-execution` on a `--names` seed, `compileSrc` over a corpus); it lists the functions a population never runs.

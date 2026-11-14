## Infrastructure (Track F)

- **`check-filed-witnesses` refuses a stray `$VL_COMPILER_WASM`:** set to a seed other than
  `build/vl-compiler.wasm`, it exits 2 instead of silently grading `build/`'s seed.

## Codegen, memory & runtime (Track B)

- **IR step I1a:** the IR lowers I1's constructs back to wasm, and under `VL_IR_SHADOW` each
  covered function's lowering is compared with legacy's code entry and statement spans. 1,499 of
  the self-compile's 1,501 covered functions match byte for byte. Nothing is claimed, so no
  emitted byte moves.

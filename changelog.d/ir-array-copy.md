## Codegen, memory & runtime (Track B)

- **IR coverage, `__array_copy__`:** an `__array_copy__(dst, dstAt, src, srcAt, count)` statement
  builds through the IR as a list copy over its five operands, written by the backing reads and copy
  tail legacy also writes, on legacy's own plan (`arrCopyPlanOf`) and routing (`arrCopyCallNamed`).
  No emitted byte moves.

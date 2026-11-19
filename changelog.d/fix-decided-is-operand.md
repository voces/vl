## Codegen, memory & runtime (Track B)

- An instance's `is` test that can never match a niche-held `T | null` (`mk(x) is i32` at
  `T = string`) still runs its operand for its effects before answering `false` (D17021).

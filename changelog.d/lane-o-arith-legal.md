## Infrastructure (Track F)

- **The arithmetic fuzz generator no longer emits what the design refuses.** Each subexpression
  that reads no variable is run in the oracle, at its type, before it is kept.
  - The share `vl check` refuses falls from 59% to 4%, and real tests from 771 to 1,793 per
    2,000 cases. The ceiling falls from 62% to 6%.
- **The oracle refuses what E6.2 and D2.3 refuse:**
  - a constant shift count that is negative or out of range;
  - a constant integer zero divisor.
- **The oracle fixes nine width and join readings** that the new programs reached (refactor note).
- **Three compiler rows**, all `vl check` rc 0:
  - D16496: a nested literal join builds invalid wasm.
  - D16497: a float join in `min` or in a constant tree does not adopt `f32`.
  - D16498: a radix `/ % << >>` arm is computed at 32 bits in an `i64` join.

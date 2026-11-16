## Codegen, memory & runtime (Track B)

- **IR N2b-1, atom compare:** `k == "a"` and `k1 != k2` over a literal-union atom go through one
  shared decision (`atomEqPlanOf`) and legacy's own static-literal writer and compare tail. The IR
  builds the literal-beside-atom and two-atom arms, with `!=` as `eq` then `eqz` exactly as legacy
  writes it. The IR covers 337 more corpus functions, every one matched. No emitted byte moves.

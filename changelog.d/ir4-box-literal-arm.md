## Codegen, memory & runtime (Track B)

- **IR coverage: an object literal boxed as another variant arm.** A literal that the box plan
  boxes as a union arm whose row is not the literal's own layout is now built at that arm's row,
  as legacy's `emitVariantStruct` builds it. Self-compile covered goes 18,844 → 18,869, and
  `box literal arm` misses go 22 → 0. No emitted byte moves.

## Codegen, memory & runtime (Track B)

- **IR shadow: reference values and plain list reads** (L1 I2, list half): a `str` or a list of
  unpacked primitives may be an IR variable, parameter or result, and an element read on legacy's
  plain guarded path builds a fused `SBoundsCheck` + `RListGet` that lowers to legacy's own guard;
  verifier rule 8 pairs them. Shadow only, nothing claimed. Self-compile coverage 1,508 → 1,824 functions
  (1,822 matched, no new mismatch); output byte-identical.

## Infrastructure (Track F)

- **Byte identity is not a gate (coordinator ruling, 2026-11-26):** `tests/vl_ir_shadow_test.ts` no longer reds a row file whose claimed bytes differ from legacy's, and no longer needs the divergence listing for it. A spans, order or verifier row still reds. The full gate's `ir claim refusals` runs `ir-parity.vl --behaviour-only`. Behaviour parity (`ci-ir-identity`, ready-check's sweep) is the check, and the shadow seam's byte count stays as an informational row.

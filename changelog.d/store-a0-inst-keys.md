## Infrastructure (Track F)

- **Instance-key shadow (STORE A0):** `$VL_INST_KEYS=1` prints, per compile, how the check's per-call bindings close to instances by substitution against the keys the elaboration minted: equal, check-only, elab-only (each with why) and open calls per reason. Nothing reads it; with the variable unset the output is byte-identical. The design note is `docs/internals/refactor-notes/2026-11-16-store-inst-key-design.md`.

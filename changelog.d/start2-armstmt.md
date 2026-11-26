## Codegen, memory & runtime (Track B)

- **IR claims a shared field write whose per-arm value needs its own conversion:** each arm's value, built as temps (an atom remap, a nullable widen), is written by the lowering at its read inside the arm, as legacy writes it. `field store shared arm value` falls 2 → 0: `unions/shared-litunion-field-write.vl` (`g`) and `soundness/union-shared-record-field-runs.vl` (`@start`) are fully claimed. Claimed and claims-off builds are byte-identical.

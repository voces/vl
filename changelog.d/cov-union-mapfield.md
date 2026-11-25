## Codegen, memory & runtime (Track B)

- **IR covers `m[k]?.f ?? d` (lane COV-UNION):** the fused map read of a record field under `??` is a new `SCoalBox` arm `optMapField`; legacy's plan and hit read are shared (`optMapFieldPlanOf`, `optMapFieldHit`), so both write the same probe, field read and default.

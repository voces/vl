## Codegen, memory & runtime (Track B)

- **IR G1, the pre-path guard's follow-up:** the builder's dead-`never` check asks legacy's own
  `exprReadsDeadNever` rather than a local approximation, so the two cannot drift
  (+0.05% L2 fuel), and `scripts/ir-identity.sh` and `scripts/ir-driver-census.sh` default
  `$VL` to the checkout's own host.

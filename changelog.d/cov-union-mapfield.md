## Codegen, memory & runtime (Track B)

- **IR covers `m[k]?.f ?? d` and a call's `K | null` joined into a box under `??` (lane COV-UNION):** two new `SCoalBox` arms, `optMapField` and `nulAtomJoin`; each shares legacy's plan and tails (`optMapFieldPlanOf`/`optMapFieldHit`, `coalNulAtomJoinOpen`/`coalNulAtomJoinPresent`), so both paths write the same bytes.

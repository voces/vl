## Codegen, memory & runtime (Track B)

- **IR claims a `null`-typed compare with an assignment of `null` on a side:** `(s = null) == n()` takes legacy's null-pair route (`nulNoneEqRoute`). Each side runs for its effect, left then right, and the compare answers its constant. `operand at null` falls 3 → 0: `soundness/null-pair-compare-assignment-side.vl` (`f`, `@start`) and D17423's witness are fully claimed. Claimed and claims-off builds are byte-identical.

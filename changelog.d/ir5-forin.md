## Codegen, memory & runtime (Track B)

- **IR: `break` and `continue` out of a `for` walk.** The walk carries its break and continue labels, which the lowering places on the frames legacy's loop opens; the builder no longer misses `for in break` or `for in continue`.

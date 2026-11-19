## Codegen, memory & runtime (Track B)

- **IR: call arguments delivered at their parameter's rep.** An atom passed to a `K | null` parameter, a `null` literal, a numeric widen or an atom decoded to a string go through the builder's `deliver`, as a returned or declared value does; the call no longer misses `argument coercion` on them.

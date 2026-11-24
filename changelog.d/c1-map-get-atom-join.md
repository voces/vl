## Codegen, memory & runtime (Track B)

- IR coverage, map get (lane IR-C1): a `K | null` atom-valued map read narrowed past its null (`if m[k] != null { … m[k] … }`, and the `m[k] ?? d` join into another type) is the bare atom, the bits legacy's helper returns. It is byte-identical across call arguments, concat, interpolation, return, `let`, `if` arm, `??` and record field, annotated or not.

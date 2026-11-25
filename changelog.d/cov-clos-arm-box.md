## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-CLOS): when the IR writes a declaration `if` per arm into a boxed binding, it now boxes an arm value the checker recorded no box for, at the binding's union, the way legacy's `emitUnionBoxOwed` does (`armBoxDeliver`, gated by legacy's `boxOwedAt`). This covers both the plain per-arm path and the binding sink. A typical case is the narrowed arm of a desugared `const r = t ?? d`. No checker fact was added (coordinator ruling, 2026-11-25). The `declaration if per arm coercion` miss falls from 16 rows to 0.

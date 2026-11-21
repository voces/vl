## Codegen, memory & runtime (Track B)

- IR coverage: an un-annotated (hole) function stored in a record field is built by the IR at the field's instance closure rep, and a read of that field reads at the built record's kid (`holeCloTy`), as legacy calls each instance at its own signature (corpus `object field coercion` 61 → 3, +108 functions with no blocker).

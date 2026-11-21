## Codegen, memory & runtime (Track B)

- IR coverage: an explicit `null` record field whose null is a typed reference's `ref.null` is built by the IR (`RFieldNull`, lowered through legacy's `emitOmittedFieldNull`); a map field's null stays legacy's (corpus typed-null rows 31 → 0, self-compile +1 function with no blocker).

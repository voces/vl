## Codegen, memory & runtime (Track B)

- **IR: an object literal boxed into a union.** The shared box plan gains an `obj` arm: a literal with no variant of its own, built as the arm the union's context picks for it (`emitUnionCoerceRecord`'s literal rung, `unionArmVariantForObj`) and boxed under that arm's tag. Both emitters box through it.

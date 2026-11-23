## Codegen, memory & runtime (Track B)

- IR coverage, record literals (lane IR-M1). Four literal shapes are now built the way legacy builds them:
  - A struct literal that omits fields is built at its destination's row, with each omitted field set to its null.
  - A struct literal whose row drops an effectful field goes through legacy's stash, so the dropped initialiser still runs once, in source order (D1696). The new predicate is `objLitDropStashRowAt`.
  - At a union arm, a constant extra field is skipped, as `emitVariantStruct` skips it (D5342).
  - At a union arm, an effectful dropped field takes the same drop stash (`objLitVariantDropStashAt`).
- `object field count` falls to 0, and `object layout` falls 18 → 1 in function and start bodies.

## Codegen, memory & runtime (Track B)

- **IR coverage: a struct boxed as itself on its arm's variant heap.** A record type parameter pinned at a plain struct, boxed into a wider union inside its instance (`tag<T>(v: T)` with `i32 | string | T`), missed at `box ladder`. Legacy's `emitUnionCoerceRecord` boxes it as itself under the arm's tag. `structArmHeapOf` names that decision, and the plan and legacy both ask it.

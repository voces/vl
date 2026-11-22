## Codegen, memory & runtime (Track B)

- IR coverage: a captured union box (`i32 | null` and its kin) narrowed to a member inside the closure, or where the closure is written, reads on legacy's `unbox` arm: the capture at its own rep through #9572's capture-read path, then the box unboxed at the read's atom kind.

## Codegen, memory & runtime (Track B)

- **Filed D17035:** inside a generic, a tagged union whose type parameter sits only in the arm not built checks, but once the body reads the union, emit refuses it with an internal union-arm row check (clause 1).

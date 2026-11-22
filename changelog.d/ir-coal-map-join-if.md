## Codegen, memory & runtime (Track B)

- **IR coverage: a union-valued map's read, and a `??` over one.** `m[k]` over a map whose value is a union is the value's own box, a miss the null-tagged box, through legacy's shared tail (`mapGetUnionBoxTail`); a narrowed read unboxes to its member along `narrowedMapReadOf`, which legacy's narrowed-read tail now writes from; a binding of it banks no element-read row, as legacy's binding arm does. `m[k] ?? d` joining a union (`mapJoinIf`) is legacy's synthesized null-test `if`, built as the valued `if` it is.

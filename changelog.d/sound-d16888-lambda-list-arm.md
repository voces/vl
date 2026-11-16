## Type system (Track A)

- **D16888 closed:** an un-annotated lambda that returns a list literal into a union result whose list member has a union element runs, as its annotated twin does. For example, `const f: (i32) => (string | i32)[] | f64 = (q0) => ["r"]`. D16889 files the emitter's refusal of a parameter-fed closure with such a result, which is still open.

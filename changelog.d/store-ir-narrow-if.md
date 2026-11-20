## Codegen, memory & runtime (Track B)

- **IR: a valued `if` into an element store, and a narrowed `T[] | null` local:** `xs[i] = if …` (and its `&&`/`||` spellings) stages the receiver and index below the `if`, as calls do. A nullable list local narrowed past its null reads through `identListOverrideOf`, the list-override decision legacy now dispatches on. 32 more self-compile functions are built by the IR.

## Type system (Track A)

- **Step 7: a `.push` destination's kind is read off the element type.** `pushDestVKind` asks the element type's rep in place of decoding the ref-list element-kind table, keeping one storage rung: a variant element stored in a struct row is `struct`. Byte-identical over the sweep.

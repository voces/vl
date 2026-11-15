## Codegen, memory & runtime (Track B)

- **D16316 closed:** a list of only `null` in one record of a list literal whose sibling holds a list there stores the null of the field's element type, instead of the `boolean | null` sentinel, so the module validates.

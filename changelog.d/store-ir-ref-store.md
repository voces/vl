## Codegen, memory & runtime (Track B)

- **IR: an element store into a reference list:** `xs[i] = v` over a plain list of records, lists or maps builds in the IR, as legacy writes it for scalar and string lists: receiver, index, value, then `idxStoreTail`. Byte-identical; the self-compile claims 26 more functions, and its `store element` blocker goes from 34 functions alone to 6.

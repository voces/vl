## Codegen, memory & runtime (Track B)

- **An emit refusal says where the IR declined:** when legacy refuses a function or the top-level code whose IR claim declined, the diagnostic gains `note: the IR declined this statement (<class>) at line N`, naming the innermost statement the IR builder missed. The `@emit-error` oracles never match that line. Once legacy is deleted at I8, the same record anchors and explains the unclaimed refusal.

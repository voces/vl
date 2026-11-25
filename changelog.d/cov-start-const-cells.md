## Codegen, memory & runtime (Track B)

- IR coverage, constant cells (lane COV-START): the IR now writes three more shapes of constant initializer: a list literal its binding stores at a wider record's list, a flat record's packed `u8` field, and a union arm's omitted `boolean | null` or atom `| null` field. Programs whose const cell still falls back to legacy: 18 → 13 of 27,421.

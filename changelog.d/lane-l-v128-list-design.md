## Codegen, memory & runtime (Track B)

- **Design filed for a list of vectors** (`F32x4[]`): `docs/internals/v128-list-design.md` proposes a flat `v128list` kind, which closes D1981's array and map faces, and measures today's spellings (`{ v: F32x4 }[]` is within 30% of `Buf`; `(F32x4 | null)[]` costs 6× the CPU). D16483 files a `??` emit reject on a list of nullable vectors.

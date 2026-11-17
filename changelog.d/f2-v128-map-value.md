## Codegen, memory & runtime (Track B)

- **D16891 closed, and D1981's map face:** a map of vectors (`{[string]: F32x4}`, `{[i32]: v128}`) now compiles, its values held on a flat `v128` list. `set`, index writes, `get` (a miss is `null`), `??`, `has`, `delete`, `clear`, `for k, v in`, `.values()`, a map field, a nested map, an un-annotated `Map()` and a generic body's map at `T = F32x4` all run. A map whose value is a vector list (`{[string]: F32x4[]}`), `F32x4[][]` and `F32x4[] | null` are still refused at check, now in one sentence that names the vector list.

## Codegen, memory & runtime (Track B)

- **D16482 closed:** a binding annotated as a container of vectors (`const xs: F32x4[] = []`, `const m: {[string]: F32x4} = Map()`, `F32x4[] | null`), when its initializer is empty and nothing reads it, is now refused at check like every other vector array or map (D1981). Before, it passed `vl check` and built an invalid module or was refused at emit.

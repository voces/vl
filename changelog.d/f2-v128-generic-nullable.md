## Codegen, memory & runtime (Track B)

- **D2634 closed:** a generic body's `T | null`, `T | i32`, `Box<T>` field, `(T | null)[]` and `m.get(k) ?? d` run at `T = F32x4`/`v128`. The instances already lowered; the pin's refusal was stale and is deleted with its rule. D16945 files a getter read through an un-annotated parameter bound to a nullable vector, which passes check and is refused at emit.

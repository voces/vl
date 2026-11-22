## Codegen, memory & runtime (Track B)

- **IR coverage: a variant record returned at its nominal struct twin.** std:buffer's `i32view`/`f32view` with `std:fs` imported, or any record literal returned at a `new` twin of a record that is also a union arm, missed at `return coercion`. Legacy returns the same struct, since both rows are one heap. The return now retags it (`recRetag`, in the verifier's `RRetag` rule) where no coercion is recorded. 14 functions build.

## Codegen, memory & runtime (Track B)

- **IR: boolean and vector arguments of closure calls:** a call through a function value whose argument is a `boolean` (into an `i32` parameter) or a `v128` now builds in the IR. Byte-identical; armed `tests/cases` covers 61 more functions, all matching.

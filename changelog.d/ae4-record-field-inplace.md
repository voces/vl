## Codegen, memory & runtime (Track B)

- **D3679 closed (Aeomach AE-004, the record face):** at `-O`/`-O3` a record field replaced by a fresh record (`body.vel = vadd(body.vel, …)`) on a parent built by a global's initializer is written in place with `struct.set`s; the inline-record step now takes a constant expression's `struct.new` apart, so the AE-004 witness goes from 2 `struct.new` in `step` to 0.

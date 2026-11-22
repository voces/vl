## Codegen, memory & runtime (Track B)

- **IR coverage: a record list returned into a result whose type holds a hole.** `return [{ f: inc0 }]` from a function whose inferred result still names `inc0`'s type variable missed at `return coercion`. The value is built at its instance and the result's rep leaves the closure unknown, though legacy returns the same list. The return now retags it (`listRetagHole`, beside `listRetag`, in the verifier's `RRetag` rule). 27 corpus functions build.

## Codegen, memory & runtime (Track B)

- **D16486 closed:** an assignment to a vector field reached through a list element or a nested record, used as a value (`const w = (rs[0].v = splatF32(3.0))`, `(h.r.v = …).x`, `(rs[0].v += u).x`), yields the vector written instead of being refused at emit.

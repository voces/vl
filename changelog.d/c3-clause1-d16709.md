## Codegen, memory & runtime (Track B)

- **D16709 closed:** a parameter narrowed off one map of a two-map union (un-annotated or generic) is read as that map at a method receiver, so `v.get(1)` builds a valid module. A binding narrowed to a map arm whose storage is the union box now unboxes at the read with no further gate.

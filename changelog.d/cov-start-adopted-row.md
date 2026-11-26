## Codegen, memory & runtime (Track B)

- Records: a record holding an un-annotated function, stored in an un-annotated map and returned by an un-annotated reader (`function get() { return m["b"] }`), is read at the row the map built it at; `get()?.f(4)` refused as `ref valtype with no interned shape` before (D17180).

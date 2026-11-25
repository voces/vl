## Codegen, memory & runtime (Track B)

- D17581 closed (lane COV-CLOS): a read of an un-annotated `Map()` holding a hole function, delivered at an annotated function type (`const g: ((a: i32) => i32) | null = m["k"]`, or the same read passed to such a parameter or read through `.get`), now runs. Before, `vl check` accepted it and emit refused it with "a function slot pinned at one signature has no one closed type". The monomorphizer's stored-slot lookup now reads a delivery at `F | null`, the map miss's nullable, as `F`.

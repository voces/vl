## Codegen, memory & runtime (Track B)

- **D2467 closed:** `m[k] as? V` on a map of scalars, such as `m["zz"] as? i32`, runs: the read's value on a hit and `null` on a miss. It works for every scalar width, booleans included, and in generic code. Before, emit refused the cast after `vl check` had passed it.

## Codegen, memory & runtime (Track B)

- **IR design note, global storage vs binding rep (D14426 family 2):** measures the 116-function binding-vs-storage split of module globals and the single-source experiment that shows neither type alone is the rep; recommends the storage rep for the cell with reads taking legacy's rep carrier. No code change.

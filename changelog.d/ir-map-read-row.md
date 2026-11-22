## Codegen, memory & runtime (Track B)

- **IR: a union map read passed into a union box.** Legacy's box ladder writes the read itself, past `emitExpr`, so it banks no element-read row; the IR now asks the same answer (`unionBoxArgReadsMapBox`) and builds the read without one. The temporary `map read row after a union store` miss is gone.

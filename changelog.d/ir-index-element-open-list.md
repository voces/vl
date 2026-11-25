## Codegen, memory & runtime (Track B)

- IR coverage, index element coercion A1: a ref list's element read at an open type whose rep names no valtype is read as stored (`array.get`), so those functions are claimed byte-identical instead of declined.

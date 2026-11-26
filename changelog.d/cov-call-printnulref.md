## Codegen, memory & runtime (Track B)

- **IR prints a nullable reference narrowed to `null`:** `print(r)`, where `r` is a nullable record, list, map or closure the narrowing leaves only `null`, prints the word `null` after a null test (`nulRefNiche`, D3498). The IR missed it (`print nulRefNiche`). It now builds the operand, reading a name at its storage as legacy does, and lowers legacy's null-test tail, which the two emitters now share (`printNulRefNicheTail`).

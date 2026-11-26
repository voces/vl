## Codegen, memory & runtime (Track B)

- **IR builds a captured null hole's read before its fill:** a callback reading a captured `let x = null` before the write that fills it reads the shared cell, narrowed to `null`. Legacy delivers the destination's own null there (`emitNullReadAtDst`, D15951). The IR missed it (`index cell null`). It now takes that cell read through the same rule as a name read narrowed to `null` (`nullReadOwnAt`), as an `RNullOf` at the destination, and banks the read's element-read row over the null, as legacy does.

## Codegen, memory & runtime (Track B)

- **IR claims a literal operand at its operator's wider width:** `(-3) >>> (40 + 1)` (D16318) and any number literal beside an operand of another width is built at the operator's width, as legacy's `emitNumLitAs` writes it. `widen literal` falls 2 → 0 on its programs.

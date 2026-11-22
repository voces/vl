## Codegen, memory & runtime (Track B)

- **IR coverage: a niche cell's `??` over a list element or a global.** `o[i] ?? false` and `g ?? true`, whose present arm legacy re-emits, re-read the operand as the builder built it: a list read over a variable and an immediate or variable index is recorded (`irReadElem`) and written again, its element-read row banked as legacy banks its second read.

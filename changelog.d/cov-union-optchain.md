## Codegen, memory & runtime (Track B)

- **IR covers `a?.b?.v ?? d` over a union box field at the end of a chain (lane COV-UNION):** the `??` builds the chain's root and the lowering walks its links with the standalone `?.` read's walkers (`emitOptChainIsNull`, `emitOptChainValue`), as `emitOptCoalesceBoxLeaf` writes it.

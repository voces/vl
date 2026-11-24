## Codegen, memory & runtime (Track B)

- **IR: a union `==` against a `K | null` literal-union operand that is a parameter, record field or global builds in the IR**: the operand's id is tested for `null` on legacy's leg 1, then decoded to its member string in the plain arm (`unionEqAtomOperandTail`), as `emitUnionEqOther` writes it. Distilled corpus `union compare plan`: 26 cells → 0 (the D17065 atom grid); tests/cases `atomNoNull` builds.

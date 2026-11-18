## Codegen, memory & runtime (Track B)

- **The IR claims list `==`/`!=` (`RListEq`):** legacy's two list-compare arms are one operand sequence with two cores (`listEqOperandTail`, `listEqTail`), and the IR lowers through the same tails where `listEqRouteOf` says legacy routes there; 25 more corpus functions are emitted by the IR.

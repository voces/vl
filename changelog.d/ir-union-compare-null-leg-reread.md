## Codegen, memory & runtime (Track B)

- **IR: a union `==` on a `string | null` or `boolean | null` operand's null leg builds in the IR when the operand is a record field or a global**: the leg's null test reads it, and the plain arm reads it again as legacy re-emits it (`opndAgain`). Distilled corpus `union compare operand`: 12 cells → 0 (the D17065 operand grid's field and global cells).

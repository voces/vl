## Codegen, memory & runtime (Track B)

- **IR coverage: a closure boxed into a union under its closure arm's tag.** A closure delivered into a union box was the box plan's ladder. It is now the plan's `clo` arm: the closure arm's tag (`cloArmBoxHead`), the closure, `struct.new`. Legacy's `emitUnionCoerceList` closure rung writes through the same head.

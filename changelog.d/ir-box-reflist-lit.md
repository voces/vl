## Codegen, memory & runtime (Track B)

- **IR coverage: a list literal boxed at its checked ref-list arm.** `leaf([2.5])` or `viaArg([[2.5]])` where a recursive `Json` is expected missed at `box ladder`. Legacy writes the literal as the union's list arm, its checked type, under that arm's tag. The box plan now names that rung's `refList` arm (`arrLitArmSlotOf`) at legacy's position among the list rungs.

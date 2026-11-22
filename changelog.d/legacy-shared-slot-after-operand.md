## Codegen, memory & runtime (Track B)

- **Legacy emit, local order:** a union `print`, a shared field read's stash and a `scalar | null` box field's `??` take their shared stash slot after writing the operand they stash, not before, so an operand that mints locals declares them first, as the IR lowers it. Only local declaration order moves; run outputs are unchanged.

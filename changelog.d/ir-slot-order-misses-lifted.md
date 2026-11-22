## Codegen, memory & runtime (Track B)

- **IR coverage, slot order:** with legacy taking its shared stash slot after the operand (#9599), the IR builds a union `print` of a fused `??` map read and a `??` join reached past optional chains, two misses that existed only for local declaration order.

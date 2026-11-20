## Codegen, memory & runtime (Track B)

- **IR coverage:** a fused `xs.pop() ?? d` over a scalar list is built by the IR through legacy's shared length test and pop, its default only on the empty path (self-compile: 54 more functions covered).

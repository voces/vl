## Codegen, memory & runtime (Track B)

- **A failing list-index guard traps by reading index 0 of the module's shared empty backing** in a plain build, in place of reloading the backing and reading it at `-1`. The trap and its position are unchanged, and `-O` keeps its own trap. The self-hosted compiler's seed is 1.6% smaller (6,401,304 → 6,299,277 bytes).

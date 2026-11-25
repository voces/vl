## Codegen, memory & runtime (Track B)

- **IR coverage: a led box over a value holding a staged `??`:** a value boxed into a nullable whose own nodes hold valued `if`s or a `??` that stages its leads below an earlier operand (`cpu = 1.0 + (parseF64(s) ?? 0.0)` into `f64 | null`) has its box head written ahead of the whole value (`irBoxLeadFirst`), as legacy writes it, where it missed on `box of a valued if`; `scripts/plumb-shape-cost.vl`'s `runTimed` is claimed. Byte-identical to legacy.

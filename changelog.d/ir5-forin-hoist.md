## Codegen, memory & runtime (Track B)

- **IR: the hoisted `for` walk, unrolled copies included.** A walk whose body cannot reallocate its list reads the header once and runs its body in unrolled copies; the copies are now halves both emitters call around their own body, and the IR lowers its body in each copy. The `loopHoistOpen`/`forInLoopOpen` re-entry is retired.

## Codegen, memory & runtime (Track B)

- **IR coverage, memory management:** `__memory_size__`, `__memory_grow__`, `__memory_fill__`,
  `__memory_copy__`, `__heap_base__`, `__heap_limit__` and `__memory_shared__` build through the IR
  as one `RMemOp`, written by the tail legacy also writes (`memOpTail`). Legacy's five arms for them
  are one, over one plan (`memOpPlanOf`). No emitted byte moves.

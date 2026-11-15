## Codegen, memory & runtime (Track B)

- **A map get or has probes through `__map_entry__` / `__map_entry_i32__`, which answer the slot's entry** in a plain build, so the site no longer reads the index after the probe. Set and delete keep the slot probe, and `-O` is unchanged. The self-hosted compiler's seed is 0.65% smaller, and self-compile CPU falls about 3%.

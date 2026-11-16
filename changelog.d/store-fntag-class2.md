## Type system (Track A)

- **One storage decider, partial sets:** the check no longer calls a function set partial because a different set reaches the same parameter at a different call (each is its own instance); only a lambda shares its calls. The late pass now changes the storage decision in 331 programs, down from 352. No program's output moves; two programs' wasm shrinks as a set that was a closure is now tagged.

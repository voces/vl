## Type system (Track A)

- **One storage decider, partial sets:** the check no longer calls a function set partial because a different set reaches the same parameter at a different call (each is its own instance); only a function read as a value shares its calls. The late pass now changes the storage decision in 341 programs, down from 352. No program's wasm or output moves.

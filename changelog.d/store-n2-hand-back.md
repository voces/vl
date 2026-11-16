## Type system (Track A)

- **One storage decider, hand-backs:** a function set that a hand-back call (`const p = fw(add)`) hands to a `const` is now decided at check, reading the check's own hand-back facts. The late re-decision changes the outcome in 276 programs, down from 290. No program's output or wasm moves.

## Codegen, memory & runtime (Track B)

- **IR coverage, `global read coercion` part 5:** a global holding a bundle record beside `null` (a map read) is read as its cell stores it for a null test, and narrowed to the record for a call through it, as legacy writes both. In tests/cases, `start uncovered global read coercion` 7 → 6; no legacy bytes moved. Filed D17094 (a module map of two-signature bundles read from a function is invalid wasm), found by the change's position sweep.

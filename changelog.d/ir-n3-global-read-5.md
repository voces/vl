## Codegen, memory & runtime (Track B)

- **IR coverage, `global read coercion` part 5:** a global holding a bundle record beside `null` (a map read) is read as its cell stores it for a null test, and narrowed to the record for a call through it, as legacy writes both. In tests/cases, starts naming `global read coercion` 5 → 4; no legacy bytes moved. The change's position sweep found D17094 (a claimed start skipping legacy's refusal of a module map of two-signature bundles read from a function, shipping invalid wasm).

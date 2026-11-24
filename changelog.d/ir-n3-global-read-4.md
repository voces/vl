## Codegen, memory & runtime (Track B)

- **IR coverage, `global read coercion` part 4:** a global holding a tagged set's id, delivered where the tag decision builds its member's closure, is read as its cell holds the id, which the coercion's tail replaces with that closure, as legacy writes it. In tests/cases, `start uncovered global read coercion` 6 → 5 and `node-in array: miss global read coercion` 4 → 2; no legacy bytes moved.

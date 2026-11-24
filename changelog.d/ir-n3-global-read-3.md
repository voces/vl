## Codegen, memory & runtime (Track B)

- **IR coverage, `global read coercion` part 3:** a null test of a union-box global the checker narrowed past one member reads the cell as it stores it and compares the box's tag, as legacy does (the nullable → nullable and box → nullable union-cell starts). In tests/cases, `start uncovered global read coercion` 9 → 6; no legacy bytes moved.

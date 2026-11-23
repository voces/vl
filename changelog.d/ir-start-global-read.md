## Codegen, memory & runtime (Track B)

- **IR coverage: a union-box global narrowed to a smaller union.** The read is the global's box, staged at the narrowed rep as a box local's read already is. Of tests/cases' 29 `start: global read coercion` start bodies on master e6cb8541, 6 are now covered and matched and 24 remain. Legacy's bytes don't change.

## Codegen, memory & runtime (Track B)

- **IR coverage, `??` over hole map reads joined into a union box:** each arm of the null-test `if` is boxed into the join's union. A map read of no union value takes the box plan's scalar, niche and atom rungs, as legacy's ladder does, and a `boolean | null` read boxes under the boolean atom.

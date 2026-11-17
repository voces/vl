## Codegen, memory & runtime (Track B)

- **A list of vector lists runs** (`F32x4[][]`, D1981's list-of-lists face): a ref list of flat `v128` list wrappers, with literals, `push`, index reads and writes through both levels, nested `for … in`, a parameter and `.map`. `F32x4[] | null` and a map whose value is a vector list are still refused at check.

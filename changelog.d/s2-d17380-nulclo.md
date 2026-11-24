## Codegen, memory & runtime (Track B)

- **D17380 closed:** a union box narrowed to a nullable closure or a nullable map (`F | null | string` to `F | null`) and copied out (an argument, a `const`, a `let`, a return, a global, a field or a capture) is now that nullable value; before, the box itself was written into the closure's or map's slot, building invalid wasm. A plain `F | null` holding `null` stored into another union now boxes as that union's `null`; before, `w == null` read `false` there. Neighbour filed: D17440.

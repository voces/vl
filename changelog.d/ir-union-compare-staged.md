## Codegen, memory & runtime (Track B)

- **IR: a union `==` whose operand has effects builds in the IR**, staged as legacy stages it (D17068): legacy's `emitUnionEqStaged` splits into shared open, park, close and tail pieces, and the IR writes them as effects around the two sides. D17068's 252-program grid: 168 programs with an uncovered union compare → 0.

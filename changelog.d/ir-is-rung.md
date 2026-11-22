## Codegen, memory & runtime (Track B)

- **IR coverage: `x is K` over a numeric literal union.** The membership compare legacy writes over the receiver's base scalar, the receiver once into a slot or once per member (`numIsPlanOf`), built as `RNumIs` and written by legacy's own tails (`numLitEqTail`, `numLitOnceStash`, `numLitOnceMember`).

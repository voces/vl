## Codegen, memory & runtime (Track B)

- **IR coverage: an order-stashed record literal boxed under its own arm.** Legacy writes the arm's tag before the literal, so the tag sits under its field sets. The IR set the fields first and missed at `box of a stash-set record`. The lowering now writes the box's head at the literal's first field set, or ahead of a valued `if` that is its first field (D17042, which failed to lower on master), and the box skips it. The self-compile gains its four functions.

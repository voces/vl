## Codegen, memory & runtime (Track B)

- **IR coverage: an order-stashed record literal boxed under its own arm.** Legacy writes the arm's tag before the literal, so the tag sits under its field sets. The IR set the fields first and missed at `box of a stash-set record`. The lowering now writes the box's head at the literal's first `RStashSet` and the box skips it. A literal whose first stashed field is a valued `if`'s value stays the named miss, since the builder writes that `if` ahead of the set. The self-compile gains three functions.

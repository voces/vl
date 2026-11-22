## Codegen, memory & runtime (Track B)

- **IR coverage: a valued `if` or `??` join boxed as itself.** `kind((q ?? (r ?? 5)))` boxes the inner chain's join into the union, and legacy writes the box's tag ahead of the chain. The IR built the chain first and missed at `box of a valued if`. Where a box's value is the out of the one join its delivery built, the lowering now writes the box's head ahead of that join (`stashIfBoxHead`), and the box skips its own. The `nj2_ch` grid (26 corpus cells) builds.

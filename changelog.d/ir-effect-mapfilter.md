## Codegen, memory & runtime (Track B)

- **IR coverage: a `.map` or `.filter` whose list is discarded.** As a statement, the IR now builds the list as the value form does and drops it, as legacy's statement does; before, the claimable function missed at `effect outside I1` and the armed shadow failed the claim. This closes the last two rows of `ir-shadow-cases-baseline.txt`. No legacy bytes moved.

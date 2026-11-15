## Type system (Track A)

- **D16475 closed:** a binding of the tested place's name in a block nested in a deep `is` arm (an expression's block, an `if` or `else` arm, a bare block, a `for r in …` loop) hides the place to the end of that block only, and the reads around it keep the converted copy. They were refused, by the deep-`is` rule or at the re-check. The arm substitution has no user-facing refusal left; a read in the right operand of the test's `&&` is filed as D16476.

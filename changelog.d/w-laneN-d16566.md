## Type system (Track A)

- **D16566 closed:** an un-annotated `let` accumulated from a `!= null`-narrowed read of an un-annotated parameter settles: the literal solve can now write a hole less `null` as the `let`'s annotation. Before, the round wrote nothing yet counted as progress, so the fixpoint never converged and the program was refused after the re-check budget. A literal round that writes no annotation now counts as no progress, and a pin it cannot write is refused at once.

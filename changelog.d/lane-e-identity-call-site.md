## Type system (Track A)

- **A generic body's `===` is refused at the call (DECISIONS A15):** `===` on a type parameter or an un-annotated parameter is an inferred constraint decided at each call and reported on the argument, like every operator, instead of at the operator inside the body.

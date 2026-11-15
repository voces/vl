## Type system (Track A)

- **D16414 closed:** a `const` with no annotation of a float constant tree is a constant, so each
  read folds at its own use type: read at `f32` it is the `f32` IEEE result, at `f64` the double.
  A `const` annotated `f64` stays one double value. The oracle folds a `const`'s reads the same
  way, and refuses an integer constant inexact at a float type and a finite constant past `f32`'s
  largest value, as the checker does. D16460 and D16461 filed.

## Codegen, memory & runtime (Track B)

- **IR coverage: a union box local narrowed to a smaller union.** Its read at the smaller union's
  box rep is the same box, written as a bare `local.get` as legacy writes it; the IR holds it as an
  `RStage` view at the new rep. No emitted byte moves.

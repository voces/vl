## Type system (Track A)

- **`tyHoldsLit` ends by a visited set, not a depth**: the literal test #8776 added for a
  nullable write ran a fixed-depth walk, which the walk-limit ratchet (#8767) refuses. No program
  moves.

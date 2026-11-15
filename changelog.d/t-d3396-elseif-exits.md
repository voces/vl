## Type system (Track A)

- **D3396 closed:** an `else if` link whose every arm exits (`return`, `break`, `continue`) hands no value to the chain's join, as its `else { if … }` spelling does, so `let w = if c { null } else if d { return } else { return }` types `w` at the arm that completes.

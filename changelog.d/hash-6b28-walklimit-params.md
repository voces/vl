## Infrastructure (Track F)

- **`walk-limit` counts a countdown floor only on a parameter:** a depth countdown's `<= 0`, `< 0` or
  `< 1` is a finding only when the counter is a parameter of the enclosing function, so a local holding
  a computed depth (`emitListEmptyFitIs`'s `listDisjointDepth` answer) stays silent.

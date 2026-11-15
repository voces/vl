## Type system (Track A)

- **D16620 closed:** a tail `if`/`match` whose arm values are pure warns `discarded-tail-value`
  (its `--fix` writes `return if …`), and a caller using such a function's value is told which
  function and given the cross-file fix, as a call tail already was.

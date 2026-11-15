## Type system (Track A)

- **D16448 closed:** an un-annotated function whose inferred return joins an empty list literal with `null` (`return if c { [] } else { null }`), a list no caller writes, now runs. Before, it built an invalid module. Filed D16447; D16342 waits on a ruling.

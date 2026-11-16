## Type system (Track A)

- **D3851 closed** (clause 2): a lambda with an un-annotated parameter that nothing calls, stored in
  a binding a nested function writes and nothing reads, is pruned as dead instead of refused; the
  list face is filed as D16820.

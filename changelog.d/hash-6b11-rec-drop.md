## Type system (Track A)

- **D16735 closed:** a record literal handed through a function value whose parameter drops a field
  eight or more levels down runs instead of being refused. The storage comparison behind the
  dropped-field decision walks the whole type for holes, and that decision's own walks have no depth.

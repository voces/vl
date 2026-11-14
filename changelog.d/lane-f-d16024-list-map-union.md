## Type system (Track A)

- **An inferred union of a list with a map or `Set` lowers (D16024).** An un-annotated
  function returning `[1]` on one path and a map or `Set` on another builds the union its
  annotated twin builds, instead of asking for an annotation. List members of any element
  kind, a `null` and scalar members ride along.

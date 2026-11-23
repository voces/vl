### Codegen

- The IR builder covers two more global reads with legacy bytes unchanged: an assignment's value
  re-reading a literal-union global (decoded to its string), and a global whose record type has
  no struct row (read at the row its initializer stored).

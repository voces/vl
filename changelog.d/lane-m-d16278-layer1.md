## Type system (Track A)

- **D16278, D15802, D16233 closed:** a list of records of un-annotated functions of different
  results, read straight off a call (`take(mk().a)`), off a binding of one (`take(r.a)`) or as a
  call's whole result, and handed to an un-annotated parameter, dispatches per member, including
  through a `const` copy of the parameter walked by `for`.

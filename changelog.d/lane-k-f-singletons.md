## Type system (Track A)

- **D3087, D16310 closed:** an un-annotated lambda delivered to a closed function type takes the
  delivered result as its annotation where its body hands back a value of another type, so it is
  checked and built as its annotated twin: a readonly view over a captured list, a record field
  union, an `i64` result, a union of function types.

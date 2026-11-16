## Type system (Track A)

- **D16711 closed:** an un-annotated lambda returned by an un-annotated function and delivered at
  a function type returning another numeric type (`const v: (a: i32) => f64 = deliver()`) returns
  that type, also through a second inferred return and when some read of the maker takes no
  instance; it trapped. The relay matrix moves 24 cells from trap to `RUNS`; D16733 (a map store)
  and D16734 (one maker at two results) are filed.

## Type system (Track A)

- **D2299 closed:** a `.map` or `.filter` callback over a `u8`, `i8`, `u16` or `i16` list takes each
  element as its `i32` value, and a `.map` result meeting a sub-word list is built at that storage,
  as a literal of computed values is.

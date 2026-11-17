## Type system (Track A)

- **D16927 closed (clause 1):** an uncalled un-annotated function whose body constrains its hole (`x + "a"`), stored as a record into a map read back from a map, builds and runs; its default instance takes the first of `i32`, `f64`, `string`, `boolean` its body checks at, and the slot is built at that signature. **D16935 filed:** the same shape with a built-in method call in the body is refused at emit.

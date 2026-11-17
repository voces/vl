## Type system (Track A)

- **D16927 closed:** an un-annotated function nothing calls, stored as a record into a map read back from a map, whose body does not check at the elaboration's `i32` default (`x + "a"`, `x.length`), runs: that default instance is reached by no call and is built with no body. On master it built invalid wasm (`+ "a"`) or refused at emit (`.length`).

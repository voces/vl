## Type system (Track A)

- **D16041 closed:** a declared union of equal anonymous record arms (`type R = { v: i32 } | { v: i32 }`) is that one record, as its inline spelling already was. Its field reads, `is` tests and stores now run instead of being refused at emit. Equal named arms (`A | B`) stay two declared types.

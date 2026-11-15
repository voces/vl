## Type system (Track A)

- **A14 ruled, generic newtypes; D2031 closed:** each instance of a generic `new` type is its own compile-time brand, erased at run time (owner ruling (a)). `Handle<Texture>` and `Handle<Mesh>` do not mix and neither takes a bare `i32`, a structural variable is not a `Box<i32>`, a getter may take `Box<i32>`, and `is` between two instances is refused with the newtype sentence (it printed a wrong answer before).

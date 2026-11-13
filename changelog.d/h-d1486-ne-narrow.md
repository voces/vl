## Type system (Track A)

- **D1486: a `!=` test on a literal discriminant narrows both branches.**
  `if s.kind != "circle" { s.h }` reads the arms the test leaves, and its `else` reads the tested
  arm, as the `==` spelling's two branches do. This works at inline arms, where no `is` rescue
  exists, and with two survivors.

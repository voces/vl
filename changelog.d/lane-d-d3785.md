## Type system (Track A)

- **An assignment delivered at its target's own type hands over what it stored (D3785).**
  `function s(): f32 { let x: f32 = 0; x = 255 }` returns `255` at `f32`. So does the same
  store delivered to an `f32` binding, argument, field or element. Its value keeps its own type
  everywhere else, so `const a = (x = 0xff)` stays `i32`.

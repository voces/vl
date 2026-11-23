## Type system (Track A)

- **D17067 closed:** unary `-` and `~` over a call that never returns (`-fail()`) were refused with `unary '-' expects a numeric type, got never`, although every binary operator takes `never` as a bottom. They are now `never`, and the live path runs.

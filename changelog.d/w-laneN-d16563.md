## Type system (Track A)

- **D16563 closed:** a destination binds a type parameter its call leaves open when that parameter is in a parameter position of an open-function slot, even if another argument binds the slot's other type parameter. `bind1(first, 2.5)` delivered to `(b: string) => f64` trapped and now prints `2.5`; 29 of the `gfv-bind1` matrix's 30 traps run.

## Codegen, memory & runtime (Track B)

- **IR claims a record copied onto a union arm** (`const d: R | string = mk()` where `mk` builds `{v: i32}` and `R = {v: f64}`): the shared box plan's new `recCopy` arm copies it field by field onto the arm and boxes it, as legacy writes it.

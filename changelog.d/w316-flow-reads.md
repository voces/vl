## Type system (Track A)

- **Flow-sensitive reads, the `let x = null` face (D2660 closed, runs):** a read of a `let x = null` before the write that fills it takes that most recent write's type, `null`, so a delivery where the filled type would not fit runs (a generic call, an annotated binding, a record field, a list or map element, a `.push`, a module global). A loop-head read joins the back-edge and stays refused; an `if` join meets its arms; a container element still follows the fill (D2506).
- **D15950 closed:** an un-annotated list literal of a parameter at an instance pinned at `null` stores the `null[]` sentinel, where it built invalid wasm.

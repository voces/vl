## Type system (Track A)

- **D16400 closed (L3, the parameter half):** a record wider than a lambda's declared record parameter runs at its own row: `const show = (p: P) => print(p.name)` with `show(v)` and `show(w)` at two wider rows prints both, where each call was refused with the field-dropping sentence. The lambda's parameter takes the same row slot a function's does, and hovers and messages still show `P`.

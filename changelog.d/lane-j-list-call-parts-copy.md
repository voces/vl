## Type system (Track A)

- **D16441, D16442 closed:** a call's fresh record, or a `const` of one, as a part of a list literal beside a part at a wider record (`[a, mk()]`, `const m = mk(); [a, m]`) is copied into that record and runs. Before, the call was refused at emit and the `const` at check, with a message naming one type twice. Filed D16444: a spread of a call's record list still refuses.

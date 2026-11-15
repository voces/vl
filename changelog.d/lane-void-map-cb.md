## Type system (Track A)

- **D16550 closed:** a call whose result stores `void` is refused at the call, as a written `void[]` is: `[1, 2].map((x) => print(x))` and a generic's `U[]` at a void `U` no longer build an invalid module.

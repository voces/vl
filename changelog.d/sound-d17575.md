## Type system (Track A)

- **D17575 closed:** a generic's type parameter that an earlier argument bound only to a phantom alias's open type variable is fixed by a later argument, and an un-annotated binding whose type still names an unbound type parameter is refused at check (`cannot infer the type parameter … no argument fixes it`) instead of building invalid wasm.

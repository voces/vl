## Type system (Track A)

- **D16890 closed:** a lambda whose result is an anonymous record, handed to a generic's bare type parameter (`id(() => ({ a: 5 }))`), runs instead of being refused at monomorphization: it is pinned by its signature.

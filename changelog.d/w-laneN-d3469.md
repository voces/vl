## Type system (Track A)

- **D3469 closed:** a `?.` method call on a nullable local a type-parameter value was written into runs at every pin, in the body and in a closure. The checker resolves the method on the declaration's non-null face and wraps `| null` at every instance where the template did. The guard reads the receiver at that face, so a map or set `has`/`get`, a string method, a self-function and a closure field all run. Before, these were emit rejects, check rejects, or (a non-null pin in a closure) a wasm trap.

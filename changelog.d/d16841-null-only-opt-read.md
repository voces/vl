## Type system (Track A)

- **D16841 closed:** a `?.` read or call off a binding only `null` initialises (`const a = null`) reads `null` and gets the always-null hint, bound (`const v = a?.f`), printed, as a statement or under `??`; a call evaluates no argument. Before, the read was check-clean but typed as an error, and emit refused it ("`?.` receiver is not a struct chain", "callee is not a function name").

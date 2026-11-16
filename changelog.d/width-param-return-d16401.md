## Type system (Track A)

- **D16401 closed:** a declared record return whose only source is a parameter the width rewrite instantiates per record (`function pass(p: P): P { return p }`) comes back at the argument's own type, flat or nested, instead of refusing the wider argument and undoing the rewrite; a return that builds a fresh record keeps the declared type.

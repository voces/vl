## Type system (Track A)

- **D16567 arity face closed:** a list, map or set method name called on an un-annotated parameter at an argument count no built-in method of that name takes (`a.get()`, `a.keys(1)`, `a.push()`) is the record field's call, and runs; the hole demand reads the built-in method table's arities (`builtinArityFits`, split out of `builtinSigOf`). The counts the map method also takes stay open on D16567.

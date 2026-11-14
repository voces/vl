## Codegen, memory & runtime (Track B)

- **D16072 closed:** a hole lambda returned by a call through a binding (a `const` lambda, or an alias of a named function) into an un-annotated binding now runs at the signature the binding is called at, as a direct call's result always did. It used to refuse with `a function-value call has no interned signature`.

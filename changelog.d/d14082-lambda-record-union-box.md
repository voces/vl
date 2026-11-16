## Type system (Track A)

- **D16899 closed:** a list of lambdas handed to a generic's `(() => T | string)[]` parameter (`many([() => 5])`) no longer traps with `indirect call type mismatch` when called through the list: each lambda is delivered at the bound union-result type, as a single function argument was. A list bound before the call is refused at check, as the non-generic spelling is.
- **D14082 closed:** a lambda returning a record, handed to a generic's `() => T | string` parameter (`len(() => p)`), runs instead of being refused at emit with `ref valtype with no interned shape`: the union the instance's signature holds (`P | string`) is registered though no annotation spells it, wherever the result goes (returned, stored in a field, handed on, called through a list).

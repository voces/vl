## Type system (Track A)

- **D16474 closed:** an assignment to the tested place nested in an expression of a deep `is` arm runs (`print(id(r = null) == null)`, an operand, a `const` initializer, an `if` test): the reads evaluated before the write and its right-hand side read the converted copy, its target and the reads after read the place. A binding of the place's name in a nested block still refuses (D16475).

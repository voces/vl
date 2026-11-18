## Type system (Track A)

- **B3: a lambda bound straight into a binding is its own leaf at check:** `ftLamPlainAt` admits a `LetDecl`'s initializer, whose calls B3.2a's lambda facts already type at each call row, so those sets are decided at check; 36 late tag rows move to check (373 → 337).

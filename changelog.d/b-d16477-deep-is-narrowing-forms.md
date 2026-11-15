## Type system (Track A)

- **D16477 closed:** the statements after a guard whose failing arm exits (`if !(g is T) { return }`, `continue`, `break`, `|| …`, an `else` that returns, an `else if` link) read a deep `is` receiver narrowed, as they read a shallow one; they were refused at the re-check. Every narrowing form now agrees deep and shallow, and check-within's `(deep is)` guard, which no program can trip, is deleted.

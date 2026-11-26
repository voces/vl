## Type system (Track A)

- **D17081:** a call into a mutual-recursion member still being inferred now counts as a cycle break, so its caller's return defers to the binding-group fixpoint instead of settling at an error type. Every expression over such a call is typed at the member's settled return, and the IR claims these functions instead of falling back.

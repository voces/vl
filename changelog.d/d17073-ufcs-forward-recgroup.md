## Type system (Track A)

- **D17073 closed:** a method-style call to an un-annotated recursion-group member declared after its caller (`{ k: self.k - 1 }.up()`) is re-recorded at the member's published return, as the plain call is, instead of keeping `<error>` in a check-clean program; the IR shadow now covers the caller. Filed the sibling D17081 (a binary, unary or `const` over such a call keeps the early type, both spellings).

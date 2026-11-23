## LSP / editor (Track D)

- **Receiver-overload sets follow the call site:** when two modules each export a `self`-function of one name, go-to-definition, rename and signature help on `p.describe()` use the candidate the checker picked for `p`'s type, not the last import of that name. Find-references now lists each method call as its own use. Hover on a method call's name shows its signature, which was empty even with one import. The checker records each method call that resolved to a `self`-function as a use of that declaration.

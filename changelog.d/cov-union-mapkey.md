## Codegen, memory & runtime (Track B)

- **IR builds a string-keyed map operation whose key is a literal-union value (lane COV-UNION):** the atom key is decoded to its member text, as legacy's one key gate (`mapKeyArmOf`'s `atom`) widens it. This covers `.set`, an index store or read, `.get`, `.has` and `.delete`. Before, the IR refused (`map key atom`).

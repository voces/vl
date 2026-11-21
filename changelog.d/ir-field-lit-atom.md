## Codegen, memory & runtime (Track B)

- **A record field typed by one bare string literal is its atom in the rep tree:** `rtOfObjAs` asks D7220's `repFieldLitAsSet`, as the row key does, and the IR delivers such a literal as the atom, so the `string atom` miss class closes (+67 claimed functions in `tests/cases`, +28 in the witnesses, +4 probes), byte-identical. A field holding a binding of the string stays a named miss (D17040).

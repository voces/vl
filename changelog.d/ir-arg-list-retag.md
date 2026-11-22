## Codegen, memory & runtime (Track B)

- **IR: a list handed to a parameter at its own storage is the same list (`argument coercion`).** A list of un-annotated functions, a list of such lists, or a record list at its record-or-null twin, passed to a parameter typed concretely, is the value as it stands: legacy writes no conversion. A call argument now takes the byte-free retag a binding and a return already take, through `cloHoleRetag`, the one predicate for two reps that differ only in closure openness. Legacy bytes are unchanged.

## Codegen, memory & runtime (Track B)

- **IR coverage, tail residue:** the IR builder now builds an atom arm of a `string`-joined `if`, an else-less `if` ending a tail arm, and a valued function with an empty body. Self-compile +3 and corpus +20 functions, byte-identical.

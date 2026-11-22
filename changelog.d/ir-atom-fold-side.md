## Codegen, memory & runtime (Track B)

- **IR: an atom local narrowed to one string literal reads at its atom cell where legacy writes it raw (`narrowed read`).** The two places are the side of a folded `==` (`s == "second"` once `s` is narrowed to `"second"`), which legacy evaluates and drops, and a `string` if-join's atom arm (`if a == "green" { a } else { "red" }`), which legacy decodes from the atom (`emitAtomToStr`). The builder now builds both as a seated read (`exprAt(…, true)`), so the local comes back at its own atom rep. Legacy bytes are unchanged.

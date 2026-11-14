## Type system (Track A)

- **D3981 closed:** the literal-union mismatch note names the literal that misses in each arm of a tail or initializer `if` and in a negated literal (`` `-2` is not one of L: 1 | 2 | 3 ``). A float literal against integer members is named as a kind mismatch (`` `2.0` is an `f64` literal, and the members of L: 1 | 2 | 3 are integers ``).

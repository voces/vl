## Codegen, memory & runtime (Track B)

- IR coverage, `is rung` and `rep ?` (lane COV-IS): a `f64 | string` box tested against integer literals (`v is 2`, the `floatLits` rung) is claimed as the `numBox` literal arms legacy writes, and a `match` arm's untyped string pattern over an open scrutinee is claimed as a string literal. Both classes reach zero on tests/cases, the inventory witnesses and the capability probes; the I8 census splits `is rung` by rung and a `rep` miss by node kind.

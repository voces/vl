# Compiler source: explicit returns where a trailing match's values were discarded (2026-11-20)

Ten self-compile functions were blocked by the IR miss `tail if union sink`. Eight are lowering
and verifier functions (`ir_lower.vl`: `irLOpnd`, `imm`, `call`, `rhs`, `node`; `ir_verify.vl`:
`use`, `rhsCheck`, `stmt`). Each ended in a `match` or `if` whose arms end in a value: an effect
call's result, or a verdict `0`. One arm elsewhere returns explicitly, so the trailing statement
is a statement, its values are discarded (`vl check`: "this value is discarded" at `use`), and
the function falls off into `null`. That made each function's result nullable and gave it the
union return sink, which the IR does not claim.

No caller reads those results, so the drop is deliberate, not a latent bug. Each function now
ends in `return 0`, which states the intent and takes the `null` out of its result.

The other two, `pbNode` and `plus`, `return` a union value from a `match` or `if`. They are real
returned values and keep the miss.

Measured at the merge-base in the PR.

Legacy lines deleted: 0. Moved to `@ir`: 0.

# START-2: `global initializer coercion`, the list half (2026-11-26)

Regen-10 lists 9 units. An instrumented miss on master 69553c62 named the reps and the bindings:

| shape | units | owner |
| --- | --- | --- |
| `const wm: {[string]: J} = m`: a module map whose records are built at `J`, read into a binding at `J`'s map; legacy declares both globals at one struct type | 8 | converter (`convert map -> map`, COV-CALL) |
| a start-body list literal whose binding stores a wider record's list (`letBindTy`) | 1 | this change |

`globalInitValue` built a list literal at its binding's storage row only under `gConstExprEmit`. A
global initialized after a non-constant one (`const wideJ: J = mk()`) is written in the start
body, where legacy builds it at that row too. Dropping the condition claims
`soundness/record-nested-list-binding-delivered-wider-runs.vl`'s `@start`, byte-identical.

Left for the converter: a constant `const nested = [[{ f: 5 }]]` read into `const wn: J[][]`
misses as `list -> list`, though legacy types both globals alike.

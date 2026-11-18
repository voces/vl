# The driver census ranks coverage steps by the legacy lines they would delete, 2026-11-18 (lane STORE)

`scripts/ir-driver-census.sh <seed> <out.tsv>` on the master `0b8c7beb` fixpoint, over the self-compile
plus every distilled cell (`cells/` and `named/`). Each legacy driver (a top-level function of
`wasmEmit.vl` or `emit_*.vl`) now carries the doors still reaching it under the shipped claim, and a
role: `ast` (it walks the AST itself), `value` (it writes code from values the IR can share) or
`decide` (it writes nothing). A door is a driver's last when every function still reaching it is
blocked by that one class alone; `<out>.doors` ranks the classes by those drivers' own lines.

| lines | drivers | decide | value | ast | door |
|---:|---:|---:|---:|---:|---|
| 527 | 17 | 89 | 138 | 300 | operand type |
| 96 | 7 | 26 | 20 | 50 | is rung |
| 53 | 1 | 0 | 0 | 53 | intrinsic none |
| 52 | 1 | 0 | 0 | 52 | method isCharBoundary |
| 51 | 2 | 27 | 24 | 0 | member record |
| 49 | 3 | 28 | 0 | 21 | expression if |
| 31 | 2 | 31 | 0 | 0 | expression object |
| 25 | 1 | 25 | 0 | 0 | pre-path tag leaf |
| 23 | 2 | 23 | 0 | 0 | print union |
| 10 | 1 | 10 | 0 | 0 | member box |
| 9 | 1 | 0 | 0 | 9 | string append in place |
| 6 | 1 | 6 | 0 | 0 | expression as |
| 3 | 1 | 3 | 0 | 0 | code point list spill |

Covering a door deletes only its `decide` rows and the dispatch arms above them: the IR's lowering
calls the `value` rows, and an `ast` row dies only once a value-level core replaces it. The honest
routing deletion behind "operand type" is about 65 lines (its genuine gates, plus the
`emitBinExprNode` union arm), not 527.

Where the legacy lines are (drivers hit with claiming off: 6,373 drivers, 130,025 lines):

| reached as shipped from | drivers | lines |
|---|---:|---:|
| `@module` only (module passes) | 1,499 | 34,965 |
| `@module` and `@start` | 874 | 19,798 |
| `@start` only (top-level code) | 308 | 7,315 |
| `@ir` among its doors (the claim path itself) | 2,013 | 32,465 |
| nothing (dead under the claim) | 5 | 82 |

1. The module passes and top-level code (2,681 drivers, 62,078 lines) are reached by no function's
   door, so no coverage step deletes them.
2. The claim path still calls 2,013 drivers (32,465 lines); they stay while the IR's lowering does.
3. Only 5 drivers (82 lines) are already dead under the claim.

Further 1,207 drivers (21,215 lines) are hit by neither build on this population.

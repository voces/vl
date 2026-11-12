# D15639: the checker follows a hole into a `const` record handed on, 2026-11-12

`holeBindArgListsHole` (`check_relate_core.vl`) followed a record literal only where it was the
call's argument itself (D15638). A `const` record handed on was therefore no open call, and
`holeBindInstance` pinned the hole at its direct call's type. The function now follows a record
literal through the `const` it initialises, as it already did for a list. The 2026-11-10 attempt
recorded on D15639's row turned D15639's guard into invalid wasm. That emit half is now
`inlineConstRecArgs` (D15700, #7419), which writes such a `const` into its one argument.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15639 | loud check reject | runs, `5` `s` |
| D15639 at two instances, each called directly (`run(id)`, `run(twice)`) | runs | runs, the same |
| D15700's matrix (keep, k1-k5) | run | run, the same |

Fixpoint seeds on both sides, over the whole sweep population: same 23,992, bytes-only 1, output
movers 1 (D15639: check_reject → runs), runs → not-runs 0, new compiler traps 0. The bytes-only
mover, D15700's fixture, shrinks from 552 to 547 bytes, one type fewer.

Still refused on both seeds:
- a lambda argument (`run((v) => v)` beside `run(id)`), which now stops at "cannot infer a type
  for parameter `v`";
- a `const` record read twice (`r.f(true)` beside `call0(r, ...)`), which the rewrite does not
  take.

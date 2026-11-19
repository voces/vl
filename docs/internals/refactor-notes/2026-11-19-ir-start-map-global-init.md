# IR: a global initialized by `Map()` or `Set()` (2026-11-19)

A start body missed `global initializer rep` for every global whose cell is not a value rep.
On the corpus that miss splits by the cell's rep: map 1,325, closure 702, nullable record 96,
nullable list 32, the rest 57 (a probe seed that named the rep; not committed). Almost every map
global is spelled `= Map()`.

`globalInit` now builds a builtin `Map()`/`Set()` initializer (no user function of that name, no
argument) as `RMapNew { mnAt }`, lowered by legacy's own `emitMapNew` at that node; the verifier
requires a map destination. Maps stay outside `valueRep`, so no other position takes a map.

Measured on fixpoint seeds over the corpus (armed shadow), master a3d89972 against this branch:

| | master | this branch |
|---|---|---|
| functions covered = verified = matched | 66,969 | 66,969 |
| start bodies covered = matched (of 17,028) | 6,703 | 6,895 |
| `start uncovered global initializer rep` | 2,246 | 952 |
| mismatch / fail | 0 / 0 | 0 / 0 |
| corpus mode-3 claimed start | | 4,755 |

Most newly covered map globals stop at the next start statement instead: `map store` (404) and
`method set` (205) are the doors behind them. Driver census: `@start global initializer rep`
falls from 87 alone lines in 11 drivers to 55 in 8; all 11 drivers are still reached, now through
`method set` and `open temp type`, so no legacy driver becomes deletable by this step.

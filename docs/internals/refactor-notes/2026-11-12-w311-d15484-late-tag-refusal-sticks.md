# D15484: a set a late tag decision refuses stays untagged, so the rounds settle, 2026-11-12

`elabPrepare` (`emit_sections.vl`) alternates the elaboration with `fnTagRedecide` until no
decision tags another set. A probe on the rounds of D15484's witness (a hole function and a
closed-typed function handed to one parameter through a list element) read `r0 g=1 | m=1 g=2`.
The first late decision tags `id`'s set. The elaboration then mints facts under which the next
decision cannot tag it, and the answer 2 ended the loop as unsettled. Treated as another round,
the decision alternated, tagging and untagging the set, until the bound.

`fnTagRedecide` (`check_fn_tag.vl`) now records a set it drops in `ftLateRefused`, and `ftTry` does
not tag such a set again in a later round. The list resets at the check's own decision. The
rounds go on past a round that answers 2. The set is then held as closures, as the direct-call
spelling already holds it.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15484 (list callee, lambda) | loud check reject (unsettled) | runs, `2.5` `5` |
| if-joined callee | loud check reject | runs, `2.5` `5` |
| `dbl(x: f64)` for the lambda | loud check reject | runs, `2.5` `5` |
| `const g = onceF` | runs | runs, the same |
| `id` twice | runs | runs, the same |

Fixpoint seeds on both sides, over the whole sweep population: same 23,992, bytes-only 0, output
movers 2, runs → not-runs 0, new compiler traps 0. The movers are D15484 (emit_reject → runs) and
D15860, which comes from the base seed: it predates #7427, which this branch's master includes.

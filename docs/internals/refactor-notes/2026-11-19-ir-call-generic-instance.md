# IR: calls to a generic instance (2026-11-19)

`callRhs` required the callee's `fnStmts` slot to hold the declaration the call names. A
generic call names the template, and the slot holds the instance, so every such call missed
`call target`. `callTargetIs` now also accepts the instance whose original is that declaration
(a first instance through `monoGen`/`monoOrigNode`, a later one through `monoInstFe`/`monoInstOrig`),
and the call lowers against the instance's own parameters and environment shift.

A call whose IR result rep differs from the callee's signature (a joined result legacy widens)
misses by name, `call result coercion`, instead of tripping verifier rule 6.

Measured on the fixpoint seed over the corpus (armed shadow):

| | master 8fb6ce09 | this branch |
|---|---|---|
| functions covered = verified = matched | 66,966 | 66,966 |
| start bodies covered = matched (of 17,022) | 4,572 | 6,703 |
| mismatch / fail | 0 / 0 | 0 / 0 |
| corpus mode-3 claimed start | — | 4,578 |
| L2 self-compile fuel | | +0.6% on baseline |

Driver census (`scripts/ir-driver-census.sh`, start attribution per #9065): the `@start call target`
door goes from 17 alone lines in 1 driver to absent. That driver is not freed: its remaining
start hits now attribute to `pre-path tag leaf` (109 → 126 alone lines). No legacy driver
becomes deletable by this step alone.

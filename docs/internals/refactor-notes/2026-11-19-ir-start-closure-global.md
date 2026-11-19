# IR: a closure global initialized by a function literal or name (2026-11-19)

After map globals (#9079, #9090), the start body's `global initializer rep` miss was mostly
closure cells: by initializer, a function literal 481, a call 126 and a function name 105 start
bodies on the corpus (a probe seed that named the rep and the spelling; not committed).

Legacy's function-value ladder in `emitIdentNonLocalRead` is now one decision: `fnValueFeOf`
picks the function (maker token, nested copy, scope's own), and `fnValueArmOf` names the arm
(`twin`, `unfixed`, `inert`, `aliasCore`, `checked`), which legacy matches on. `emitClosureValue`
and `emitClosureValueCore` raise their refusals from `closureValueWhy` and `closureValueCoreWhy`.

The IR builds `RMakeClo { mcFn, mcEnv, mcAt }` for a closure cell whose initializer is a lifted
function literal, or a bare name on the `checked` arm, and whose function captures nothing. Its
lowering is legacy's `emitClosureValue` at the start frame, then a name's read recovery.
`RMakeClo` is the new `closure` family, claimed. Every other spelling is a named miss: `closure
value of a call` (103), `closure value inert` (16), `closure value expression` (10), `closure value
aliasCore` (1), `closure name of a global` (1).

Measured on fixpoint seeds over the corpus (armed shadow), master 47d2d022 against this branch:

| | master | this branch |
|---|---|---|
| functions covered = verified = matched | 67,024 | 67,024 |
| start bodies covered = matched (of 17,049) | 6,903 | 6,937 |
| `start uncovered global initializer rep` | 983 | 294 |
| mismatch / fail | 0 / 0 | 0 / 0 |
| corpus mode-3 claimed start | 4,759 | 4,762 |

Most newly reached start bodies stop at a later statement: `open temp type` (+250), a call
through a closure, `call of a non-declaration` (+159, the next IR step, `RCallRef`), the closure
misses above, and `callee signature` (+26). Driver census: `@start global initializer rep` falls
from 55 alone lines in 8 drivers to 22 in 6, and `@start open temp type` rises from 8 in 1 to 41
in 3. Alone lines total 292 on both sides, so this step frees no legacy driver.

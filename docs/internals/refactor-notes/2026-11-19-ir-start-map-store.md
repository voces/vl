# IR: a map store, `.set` and a Set's `.add` on a map global (2026-11-19)

With map globals initialized (`RMapNew`), the start body's next doors were the store into them:
`map store` (404 start bodies), `method set` (205) and `method add` (26) on the corpus.

Legacy's value ladder in `emitMapSetValExpr` is now one decision, `mapSetValArmOf` (arms
`scalar`, `union`, `variant`, `atomNull`, `boolNull`, `boolNulNone`, `atomStr`, `plain`), which
legacy matches on and the IR builder reads. `emitMapSetV` ends in `mapSetTail`, the setFn helper
call or the inline store, which the IR lowering calls too. The IR builds `RMapSet { msSym,
msNonNull, msRecv, msKey, msVal, msAdd }` (family map) as an effect only when the receiver is a
module map global read plainly, the key arm is plain, the value arm is plain and needs no unbox,
and no ref goes into a mono map. A Set's `.add` stores the immediate `true`, as legacy does.
Every other arm is a named miss (`map store value <arm>`, `map key <arm>`, `map store receiver`).

A valued `if` in the key or value (`m[k] = a && b`) would be written ahead of the receiver the
lowering reads first, so the builder refuses it (`map store short-circuit operand`), as it
already did for a call's later argument. The same hazard sat in the list push path, and covering
`lbiMark`'s map stores exposed it there (`push short-circuit operand`).

Measured on fixpoint seeds over the corpus (armed shadow), master 28645c6b+ against this branch:

| | master | this branch |
|---|---|---|
| functions covered = verified = matched | 66,996 | 67,004 |
| start bodies covered = matched (of 17,038) | 6,895 | 6,902 |
| `start uncovered map store` / `method set` / `method add` | 404 / 205 / 26 | 0 / 0 / 0 |
| mismatch / fail | 0 / 0 | 0 / 0 |

The newly reached start bodies mostly stop at the next statement: `map store value variant`
(127), `pre-path coercion` (+122), `expression object` (+109), `map store value union` (35),
`boolNull` (12), `scalar` (10). Driver census: the `@start method set` door (24 alone lines,
2 functions) is gone, but its lines now sit behind `@start pre-path atom hook` (17) and
`@start map store value variant` (7); alone lines total 292 on both sides, so this step frees no
legacy driver.

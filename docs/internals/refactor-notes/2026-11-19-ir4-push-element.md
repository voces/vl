# IR coverage: a push onto a ref list or a packed byte list (2026-11-19, lane IR4)

`push element` blocked 121 self-compile functions alone on master 85ce0724c, the largest of the
method classes. `pushPlainWhy`, which gates the IR's push and nothing else, refused three shapes
under that one name: a ref-list push (`ppSlot.rSlot >= 0`), a nested-list element
(`pushNestSlot >= 0`), and a packed byte list (a scratch base other than `pushScratchBase`).

The IR's push lowering (`lowerPush`) already takes everything slot-specific from the plan: the
receiver's staging at `ppSlot.base`, `pushValueTail`'s recovery and stage, and `emitPushAppend` at
`ppSlot.lTy`/`aTy`/`base`. So the ref-list and packed refusals are lifted. The nested-list element
stays a miss and is now named for its mechanism (`push nested list element`). Legacy is untouched.

## Measured

Fixpoint seeds: master 4780fbd74 against this branch, on the same base.

| | master | this branch |
|---|---|---|
| self-compile covered = matched | 13,930 | 13,983 (+53) |
| corpus covered = matched | 33,414 | 33,414 |

On the self-compile, lifting the ref-list refusal alone covered +29, and the packed one +32 more
(measured on 85ce0724c). The rest of the 121 stop at their next class (`push operand coercion`,
`push element seed`, `push short-circuit operand`).

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,034, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,512, differ 0 |
| `--claims` / mode 3 | 33,414 ok / identical, 0 fell back, 13,983 claimed |
| L2 fuel | 99,828,151,604 against master's 99,819,201,615: +0.01% |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, `ladder-sets.vl`, phase state, late demands | clean; ok; ok; 9 |
| `deno task test` | 9,569 passed, 0 failed |

`pushPlainWhy` gates only the IR, so legacy's bytes cannot move. The identity runs confirm it.

**Lines.** −4 (+1 / −5).

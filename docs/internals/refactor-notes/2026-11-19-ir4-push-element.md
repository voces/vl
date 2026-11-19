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

BARS

**Lines.** −4 (+1 / −5).

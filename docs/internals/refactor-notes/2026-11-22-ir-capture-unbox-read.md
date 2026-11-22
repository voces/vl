# IR: a captured union box narrowed in the closure reads on legacy's unbox arm, 2026-11-22

The coordinator's `read of <name>` class (56 functions on the IR-only census). 41 are a captured
union box, `i32 | null` and its kin (a scalar has no niche, so it rides the value-union box),
narrowed to a member inside the closure or where the closure is written. Legacy reads it on
`identReadArmOf`'s `unbox` arm: the box from the environment (`emitUnionBoxPush`'s capture leg),
then the unbox. The IR's `captureRead` admitted only the `capture` arm.

## The change

`captureRead`, IR-N6's #9572 path, admits the `unbox` arm as a narrowed read of that one path, not
a parallel route: the capture at its own rep (`capRepFor` with no read rep), admitted where it is
held as a box (`heldAsBox`) and the read has an atom kind (`identUnboxAtomOf`); #9572's binding
type check; the environment's temp at that type or the lifted parameter (`liftCapVar`); then
`captureUnbox`, the RBoxNarrow temp narrowedLocalRead's `unbox` arm already writes for a local
box. #9572's recover arms are unchanged.

## Readings (base master 5be659a8, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| the 36 `read of <name>` files, covered (= matched, no fail) | 600 | 642 (with the witness) |
| tests/cases armed shadow covered / matched | 69,384 / 69,383 | 69,431 / 69,430 (same single fail row) |
| corpus functions with no blocker | 45,255 | 45,255 |

Per function, tests/cases: 39 gained, 0 lost. Identity (`--names`, mode 3, `--cases`,
claimless, tests/cases A/B): 0 differ. L2 fuel +0.01% per PR. Left in the class: 9 function
declarations read at a non-closure rep and 3 `nulnone` captures. Legacy lines deleted: 0.

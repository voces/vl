# IR cutover C2c: the list read's decisions are legacy's own, 2026-11-16

Lane IR-C. This is the third PR of the list-family plan: the list-read op-seam slice. The read
decision, and the read itself, are now one shared function each, called by legacy and by the IR.
The IR's copied ladder is deleted. `CLAIMED` stays empty. Measured on fixpoint seeds against C2b
and the master base (`b8bdd167`).

## Occurrence count, before the cutover (constraint 3)

A throwaway instrument at legacy's `emitIndex`, never committed, recorded the arm each read
actually took. It used per-call stacks, because a read nested in an operand is lowered before its
outer read finishes. It compared that arm with the IR's decision, `listIdxPlainWhy`. The IR takes
a read exactly when legacy took its plain scalar arm, hoisted or not.

| population | reads | agreed | mismatches | by arm |
|---|---:|---:|---:|---|
| self-compile | 21,861 | 21,861 | 0 | scalar 16,488 · str 2,987 · ref 1,408 · string 978 |
| distilled `cells/` + `named/` | 24,006 | 24,006 | 0 | scalar 11,980 · string 6,392 · ref 4,650 · str 832 · nulstr 152 |

**Failing control.** A hook that answered "plain" for every read reported 5,373 mismatches on the
self-compile: every str, string and ref read (2,987 + 978 + 1,408). The 16,488 scalar reads stayed agreed.

## What landed

- **The arm decision is one function.** `idxArmOf(nd, fnIx)` returns a closed `IdxArm`, in the order
  the receiver's reps must be asked.
  - `emitIndex` is now a `_`-less `match` over it. The str-list and raw-string arms became
    `emitIndexStrList` and `emitIndexRawString`.
  - The IR's `listIdxPlainWhy` asks the same function. Its copy of the ladder (two lists, nullable,
    ref, str list, string) is deleted.
- **The scalar read is one arm, split around its operands.**
  - `scalarListHoistOf` returns the live hoist row that holds the receiver.
  - `scalarListGetTail` writes the guard, over the hoisted header or the wrapper, then the backing's
    `array.get`, or the view read.
  - Legacy's `emitIndexScalarList` and the IR's `lowerList` call both halves. Each writes its own
    operands in between: legacy with `emitExpr`, the IR with `irLOpnd` and `irLSkip`.
  - It is split rather than handed callbacks. A capturing lambda version cost +3.9% L2 fuel and
    21 KB of seed, so it was dropped.
- `emitIndexScalarList` and `emitIndexNulScalarList` read their own kind from the receiver. No
  emit refusal site was added or removed.

## Measurements

| reading | C2b | this branch |
|---|---|---|
| self-compile, armed: covered / matched | 2,157 / 2,154 | 2,157 / 2,154 |
| `ir-shadow.vl` over the distilled corpus | 12,603 of 12,603 matched | 12,603 of 12,603 matched |
| armed self-build byte-identical to the unarmed seed | yes | yes |
| self-build: fixpoint from the previous seed | yes | yes (second compile) |
| corpus identity against the base seed, 12,172 cells | 0 differ | 8,893 identical, 3,279 fail under both, 0 differ |
| mode 3 with `list` admitted (throwaway build): corpus | 8,893 identical, 0 differ | 8,893 identical, 0 differ, 0 fell back |
| mode 3 with `list` admitted: self-compile | 2,154 claimed, identical | 2,154 claimed, byte-identical to the seed |
| L2 self-compile fuel | 89,785,125,801 | 89,796,564,062 (+0.013%; +0.001% on base) |
| seed size | 6,348,151 | 6,348,310 (+159) |
| compiler lines against C2b | — | +119 / −126, net −7 (with `IdxArm`'s copy in `lint.vl`'s closed sets) |
| emit refusal sites (`emit-refusal-sites.vl`) | 848 | 848 |

The fuel rise is the `scalar` arm asking `scalarListElemKind` a second time: once in `idxArmOf`, and
once in the read for its kind.

## Left for later slices

- The view read (`svDstOfKind`) is still a named miss in the IR (`index view`). The shared tail
  already writes it, but the builder cannot know at build time whether a view read will be hoisted.
- The other arms (`ref`, `str`, `nulstr`, `string`, `nulscalar`) are `emitArr*`-family reads, one
  slice each. Constraint 4: these key on `scalarListElemKind`, `exprPackedRow` and the ref-list
  table, not on REP's field codes.

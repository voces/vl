# IR: a map operation on any receiver (2026-11-19)

`RMapGetOr`, `RMapHas` and `RMapSet` named their receiver by a module global's symbol, so a read,
test or store through a parameter, a local, a field (`b.m[k]`) or an element (`ms[0][k]`) was a
named miss (`map read receiver`, `map has receiver`, `map store receiver`). With a map a value rep
(the previous step), those were the blockers left on map-typed code.

## The change
- **The receiver operand.** Each node keeps its global symbol and gains `mgLoc` / `mhLoc` /
  `msLoc`. Where the symbol is -1, the operand is the receiver: any expression read as a map whose
  value is the last node built (a variable, or the temp its use writes in place). The lowering
  writes it where it writes a global's read, then legacy's own `mapRecvRefTail`, key and tail,
  and `mapRecvShapeOf` still decides the op context from the receiver node, as legacy's does.
- **Order.** Legacy writes the receiver before the key. A receiver variable that a node built for
  the key or value assigns is a named miss (`map receiver reassigned`); a receiver temp is
  written in place.
- **The verifier** holds the receiver at a map rep and reads it as a use.

## Measured on fixpoint seeds: the previous step (#9181, `fa8234519`) against this branch

| | before | this branch |
|---|---|---|
| self-compile functions claimed | 15,674 | 15,851 |
| self-compile `map read receiver` + `map store receiver`, alone | 125 | 0 |
| distilled functions claimed (`--claims`), all matched armed | 35,483 | 35,576 |
| distilled `map read receiver`, alone | 196 | 0 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,515 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against the base's seed: 100,801,030,571 → 100,816,426,535 (+0.015%).
- **Lines:** +114 / −42 in `compiler/`. A coverage step: 177 self-compile and 93 distilled
  functions.

## What is left
- Distilled functions that `map read receiver` shared with another blocker now show that one:
  `read of c` (75 beside it before), `null test boxTag` (83).
- `map read default computes` (19 distilled alone): a default with more than one node.

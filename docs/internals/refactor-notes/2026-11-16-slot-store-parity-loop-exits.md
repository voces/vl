# Slot store parity 1: loop exits (lane SLOT, 2026-11-16)

The first engine-parity rule for [D16768](../inventory/D16768.md): the place classes answer what
mono's pin readers ask, the way the delivery walk does. It lands with mono's readers still on the
walk, so it changes no output. It is graded by every `tests/cases` program building
byte-identical to master's.

## What changed

- **`eplLoopExits`** (run in `eplBuild` after `eplEdges`): each value a `break v` hands to a loop
  or labelled block flows to the loop's own place, in every instance of the loop's frame. It is
  read from the checked tree (`eplLoopExitsIn`, matching labels and shadowing as the loop rewrite
  does). The walk reached these values through `lvExitLoops`, which the loop rewrite fills after
  the classes are built. The coordinator's ruling: the classes never read a table the emit
  rewrite fills.
- **`eplSrcHolder`**: a loop's value carrier the rewrite minted (`lvCarrierLoopOf`), or a value
  it minted for the loop to hand out, answers as the loop.
- **D16768's mechanism is corrected.** The classes are not rebuilt during mono; mono's failures
  under the classes were engine gaps.

A block's tail value is left out. The checker decides it (`lpValTail`), reading it here would add
a checker import, and no gap case needs it.

## Readings

Fixpoint seeds: master `c7fefb87` and this branch.

| check | reading |
|---|---|
| `tests/cases` built, byte for byte | 0 of 7,834 differ |
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's |
| L2 self-compile fuel | 92.937e9 against master's 92.876e9: +0.07% |
| seed size | 6,414,790 against 6,413,176: +1,614 |
| `lint-self` | clean |
| `scripts/gate.sh` | every row ok but `ci-native`'s `tests/vl_touch_set_test.ts`, which fails on master's seed too |

**Gap list** (the class-reading part D candidate, `tests/cases` byte compare): 18 → 13
measured with this rule and the minted-value rule. 7 remain on branch `slot-2b3-d` with the
rules still to land.

# Place classes: a merged class drops its lists (lane SLOT, 2026-11-16)

A memory fix in the slot store's place classes ([D16768](../inventory/D16768.md)), found while
building the classes at elab end on the class-reading part D candidate (`slot-2b3-d`).

## What changed

- **`eplUnion`**: after it merges class `b` into `a` (members, calls, up-links, children), `b`'s
  own lists are emptied. Every reader goes through the root (`eplFind`), so no answer changes.

## Why

With the classes built at elab end on every compile, the L2 self-compile ran out of GC heap at 2G,
3G and 4G (`VL_COMPILE_GC=copying`). A named seed's backtrace put the allocation in `eplUnion`:
a merged class kept every list it had, and the root got a copy, so a run of merges into one growing
class held quadratic memory. With this change the same candidate's L2 completes (peak live set
1,268 MiB at a 2G copying heap) and its seed is a fixpoint.

## Readings

Fixpoint seeds: master `e1f9611e` and this branch.

| check | reading |
|---|---|
| `tests/cases` built, byte for byte | 0 of 7,870 differ |
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's; 0 `runs -> not-runs` |
| L2 self-compile fuel | 94.289e9 against master's 94.292e9 (baseline 93.782e9: +0.5% both) |
| L2 peak live set, this tree's classes (built when asked) | 1,028 MiB, master 1,028 MiB |
| L2 peak live set, classes built at elab end (`slot-2b3-d`) | out of GC heap at 2G, 3G and 4G before; 1,268 MiB (61% of 2 GiB) after |
| seed size | 6,449,474 against 6,449,137: +337 |
| `lint-self` | clean |
| `scripts/gate.sh` | all gates pass |

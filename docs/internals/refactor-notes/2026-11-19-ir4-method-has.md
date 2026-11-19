# IR coverage: a map global's `.has` (2026-11-19, lane IR4)

`method has` blocked 107 self-compile functions alone on master 85ce0724c. The compiler asks its
module-level maps `.has` everywhere.

## What changed

Legacy's `emitMapHas` was `emitMapPrep` (the receiver and key, their staging and the probe), then
the hit flag. It is now `emitMapRecvKey` followed by **`mapHasTail`**. That tail stages the key and
the map ref, runs the probe and pushes the hit flag (`pushMapHitFlag`). It writes the same bytes,
and it is the IR's tail too.

The IR adds **`RMapHas { mhSym, mhNonNull, mhRecv, mhKey, mhAt }`** (family `map`). It covers the
same receivers as the map store and the `??` read: a map global read plainly, with a key written as
itself (`mapKeyArmOf` is `plain`). The lowering writes what those write ahead of their own tails:
the global read and recovery, `mapRecvRefTail`, the key, `mapRecvKeyTail`. Then it calls
`mapHasTail`. A local map receiver stays a miss (`map has receiver`), as it does for the other map
ops, until a local of map rep is the IR's.

## Measured

Fixpoint seeds: master a4ecfb4a3 against this branch on the same base.

| | master | this branch |
|---|---|---|
| self-compile covered = matched | 14,162 | 14,259 (+97) |
| corpus covered = matched | 34,229 | 34,229 |

BARS

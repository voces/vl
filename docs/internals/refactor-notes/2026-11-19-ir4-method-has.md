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

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,513, differ 0 |
| `--claims` / mode 3 | ok / identical, 0 fell back, 14,259 claimed |
| L2 fuel | 100,474,227,265: +0.07% on master a4ecfb4a3 (100,403,115,591), +0.7% on the baseline file |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, ladder-sets, dead exports | clean / 59 sets match / 0 |
| phase state, late demands | ok (hidden 154) / 9 of baseline 9, 307 tag rows |
| `deno task test` | 9,570 passed, 0 failed |

**Lines: compiler +94 / −26.** Nothing legacy is deleted. `emitMapHas` is split so its tail is shared
(+5 / −5 in `wasmEmit.vl`), the IR arm is new (+68), and the lint mirrors take 37 lines (+19 / −18,
mostly re-wrapping). This is a coverage step: it moves no legacy line onto the IR and deletes none.

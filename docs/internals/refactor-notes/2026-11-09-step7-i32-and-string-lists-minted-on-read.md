# Step 7: the i32 list wrapper and the string list pair are minted on first read

Measured 2026-11-09 on a 4-core box, master `4f93c1a4`. Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,744 programs. This box has no `/usr/bin/time`, so peak RSS is
VmHWM, polled from `/proc` during an unoptimised build of the plumb-shape main unit.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 22,444 same; 1,300 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,569,808 | 6,567,753 (−2,055), +2.7% of the +3% bar |
| plumb-shape main fuel | 8,975,636,030 (baseline) | 8,816,736,661 |
| plumb-shape tail fuel | 6,579,647,243 (baseline) | 6,393,472,751 |
| main unit build, VmHWM (two runs) | 440.4 / 442.6 MB | 442.9 / 443.5 MB |

## What moved

`lUsed` and `slUsed` are deleted. `lTy()` mints the i32 list wrapper and `mkArrTy()`/`mkListTy()`
mint the string list pair (`emit_state.vl`). Each index reads −1 until then. `isLTy`,
`isMkListTy` and `isMkArrTy` are the comparisons.

* All setters are gone, and so are the bodies' `not collected` guards on either flag.
* `mAssignTypeIndices` still mints both before the map struct's index is predicted from the
  counter. The wrapper mints there when an `RLK_I32_LIST` row exists, since that row's twin
  signature names it. The string pair mints there when `mUsed` is set, since the map's `keys`
  field holds it. Every other reader mints on first ask.
* `svReserve` keeps a view from the checker's bit alone. `mAssignScalarListPairs` mints the
  wrapper before a view whose source is an `i32[]`.
* A list op whose record started at the i32 wrapper and was overwritten for every other
  element kind would have minted a dead wrapper. That covers `pushSlotOf`, `idxStoreClassify`,
  `.pop`, `.clear`, `.slice`, `.map`/`.filter`, `for`, `__array_new__` and `__array_copy__`.
  These now start at −1, and only the i32 arm asks. A string walk (`for c in s`) reads the
  string's own array, so it does not ask. The map-struct renderers ask for the string pair only
  for a string key.

## The 1,300 bytes-only movers

Each program was built under both seeds and the disassembly compared. With the dead types
deleted from the base and its type indices renumbered, every module equals the candidate's:

* 1,266 lose a dead i32 list wrapper. In 13 of them (`d3125_gen_*` cells) the rec group's
  `(func)` entry also moves after the group. That is a reorder with the same type multiset.
* 34 lose a dead string list pair as well (27 with one wrapper, 7 with two).

No module gains a type. collectA set a flag for a shape that no lowered body, field or
signature reads.

## What stands

* `mUsed`, `ba8Used` and `aUsed` gate helper indices that `assignSharedHelperIndices` fixes
  before the bodies. Those helpers have to become tail rows first.
* `lTy()` needs `aUsed`'s array, so the wrapper is only correct while `aUsed` is set. Every
  former `lUsed` setter set `aUsed` beside it, and those setters stay.

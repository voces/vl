# Step 7: the packed byte list pair is minted on first read

Measured 2026-11-09 on a 4-core box. The base is master `81f85ec7` (#6922). Both seeds are fixpoints
(two `refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,746 programs.
This box has no `/usr/bin/time`, so peak RSS is VmHWM, polled from `/proc` during an unoptimised
build of the plumb-shape main unit.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,724 same; 22 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,569,048 | 6,567,784 (−1,264) |
| plumb-shape main / tail fuel | 8,975,636,030 / 6,579,647,243 (baseline) | 8,816,743,961 / 6,393,480,051 |
| main unit build, VmHWM (two runs) | 321.6 / 321.7 MB | 321.6 / 321.9 MB |

## What moved

`ba8Used` is deleted. `ba8Ty()`/`bl8Ty()` (`emit_state.vl`) mint the packed `(array (mut i8))`
backing and its wrapper together on first ask. Each index reads −1 until then, and `isBa8Ty`/`isBl8Ty`
are the comparisons. `mResetTypeIntern` resets the pair with its siblings, so a mint made before
`mAssignTypeIndices` is discarded there, as the f32, f64, i64 and string list pairs' are.

* Every setter is gone, and so is each body's `u8 list type not collected` floor.
* The union tag band read `ba8Used` to lift the slot-keyed bands off code 13. It now reads
  `vbU8ArmUsed`, set only when a value union has a packed byte-list arm (`applyArmUseBits`'s 4096
  bit) and reset in `collectUReset`. A module with a `u8[]` but no such arm no longer reserves code 13.
* `fnUsesU8Push` is reset in `emitStateReset`. `startFnDetectFrames` leaves it standing, so a
  compile with only a start body read the previous compile's value on a shared instance. In base
  that frame named whatever type held `ba8TypeIdx`'s aliased counter slot. In the candidate it
  would mint a dead pair.

## The 22 bytes-only movers

Each was rebuilt alone under both seeds and the disassembly compared line by line.

* 21 differ only in `i32.const` immediates, each lowered by exactly 1. These are the union tags
  above code 13 in modules where base set `ba8Used` but no union has a `u8[]` arm.
* `tests/cases/arrays/long-literal-widths-exact.vl` is byte-identical when built alone. In the
  sweep's batch it follows `long-literal-u8-data-segment.vl`, and the base's module there carries
  that file's stale u8 push frame: four unused locals typed with aliased indices. The candidate's
  batch module equals its lone build.

## What stands

* `aUsed` and `mUsed` still gate types. `aUsed` also decides whether a frame slot holds a string
  ref or an i32 filler (`fbEmitLocalsVec`'s coalesce and atom-stage slots), so its accessor has to
  answer before those slots are written.
* `fnUsesMapVals` is also left standing across compiles by `startFnDetectFrames`. It mints nothing,
  so it was left as it is here.

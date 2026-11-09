# Step 7: the integer-keyed map probes are tail rows, and their flags are deleted

Measured 2026-11-09 on a 4-core box. The base is master `c95fbe2e`. Both seeds are fixpoints
(two `refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,753
programs. Peak RSS is VmHWM, polled from `/proc` during an unoptimised build of the plumb-shape
main unit, since this box has no `/usr/bin/time`.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,401 same; 352 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,577,493 | 6,576,559 (−934), +2.8% of the +3% bar |
| plumb-shape main / tail fuel | 8,832,285,214 / 6,404,797,332 | 8,832,284,865 / 6,404,796,983 |
| main unit build, VmHWM (two runs) | 322.0 / 322.0 MB | 322.0 / 321.8 MB |

## What moved

`__map_probe_i32__`, `__map_resize_i32__` and `__map_probe_i64__` are tail rows
(`HELP_MAP_PROBE_I32`, `HELP_MAP_RESIZE_I32`, `HELP_MAP_PROBE_I64`). `helpMapProbeI32Fn()` and
its two siblings (`emit_state.vl`) push the row on the first call, as #6922's string helpers do.
`assignSharedHelperIndices` no longer fixes them before the bodies.

After that, `mI32Used`/`mI64Used` had three kinds of reader. None needed the flag:

* `mAssignIntMapStructs` minted the keyed structs up front. It is deleted. `mapI32Ty()` and
  `mapI64Ty()` already minted on first ask.
* `mapTypeIdxOf` had two `map struct was not collected` floors. They are deleted, and the
  struct mints there.
* `mapShapeCompactable` and `mapSetRowable` gated the compaction and store rows on the flags.
  The `-4`/`-6` shapes now answer true, as `-1` does, because the helpers they name mint on
  call. `mapSetRowable` was then the same function, so it is deleted.

The setters are deleted too: `markMapKeyUsed`, `markMapI64Used`, `markSigKeyMonoMapsUsed` and
their 14 call sites in collectA#2, the frame collects and the union-atom interns.

**Probe.** No trap-on-mint build was needed for this group. Every base reader that saw an
unset flag either refused (the two floors) or called function index −1. The corpus holds no
emit reject, so a flag the candidate no longer sets could not have been read as unset by any
program that ran.

## The 352 bytes-only movers

Each mover was built alone under both seeds with `--names`, validated with `wasm-opt` (all 704
modules validate), and disassembled. Type names and numbers were then erased and the
`(type …)`/`(func …)` lines sorted.

* 213 are equal after that. The helpers moved to the tail, in first-call order, so their
  function and functype indices changed.
* 81 lose a mono integer-keyed map struct (one, in a few cases two) that nothing read. Every
  map in these programs was an mv slot's own struct, but the base minted the mono struct
  whenever the flag was set. 6 of these were checked by hand.
* 58 also lose the probe and resize helpers and their functypes (2 to 0, or 3 to 2), because
  no site called them. An i64-keyed module no longer declares `__map_probe_i32__`.

## What stands

* collectA#2 still sets nothing for the integer keys, but still runs. Its ref-list and mv row
  re-mints, union join atoms, `__array_new__` frames and field tables are the next moves.
* `mIntMonoArmUsed` is not a key flag. It lifts the map-twin tag codes, and it stands.

# A map get or has probes for the entry, not the slot, 2026-11-15

Lane P, binary size. Item 2 of the seed-size profile in `2026-11-15-size-push-grow-outline.md`,
step 1.

## The pattern

Every map op probes the index through a shared helper (`__map_probe__` for string keys,
`__map_probe_i32__` for i32 keys), which answers the probe SLOT. The site then reads the slot's
entry from the index: `index[slot]`, or `index[2·slot + 1]` in an i32-keyed pair index. Master's
seed holds 2,508 probe sites, 1,685 of them i32-keyed. Only delete and the set store read the
slot itself. Every other op (get, has, get-or and their kin) reads only the entry, which the
probe loop already holds in a local when it exits: a miss leaves 0 and a hit leaves the entry,
and the wrap-around exit traps.

## The change

Two more tail helpers, `__map_entry__` and `__map_entry_i32__`, are the same probe bodies, but
they return that entry local instead of the slot. `emitMapProbe` takes `needSlot`. Delete (via
`emitMapPrepFor`) and the set store ask for the slot. Every other op calls the entry helper and
skips the site's index read: `local.set`, the index `struct.get`, the slot arithmetic and
`array.get`. The call count is unchanged. i64-keyed maps keep the slot probe.

`-O` keeps the slot probe and the index read at the site, the shape the `SHAPE_TABLE` map rows
pin (`map-string`, `map-i32`, `word-freq` moved without it). It is a new `gOptimized` reader,
registered in `vl_opt_after_link_test.ts` and in s5-per-module-artifacts.md.

## Measurements

Base is master `a299c5d8b`'s fixpoint. The candidate is its own fixpoint (r2 == r3).

| reading | master | candidate |
| --- | ---: | ---: |
| seed | 6,466,370 B | 6,424,243 B (**−0.65%**) |
| L2 fuel | 84,959,651,574 | 84,391,477,200 (−0.67%) |
| L2 CPU, interleaved median of 16 | 32.01 s | 31.10 s |
| L2 CPU, paired ratio over 16 rounds | | median 0.970, 95% interval 0.964–0.993 (4 of 16 above 1) |
| L2 peak RSS | 4,158 MB | 4,155 MB |

The self-compile's map reads are hot, and each get now runs fewer instructions after the same
one call, so the CPU win falls outside the noise. `native-fixpoint.sh --pair` holds.

## Behaviour

Sweep of master against the candidate: 21,621 same, 3,483 bytes-only movers, 0 output movers,
0 runs lost, 0 new compiler traps. `regress.vl`: no runs lost. No test pin moved. The three `-O`
map rows moved before the `gOptimized` gate and are unmoved with it.

The rest of item 2 is the value fetch after the entry: an `if` on the entry, a read of the value
list and a miss arm. That differs by value representation and miss value (`0`, `-1`, `null`, a
default expression), so a per-shape get helper is its own step.

# Step 7: the string-keyed map struct is minted on first read

Measured 2026-11-09 on a 4-core box. The base is #6931's branch (`35faea79`). Both seeds are
fixpoints (two `refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,751
programs. Peak RSS is VmHWM, polled from `/proc` during an unoptimised build of the plumb-shape
main unit, since this box has no `/usr/bin/time`.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 20,932 same; 2,819 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,567,117 | 6,566,915 (−202), +2.7% of the +3% bar |
| plumb-shape main / tail fuel | 8,832,284,880 / 6,404,796,998 (#6931's) | 8,832,291,422 / 6,404,803,540 |
| main unit build, VmHWM (two runs) | 321.6 / 322.0 MB | 321.9 / 322.3 MB |

## What moved

`mUsed` is deleted. `mapTy()` (`emit_state.vl`) mints the string-keyed map struct on first ask,
after the types its fields name: the string list pair, the i32 list and array, and the i64
sequence array in a module that deletes. `isMapTy` is the comparison. `mapI32Ty()`/`mapI64Ty()`
mint the integer-keyed twins the same way; `mI32Used`/`mI64Used` still gate them.

* All 14 setters are gone, and so are the bodies' three `map type not collected` floors.
* `mStructIdxPre`, the map struct's index predicted from the counter, is deleted. A mono map
  ref-list element asks its key's struct (`mapTy`, `mapI32Ty`, `mapI64Ty`) inside the ref-pair
  loop, so `mAssignRefListTwins` no longer counts the distinct pairs.
* The map store helpers reserve a row per shape (−2) before the bodies and take their functype
  ordinal on first call, as their function index already did. `gMapSetTyRows` holds the rows in
  ordinal order, and the type section writes their functypes in that order. The string-keyed
  row was the one that needed the flag before the bodies.
* The delete family's compaction rows and the map walk's sequence save read `gMapDeletes` alone.
  `mapShapeCompactable(-1)` and `mapSetRowable`'s string-key arm answer true, since the struct
  mints when the helper is written.

**Probe.** Before the setters went, a scratch build kept `mUsed` and trapped (an out-of-bounds
read) whenever a map struct was minted after `mResetTypeIntern` in a module whose collect had
not set the struct's flag. Over the population it produced 0 compiler traps, and its sweep was
identical to the candidate's. The control was the same source with the setters deleted: it
traps on `const m: {[string]: i32} = Map()`, which the probe build runs. The integer-keyed
probes had no control, since their flags stand.

## The 2,819 bytes-only movers

80 movers, seeded at random, were built alone under both seeds. Their sections were compared
raw and disassembled with `wasm-dis`. All 160 modules validate with `wasm-opt`.

* 77 have 1 to 3 fewer standalone functypes, and nothing else changes. These are the map store
  functypes for rows no site called. Base reserved one for every rowable shape.
* 2 also lose 2 rec-group types: the string-keyed map struct and the list type only it named.
  Each program's maps are integer-keyed. Base minted the string-keyed struct for every map.
  Example: `tests/cases/unions/named-composition-over-recursive-alias.vl`.
* 1 (`d2648_rv3189_i32_i32_o6_join_match`) has a same-size type and function section. Its two
  map store functypes are now in first-call order, not row order.

## What stands

* `mI32Used`/`mI64Used` are still collectA#2 flags (`markMapKeyUsed`). They also gate the fixed
  helpers `__map_probe_i32__`/`__map_probe_i64__` before the bodies. Making those helpers tail
  rows would let both become `mapI32Ty`/`mapI64Ty` asks.
* The map scratch frame types its first slot by `mapTy()` whenever the function uses a map. A
  function whose maps are all integer-keyed would mint a dead string-keyed struct there. No
  mover in the sample shows it.

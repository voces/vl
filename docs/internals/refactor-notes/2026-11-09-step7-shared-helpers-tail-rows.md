# Step 7: the string and string-keyed map helpers are tail rows

Measured 2026-11-09 on a 4-core box. The base is #6918's branch merged with master `894d1d9a`.
Both seeds are fixpoints (two `refresh-compiler.sh` runs byte-identical). The population is
the sweep's 23,745 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 10,131 same; 13,614 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,568,663 | 6,568,339 (−324), +2.7% of the +3% bar |
| plumb-shape main / tail fuel | 8,975,636,030 / 6,579,647,243 (baseline) | 8,816,738,356 / 6,393,474,446 |
| main unit build, VmHWM (two runs) | 313.8 / 313.9 MB | 313.9 / 314.0 MB |

## What moved

`assignSharedHelperIndices` no longer fixes the string trio, the UTF-8 trio, `__str_bytes__`,
`__map_probe__`, `__map_resize__`, `__map_resync__` or the per-shape `__map_compact_k__`
before the bodies. Each is a tail row, as the map store and struct compare helpers already
were: `helpStrHashFn()` and its siblings (`emit_state.vl`) push the row and return its index
the first time a site calls it. A row is `TAIL_HELP + HELP_*` in `gTailFnRows`. Its body,
name and functype are written from that row: the functype after the compare helpers', in row
order. A compaction row the module reserves reads −2 until it is called.

Two gates read the old indices as facts, and now read the flags they were derived from:
`mapSetRowable` (`mUsed && aUsed`) and the walk's sequence save (`gMapDeletes && mUsed`).

## The 13,614 bytes-only movers

150 movers from `cases` and `distilled`, seeded at random, were built with `--names` under both
seeds and disassembled. Type references were replaced by a hash of their structure, since
binaryen numbers heap types by use count, and numeric function names were erased. After that,
all 150 modules are equal except for:

* A helper that no site called. The base declared it with an `unreachable` body (dead-function
  elimination had already emptied it). The candidate does not declare it.
* Function and functype indices. The helpers that are called now sit after the fixed functions,
  in first-call order, so every index after them moves. One module's `vl-src` section is one
  byte shorter for that reason.

## The multi-value test counted the dead helpers

`selfhost_native_release_multivalue_test.ts` counted a twin as a function matching
`(result \S+ \S+`. A one-result `(result (ref $1))` matches that too. In `wide-argument`,
`fresh-argument` and `fresh-argument-held`, the two "twins" it found on the base were
`__str_concat__` and `__utf8_enc__`, which no site called. The step's real twin there takes
the record's fields as parameters and returns nothing. The test now counts the dump's
functions past the plain build's. All 18 cases pass on both seeds.

## What stands

* `mUsed`, `ba8Used` and `aUsed` still gate types. No helper index is fixed by them now, so
  each can become a minting accessor. `ba8Used` is next. `uAtomBandTop` reads it to lift
  the tag bands, so it needs a union-only fact (does a union have a `u8[]` arm) first.
* `mI32Used`/`mI64Used`'s probe and resize helpers, `__f64_rem__` and the other fixed
  helpers keep their up-front indices. Their gates are not collectA#2 flags.

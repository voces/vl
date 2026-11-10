# `emitSrcSection` derives each row's anchor token once, 2026-11-10

Hotspot 5 of `2026-11-10-perf-self-build-profile.md`. Base is master `4807bea8` (#7045). Fuel is
`$VL_FUEL=1` guest fuel. CPU seconds are not used, because the box is a shared cloud VM.

The `vl-src` section asked `emitFnSpanTokIx` five times per span row: the module for the file
table, the line for the count, then the line, column and module for the write. A statement row's
answer descends `satFind`'s min-tree. The section now fills one token column first and reads the
line, column and module from it (`spanTokLine` / `spanTokCol` / `spanTokModule`, driver.vl).

`-O` drops the section, so the gated readings, which are `--names -O` and the L2 self-compile,
do not change. A `--names` build without `-O` does:

| `--names` build, no `-O` | fuel before | fuel after | Δ |
| --- | ---: | ---: | ---: |
| plumb main | 9,875,477,241 | 9,472,139,364 | −4.1% |
| plumb tail | 7,125,749,037 | 6,835,245,704 | −4.1% |
| `compiler/entry.vl` | 95,563,703,334 | 94,052,086,992 | −1.6% |

**Output is unchanged.** The seed is a byte-identical fixpoint (6,599,688 bytes). All 7,687
`tests/cases/**/*.vl` files built with `--names` give identical wasm, diagnostics and exit code
under the two seeds, and so do the three builds above.

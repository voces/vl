# `readAtomKindOfTy` is remembered per type within a registry generation, 2026-11-10

Hotspot 2 of `2026-11-10-perf-self-build-profile.md`. Base is master `4807bea8` (#7045). Fuel is
`$VL_FUEL=1` guest fuel and RSS is GNU `time`'s `%M`. CPU seconds are not used, because the box
is a shared cloud VM.

The rep layer asks `readAtomKindOfTy` once per read. When `btOfTy` answers `-2`, `boxTagOfTy`
renders the type and parses the spelling back, and that was about 6% of the L2 samples.
`readAtomKindOfTy` (emit_start_block.vl) now keeps its answer per arena index. The memo is
stamped with `tyRegGenNow` through a `MemoKey`, which `memoCompileReset` forgets at each compile, the generation over every table
the render and `btOfTy` read.

| build | fuel before | fuel after | Δ | peak RSS / peak live |
| --- | ---: | ---: | ---: | --- |
| L2 self-compile | 92,309,478,682 | 81,243,023,102 | −12.0% | 4,268 → 4,263 MB; live 979,217 → 983,162 KiB |
| plumb main (`--names -O --import-memory`) | 9,092,558,162 | 9,092,558,229 | 0.0% | 320 MB |
| plumb tail | 6,589,874,353 | 6,589,874,420 | 0.0% | 318 MB |

The saving overlaps with `2026-11-10-perf-nul-unit-read-filter.md`'s, because the reads that
change skips are some of the same reads this one memoizes. Whichever lands second will read less
than this table.

**Output is unchanged.** The seed is a byte-identical fixpoint (6,599,968 bytes), and all 7,687
`tests/cases/**/*.vl` files build to identical wasm, diagnostics and exit code under the two seeds.
The `cases_wasm` shards pass on one compiler instance that compiles case after case, which
exercises the per-compile reset.

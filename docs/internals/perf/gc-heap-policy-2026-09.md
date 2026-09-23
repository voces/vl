# The user program's GC heap policy, 2026-09-23

`vl run` now starts the user program's GC heap at **256 MiB** (was 64 MiB, #3022), `$VL_GC_HEAP`
overrides it, and `vl run --batch` and `vl test` keep their smaller heaps. This document records what
wasmtime 47 lets a host control, what each available policy costs, and why the fixed size won over an
adaptive one. The upstream fix is drafted in `wasmtime-copying-heap-growth-issue.md` beside this file.

Background: `decode-bench-gap-2026-09.md` §3 row A1 attributes ~45% of plumb's decoder gap to
wasmtime's copying collector re-copying a live set that stays alive for the whole run. That live set
turns out to be **5.6 MB** (measured below), about 17% of a 64 MiB heap's 32 MiB semispace.

## 1 · What wasmtime 47.0.2 exposes

Read from the pinned crate's source (`wasmtime-47.0.2`, `src/config.rs`, `src/runtime/store/gc.rs`,
`src/runtime/vm/gc.rs`, `src/runtime/vm/gc/enabled/copying.rs`).

| knob | what it does | useful here? |
| --- | --- | --- |
| `Config::collector(Collector)` | `Auto` (= `Copying` today), `Copying`, `DeferredReferenceCounting`, `Null` | measured below: DRC is 80× slower on the decoder, null commits 2 GB |
| `Config::gc_heap_initial_size(bytes)` | the store's first heap size; the heap still grows past it on demand | **yes, the only sizing lever** |
| `Config::gc_heap_reservation`, `_guard_size`, `_reservation_for_growth`, `_may_move` | virtual-memory layout: how far the heap can grow in place | no, they say nothing about when it grows |
| `Store::gc(None)` | collect now | no, it only collects |
| `Store::gc(Some(&GcHeapOutOfMemory))` | collect, then grow if the named allocation still does not fit | not usable: `GcHeapOutOfMemory::new` is `pub(crate)`, so a host can only pass one it received from a failed allocation |
| `Store::gc_heap_capacity()` | current heap size in bytes | on `Store` only, not on `StoreContextMut`, so not inside a callback |
| `ResourceLimiter::memory_growing` | consulted when the GC heap's memory grows | veto only; it cannot start or enlarge a growth |
| `Config::total_gc_heaps` | pooling-allocator slot count | no |
| collection statistics | **none public**. The post-collection live size (`GcStore::last_post_gc_allocated_bytes`) is crate-private and appears only in `log::trace!` output | the stats counter (`$VL_GC_STATS`) already scrapes that log |
| a growth policy, a GC callback, or a "grow when survivors exceed X%" knob | **none** | — |

**The growth rule itself** (`should_collect_first` and `collect_and_maybe_grow_gc_heap`): when an
allocation fails, wasmtime collects first unless `last_live + bytes_needed >= capacity / 2`, and after
a collection it grows only if the request still does not fit. `capacity` is the WHOLE heap
(`heap_slice().len()`), while the copying collector allocates in one half of it. So for the copying
collector the grow-first branch is reached only when the live set nearly fills a semispace, and a live
set at any fraction below that is re-copied at every collection for the rest of the run. That is the
upstream bug, and the reason no host-side sizing can be adaptive without a hook wasmtime does not have.

## 2 · Options, measured

Box: 24 cores, WSL2, load 3–17. `/usr/bin/time` user CPU, wall and max RSS; collections from
`$VL_GC_STATS=1`. Rows were interleaved within each round and the figures are medians of 3–6 rounds.
Every run printed the benchmark's expected output line.

**plumb `decode-bench` (6,964,856 instructions per pass; a copy under scratch, run as a prebuilt
`.wasm`):**

| initial heap | 1 pass: CPU / wall | 3 passes: CPU | collections (1 / 3 passes) | max RSS |
| --- | --- | --- | --- | --- |
| 0 (before #3022; one run, cold module cache) | 4.12 / 3.67 | — | 943 / — | 206 MB |
| 64 MiB (before this change) | 0.86 / 0.85 | 2.60 | 89 / 269 | 117 MB |
| 128 MiB | 0.74 / 0.75 | 2.16 | 40 / 122 | 183 MB |
| 192 MiB | 0.69 / 0.73 | 2.02 | 26 / 79 | 248 MB |
| **256 MiB (chosen)** | **0.68 / 0.73** | **1.92** | **19 / 58** | **314 MB** |
| 384 MiB | — | 1.93 | — / 38 | 444 MB |
| 512 MiB | 1.45 (one run) | 1.93 | 9 / 28 | 576 MB |
| DRC collector (`VL_GC=refcount`) | 121 / 126 | — | — | 261 MB |
| null collector (`VL_GC=none`) | 1.79 / 2.30 | — | 0 | 2,037 MB |

CPU stops falling at 256 MiB: 1 pass −21% CPU and −14% wall against 64 MiB, 3 passes −26% CPU.
The peak live set is 5.6 MB throughout.

**Other programs** (`bench/collections/live-set-churn` is the #3040 guard bench; `tiny` is the same
program with a 1,000-struct live set and 20 M allocations; `mid` allocates 2 M; `hello` prints once):

| program | 64 MiB: CPU / wall / RSS / collections | 128 MiB | 256 MiB |
| --- | --- | --- | --- |
| live-set-churn (50 k live, 75 M allocations) | 0.32 / 0.32 / 73 MB / 75 | 0.29 / 0.31 / 139 MB / 36 | 0.26 / 0.33 / 270 MB / 18 |
| tiny (1 k live, 20 M allocations) | 0.07 / 0.08 / 73 MB / 19 | 0.06 / 0.09 / 139 MB / 9 | 0.06 / 0.12–0.14 / 270 MB / 4 |
| mid (2 M allocations) | 0.00 / 0.02 / 70 MB / 1 | 0.00 / 0.02 / 70 MB / 0 | 0.00 / 0.02 / 70 MB / 0 |
| hello | 0.00 / 0.00 / 7.6 MB / 0 | same | same |
| `vl run --batch`, 40 small + 8 tiny-shaped cases | 0.75 / 0.87 / 94 MB | — | 0.75 / 1.26 / 291 MB |

The price of a larger heap is the memory a program touches, never its live set. A program that
allocates less than the heap in total pays nothing (`mid`, `hello`). One that allocates more commits
the whole heap and pays the page faults on it: about 40 ms of system time for 256 MiB, which is +50% wall
on `tiny` and +45% on the batch, where every heavy case faults a fresh store's heap.

**`vl test`** (12 files that each allocate 5 M structs, one worker per core): 134–135 MB before and
after, because the test engine's 8 MiB is unchanged. `VL_GC_HEAP=64M` on the same run gives 823 MB,
which is why the per-worker size stays small.

**Adaptive growth (prototype, not landed).** With no public hook, the only way a host can grow the
heap mid-run is a periodic callback that holds the store: epoch interruption with a ticker thread,
the post-collection live size scraped from wasmtime's trace log, and a host-side "balloon" allocation
sized so wasmtime's heuristic takes its grow-first branch (a request larger than the semispace makes
it grow without filling the balloon). It worked mechanically. The collection count fell to 40 on the
3-pass decode. But epoch interruption alone costs **+11% CPU at 64 MiB (2.83 vs 2.55, 3 rounds) and +16% at
256 MiB (2.35 vs 2.02, one run)**, since the decoder's hot path is small functions and every entry and loop
header gains a check. The prototype with growth at 6% survivors ran at 3.9–4.0 s, slower than a
plain 64 MiB heap (the part of that beyond the epoch tax was not chased). The prototype's diff is not
in the tree. It also rests on the text of a trace message and on the process-global logger. It
was rejected.

## 3 · The policy

| path | initial heap | why |
| --- | --- | --- |
| `vl run <file>` (source or prebuilt `.wasm`) | **256 MiB** | one store per process; the knee of the decode curve, and a program that allocates less pays nothing |
| `vl run --batch` | 64 MiB (unchanged) | a fresh store per case, so each heavy case faults its own heap: +45% wall at 256 MiB |
| `vl test` | 8 MiB per worker (unchanged) | one store per worker times one worker per core |
| any of them, under `$VL_GC_HEAP` | the value given | `64M` for a memory-tight run, `1G` for a bigger live set; bytes or a `K`/`M`/`G` suffix, at most 4G, and a bad value is a hard error |

The heap size is part of the engine's compatibility hash, so `vl run` and `vl test` keep separate
compiled-module cache entries (as they did at 64 MiB/8 MiB). A `$VL_GC_HEAP` override gets its own
entry too, compiled once.

**Guarded by** `tests/vl_gc_heap_shape_test.ts`. A 400,000-struct live set with 12 M allocations
collects 222 / 20 / 7 / 3 times at 0 / 64 / 128 / 256 MiB (deterministic). The default must collect 1
to 5 times, `VL_GC_HEAP=64M` must collect at least 3× as often as the default, and an unparsable value
must fail. Checked both ways: the master binary (64 MiB, no override) fails the first assertion with 20.

**When to revisit.** When wasmtime grows a copying heap by the live set's share of a semispace
(the upstream issue), the default can come back down to 64 MiB or below, and the RSS price goes with
it. A generational or mark-region collector upstream would change the whole table.

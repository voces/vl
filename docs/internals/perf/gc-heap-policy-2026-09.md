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
| `Store::gc_heap_capacity()`, `Caller::gc_heap_capacity()` | current heap size in bytes | not on `StoreContext`/`StoreContextMut`, so not reachable from an epoch callback (a `Caller` exists only inside a host import) |
| `ResourceLimiter::memory_growing` | consulted when the GC heap's memory grows | veto only; it cannot start or enlarge a growth |
| `Config::total_gc_heaps` | pooling-allocator slot count | no |
| collection statistics | **none public**. The post-collection live size (`GcStore::last_post_gc_allocated_bytes`) is crate-private and appears only in `log::trace!` output | the stats counter (`$VL_GC_STATS`) already scrapes that log |
| a growth policy, a GC callback, or a "grow when survivors exceed X%" knob | **none** | — |

**The growth rule itself** (`retry_after_gc_async` and `should_collect_first`): when an allocation
fails, wasmtime collects first unless `last_live + bytes_needed >= capacity / 2`. That collection
never grows the heap. Growth comes only if the retried allocation still fails. `capacity` is the WHOLE
heap (`heap_slice().len()`), while the copying collector allocates in one half of it, so the
grow-first branch is reached only when the live set nearly fills a semispace. In practice the heap
grows only when a collection frees less than the pending allocation. A live set at any fraction below
that is re-copied at every collection for the rest of the run. That is the
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

**Under a memory cap.** A cgroup counts committed memory, so the same program is killed where it
used to run. `tiny` under `systemd-run --scope -p MemoryMax=200M -p MemorySwapMax=0`, and again at
`256M`: rc 137 (OOM-killed) at `VL_GC_HEAP=256M`, `sum 2052959872` at `64M`. The remedy is
`VL_GC_HEAP=64M`, which `vl help run` names. Follow-up, not built: cap the default at a fraction of
the cgroup limit (`/sys/fs/cgroup/memory.max`) when one is set.

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
| any of them, under `$VL_GC_HEAP` | the value given | `64M` for a memory-capped container or a memory-tight run, `1G` for a bigger live set; bytes or a `K`/`M`/`G` suffix, at most 4G, and a bad or non-UTF-8 value is a hard error |

The heap size is part of the engine's compatibility hash, so `vl run` and `vl test` keep separate
compiled-module cache entries (as they did at 64 MiB/8 MiB). A `$VL_GC_HEAP` override gets its own
entry too, compiled once.

**Guarded by** `tests/vl_gc_heap_shape_test.ts`. A 400,000-struct live set with 12 M allocations
collects 222 / 20 / 7 / 3 times at 0 / 64 / 128 / 256 MiB (deterministic). The default must collect 1
to 10 times (loose, so an object-size change cannot red it), `VL_GC_HEAP=64M` must collect at least 3× as often as the default, and an unparsable value
must fail. Checked both ways: the master binary (64 MiB, no override) fails the first assertion with 20.

**When to revisit.** When wasmtime grows a copying heap by the live set's share of a semispace
(the upstream issue), the default can come back down to 64 MiB or below, and the RSS price goes with
it. A generational or mark-region collector upstream would change the whole table.

## 4 · The seed's headroom, 2026-10-18

The compiler seed's store has a different shape from a user program's: one store, a live set of
0.5–0.6 GB for `compiler/entry.vl`, and a 256 MiB first heap that doubles. wasmtime 49's copying
collector grows only when one request cannot fit after a collection (`should_collect_first` is
`last_post_gc + bytes_needed < semispace`). So a live set just under a semispace never grows the
heap. It collects every few KiB allocated. #4066's seed showed it: its live set left about 11 KiB
of a 512 MiB semispace free, and `vl check compiler/entry.vl` went from 29 s to 61 s of CPU.

**The policy** (`SeedGcHeadroom`, `scripts/vl-host/src/main.rs`):

1. After any collection that leaves more than **75%** of a semispace live, the seed doubles its
   heap. That covers every copying seed store: `vl build`, the CLI pump (`vl check`, `vl fmt`,
   `vl test`'s compile) and the compile phase of `vl run`.
2. The mechanism is §2's rejected prototype, run on the seed alone:
   * epoch interruption, ticked every 10 ms by one clock thread;
   * the live size after each collection, read from wasmtime's trace log;
   * a garbage i8 array of `semispace − live + 1 MiB`. It cannot fit, and with the live set it
     is at least a semispace, so wasmtime takes its grow-first branch. The array dies at the
     next collection.
3. It stops at the 4 GiB cap. `$VL_COMPILE_GC_GROW=<1..99>|off` is a measurement knob.

It depends on wasmtime 49's predicate and on the text of three trace messages
(`GC_LOG_TARGETS`). A wasmtime bump that changes either turns the policy into a no-op, so
collections climb again but output does not change. `VL_GC_STATS=1` prints the count on
`vl build` and on the pump.

**Measured** on a 24-thread WSL box under shared load (4–18). Collections come from
`VL_GC_STATS=1`; the master host prints none for `vl check`. Every output is byte-identical to
the master host's: the check text and the L2 module. "#4066" is that PR's seed at `669547021`.

`vl check compiler/entry.vl`, warm cache:

| host | seed | CPU s | peak RSS | collections |
| --- | --- | --- | --- | --- |
| master | master | 44.7, 32.6 | 2.16 GB | (144 with the policy off) |
| master | #4066 | 121.6, 112.6 | 2.16 GB | (540 with the policy off) |
| this | master | 10.5, 12.6 | 2.16 GB | 18 |
| this | #4066 | 10.2, 11.7 | 2.16 GB | 15 |

`vl build compiler/entry.vl` (the L2 self-compile, master source):

| host | seed | CPU s | peak RSS | collections |
| --- | --- | --- | --- | --- |
| master | master | 65.9 | 2.17 GB | 264 |
| master | #4066 | 34.8 | 1.12 GB | 120 |
| this | master | 25.4 | 2.17 GB | 27 |
| this | #4066 | 22.6 | 2.17 GB | 22 |

`vl check compiler/` (master seed; #4066's seed in brackets):

| host | CPU s | wall s | peak RSS | collections |
| --- | --- | --- | --- | --- |
| master | 219.7, 330.9, 234.7 (312.7) | 114, 177, 124 (162) | 4.26 GB | — |
| this | 234.6, 240.2, 244.3 (204.8) | 122, 130, 128 (109) | 4.26 GB | 228, 249, 248 (189) |
| this, policy off | 272.8, 253.7 | 144, 133 | 4.26 GB | 569, 567 |

That walk's heap reaches the 4 GiB cap either way, with the live set at about 28% of the
semispace, so the policy has nothing to grow there.

**Prices:**

* **RSS.** The #4066 seed's L2 build goes from 1.12 to 2.17 GB. Its old run sat on a 1 GiB heap
  and collected 120 times. Every other row keeps its peak.
* **Threshold.** 75% was chosen from a sweep. At 50% the master seed grew to the 4 GiB heap at
  565 MB live: entry.vl peaked at 4.26 GB, and at 2.88 GB on the #4066 seed. At 90% it collected
  23 and 20 times, for 13.3 and 12.9 s.
* **The epoch check.** It is now compiled into every seed function. Two readings were taken
  with collection held equal, policy off, same heap:
  * `vl build` of the 2 MB plumb unit: 1.88, 1.95, 1.92 s on the master host and 1.99, 1.87,
    1.87 s here;
  * entry.vl at a 4 GiB first heap (3 collections): 9.1 and 8.9 s against 10.1 and 10.2 s at
    load 8, and at load 12 it overlapped (9.3–16.9 against 11.5–17.1).
  
  So the tax is between nothing and about 12%, and this box cannot resolve it. The
  `compiler/` medians, 234.7 against 240.2, are within that.
* **The alternative.** A fixed 2 GiB first heap on the master host, with no epoch, gave entry.vl
  11.2 and 13.0 s at 2.16 GB on the two seeds. That matches the policy on today's sizes. But
  it is a guess at one live set, and a 2 MB unit that allocates past 256 MiB would commit the
  larger heap: the plumb unit's live set is 75–105 MB, about 50 bytes per source byte, and its
  peak RSS is gated at +10%. The plumb units are unchanged under the policy: 327 MB against
  325 MB, the same modules, 12 collections against 14.

**Guarded by** nothing new that reads collections on the seed. `tests/vl_gc_heap_shape_test.ts`
still holds the user-program heap, and `scripts/self-compile-time.sh` holds L2 fuel, which
collections do not touch. Follow-up, not built: a seed-side collection bound like the one
`vl_gc_heap_shape_test.ts` puts on `vl run`.

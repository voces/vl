# Performance program — CI, compiler, tools

Measured 2026-07-29 on master `883dca44`. Two questions were asked: why has CI
crept back to ~1:45, and where does the compiler's own time and memory go. They
have **different answers and almost disjoint fixes**, which is the first finding:

- **CI wall clock is not compiler speed.** `ci-native`'s critical path is
  dominated by cache restores, a cargo build nothing downstream consumes, and
  ~1,600 serial process spawns. The self-compile itself is 9 s of an 89 s job. A
  compiler 10% faster would move CI by under a second.
- **The compiler's own cost is the STRING layer, and it is not flat-able.** 33.6%
  of a self-compile is string primitives and string-keyed probes; VL's `string` is
  `(array (mut i32))`, a GC array at 4 bytes per code point. `flat` records
  (P1.2) are a *declaration* feature over linear memory and do not touch it.

Numbers below are reproducible; each headline names its probe.

---

## 1. CI forensics

### 1.1 Method

`gh api` over every `master`-push run of the `CI` workflow since the repo's first
(2026-06-05): **1,317 runs enumerated, 1,308 with job data, 2,333 successful
jobs**, with per-STEP start/end timestamps. (The list endpoint caps a query at
1,000 results, so the window is fetched in two passes split on `created`.) Runs
where the docs-only gate skipped the heavy steps are excluded ("FULL runs"),
leaving **977 `ci-native`** and **1,239 `ci`**. All figures are medians of
FULL successful runs unless stated. Every job in the window ran on
`ubuntu-latest` — **no runner-hardware change is in this data**.

### 1.2 The current 89 s, decomposed

Last 30 FULL master-push `ci-native` runs (07-28 → 07-29): job **p50 89 s, p90
106 s, max 107 s** — the "1:45 territory" is the p90.

| step | median s | share |
| --- | ---: | ---: |
| Native binary suites (corpus alignment, build -O, vl CLI) | 27 | 30% |
| Cache cargo + vl-host target (restore ~1.2 GB) | 17 | 19% |
| Verify embedded-seed build (`cargo build --features embed-seed`) | 15 | 17% |
| Refresh seed + native fixpoint (the self-compile + ladder) | 9 | 10% |
| `actions/checkout` | 4 | 4% |
| Editor features on the wasm compiler | 3 | 3% |
| Corpus oracle on the wasm compiler | 3 | 3% |
| `setup-deno` | 2 | 2% |
| set-up + 4 cache steps + post-steps | ~5 | 6% |
| **sum of step medians** | **85** | |

The `ci` job is **not** a lever: p50 22–24 s, no step over 5 s. Note its
`Test (.vl corpus)` step is 1–2 s — every seed-backed test self-ignores there (no
seed in that job), which is why `ci-native` carries the corpus.

### 1.3 The creep, attributed

`ci-native` p50 by day (FULL master-push runs):

| period | p50 | what changed |
| --- | ---: | --- |
| 06-13 → 06-17 | 75–88 s | the job was: build host → refresh seed → fixpoint. Nothing else. |
| 06-18 | 130 s | **self-lint added as a serial step** (42 → 54 s over the following weeks) |
| 06-19 → 07-08 | 138 → 194 s | + native binary suites (17 → 26 s); + the pinned-seed **rep-fuzz check (~85 s)** |
| 07-19 → 07-21 | 181–185 s | steady state |
| 07-22 | **117 s** | #972 dropped the rep-fuzz check from CI (its findings live as entombed tests) |
| 07-23 → 07-24 | 110–113 s | self-lint moved to a backgrounded step (0 s on the critical path) |
| 07-25 | **78 s** | #1090's `.cwasm` fix: refresh+fixpoint 35 → 7 s, native suites 24 → 9 s |
| 07-26 → 07-27 | 70–74 s | the floor |
| 07-28 | 82 s | |
| 07-29 | 89 s (p90 106) | **#1216 put the WHOLE corpus in the native-align gate** |

**Top 3 growth contributors, with numbers:**

1. **Native binary suites: 10 s → 27 s (+17 s).** Two causes, both deliberate.
   #1216 (07-27) replaced the align gate's opt-IN whitelist (343 of ~1,170 cases)
   with discovery over the whole corpus; and the corpus itself grew **1,306 →
   1,705 cases in four days** (07-25 → 07-29). This is coverage the project wants;
   the fix is to stop paying for it serially (§1.4).
2. **Cache cargo + vl-host target: 6 s (June) → 17 s.** Pure cache growth — the
   ~1.2 GB target dir's restore scaled with wasmtime. It peaked at 22 s on 07-25.
3. **Verify embedded-seed build: 3 s (June) → 15 s.** A `cargo build --release
   --features embed-seed` that runs on EVERY push: `build.rs` declares
   `rerun-if-changed` on the seed, which the refresh step rewrites earlier in the
   same job, so the crate rebuild + link is never cached away.

**Correlations tested and REJECTED as causes:** runner hardware (constant
`ubuntu-latest` throughout); compiler binary growth (1.05 → 1.11 MB is 6% and the
self-compile step *fell* 34 → 9 s over the window); seed fetch (1 s, cached);
cargo build (skipped on 97.9% of runs, see below); checkout (2 → 4 s).

### 1.4 Cache hit rates

| cache | hit rate / cost | evidence |
| --- | --- | --- |
| `vl-bin` (the finished `vl`) | **97.9%** (377/385 FULL runs since 07-15) | "Build vl-host (native tool)" registers `skipped` |
| cargo + target dir | effectively always (restore 17 s, post-save 0–1 s) | a save would show in the Post step |
| seed pair | exact on most runs; p50 10 s / **p90 36 s / max 42 s** for refresh+fixpoint | a restore-keys (stale-seed) hit climbs extra ladder rungs |
| Deno modules | 1 s | |

The `vl-bin` number is the load-bearing one: **on 97.9% of runs nothing in
`ci-native` runs cargo at all**, yet the job restored a 1.2 GB target dir anyway —
because the embedded-seed step at the end was its only consumer.

### 1.5 What shipped (this PR)

Both changes leave the compiler **byte-identical** (`git diff master` touches only
`.github/` and `tests/`; the branch-built compiler `cmp`s equal to the seed built
from master source, 1,111,882 bytes).

**(a) `ci-embed-seed` — a third parallel job.** The distribution build moves out of
`ci-native`. It asserts exactly what it asserted before (the `--features
embed-seed` crate compiles, the binary runs with no on-disk seed, its Cranelift
cache materializes and is reused) against a cached-or-fetched seed rather than the
freshly refreshed one — every one of those assertions is about the distribution
*mechanism*, and the seed's own correctness is proven by the fixpoint ladder in
`ci-native`, which is where that gate belongs.

**(b) The cargo/target restore is gated on the `vl-bin` cache missing.** The binary
cache is now restored FIRST; on a hit, `ci-native` runs no cargo and skips the
1.2 GB download. Cold paths are unchanged: any input that busts the cargo key
(rustc, `Cargo.lock`, `Cargo.toml`) also busts the `vl-bin` key, so the miss path
restores, builds and saves exactly as before. `ci-embed-seed` restores that cache
**restore-only**, so it can never write a `--features embed-seed` target dir under
the shared key.

**Expected:** −32 s from `ci-native`'s critical path (17 + 15). Measured in §1.5.1.

**(c) The native-align suite's `vl check` legs are pooled.** Deno runs the tests in
one file sequentially, so an awaited spawn per case was a strictly serial chain of
**1,618 `vl check` processes**, each paying process + wasmtime engine + seed
`.cwasm` deserialize (~6 ms) before compiling anything. That chain, not the
compiling, was the step's cost. The spawns now go through a bounded gate
(`min(cores, 8)`) and are prefetched from the existing setup fixture; each test
still awaits its OWN memoized result, with the same command, environment and
assertion.

**Measured, interleaved min-of-3 on a quiet box** (`SELFHOST_NATIVE_ALIGN=1 deno
test --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts`, `.cwasm`
warm):

| | run 1 | run 2 | run 3 | verdict |
| --- | ---: | ---: | ---: | --- |
| master | 13,717 ms | 13,084 ms | 14,159 ms | 1,797 passed / 0 failed |
| pooled | 4,763 ms | 4,640 ms | 4,739 ms | 1,797 passed / 0 failed |

**2.8× on a 24-core box.** On the 4-core CI runner the ceiling is lower. I
predicted 27 s → ~10–12 s from this; §1.5.1 measured 15–21 s over four runs. Recorded as a miss:
a local speedup does not transfer, and four cores plus the still-serial
`vl run --batch` waves ahead of the pool are the reason.

### 1.5.1 What the runner actually did

Four runs on the real 4-core runner (PR #1311, runs `30478660499`, `30479027419`,
`30479227774`, `30479647563`):

| job | run 1 | run 2 | run 3 | run 4 | notable steps |
| --- | ---: | ---: | ---: | ---: | --- |
| `ci` | 20 s | 22 s | 22 s | 17 s | unchanged |
| **`ci-native`** | **42 s** | **50 s** | **49 s** | **44 s** | native suites **19 / 20 / 21 / 15 s** (was 27); cargo+target restore **skipped** all four; embed build gone |
| `ci-embed-seed` | 74 s | 43 s | 42 s | 46 s | restore 16–17 s + `cargo build --features embed-seed` **48 / 16 / 19 / 7 s** |

**`ci-native` 89 s p50 → 42–50 s** (median 46). The gate that blocks a merge
decision is back under a minute, and the workflow's WALL CLOCK (the max over the
three jobs) is 89 → ~50 s.

Note the spread on this fleet: the same `cargo build` reads 7–48 s across four
runs, and the native-suites step 15–21 s. **Any CI step-level claim here needs
several samples**; a single reading cannot distinguish a change from the runner.

**Runs 2 and 3 corrected run 1, and the correction is the point.** On run 1 the
embed job's `cargo build` read 42.58 s and I filed `ci-embed-seed` as the new
critical path with a structural cause attached (`build.rs` emits
`cargo:rustc-env=VL_SEED_KEY=<hash of the seed>`, so a changed seed invalidates
the crate fingerprint every push). Runs 2 and 3 read **16 s and 19 s** for the
same build — in line with the 15 s median it had inside `ci-native`, and with the
13.77 s master reading I had called "variance or something not yet found". It was
variance. The `VL_SEED_KEY` recompile is real and does happen every push; it is
~17 s, not ~48 s, and it does not make this job the critical path. **One
observation was enough to name a cause and not enough to size it** — which is why
item 8 of §3 demands several samples before anyone acts on it.

**The one qualification that survived both samples: the pooling gave −8 s on CI,
not the −15 s the local 2.8× predicted** (27 → 19/20 s). Four cores cap it, and
the `vl run --batch` waves are still serial ahead of the pool. A local number is
not a CI number.

### 1.6 Gate

Fresh `scripts/fetch-seed.sh`; `refresh-compiler.sh --prove-fixpoint` (the seed IS
the fixpoint, 1 compile); `native-fixpoint.sh` (stage3 == stage4, 1,111,882
bytes); `SELFHOST_NATIVE_ALIGN=1 deno task test` → **3,594 passed / 0 failed / 7
ignored**, the ignored set identical to master's (all seven in
`cases_wasm_test.ts`); `lint-self.sh` clean; `rep-fuzz-check.sh` exact (1
baselined, 0 new, 0 stale).

**Corpus A/B and fuzz A/B are VACUOUS here and are reported as such rather than
banked as green:** they compare two compilers, and this branch builds a
`cmp`-identical one. Running them would profile the same binary twice (the trap
recorded as method note 14 in the profiling memory).

**The test change is sabotage-verified, and the two halves of its memo key do not
verify the same way.** Collapsing the key so every case reads one shared result
reddens the suite loudly (260 of 1,646 fail). Collapsing it to drop the
`--codegen` flag stays GREEN — not a hole, but a property of the tier partition
(a case lands in exactly one tier, so no case is ever checked both ways). The flag
stays in the key because it makes the memo correct rather than accidentally
correct; the comment in the file says so, so nobody deletes it on a green run.

---

## 2. The compiler profile, re-baselined

Guest sampling profiler (`VL_PROFILE_GUEST`) — this runs under **wasmtime**, so its
self-% shares are NATIVE shares, not V8's. Recipe:

```sh
vl build compiler/entry.vl --compiler build/vl-compiler.wasm --names -o named.wasm
# warm named.wasm's .cwasm sidecar once, then:
VL_PROFILE_GUEST=prof$i.json vl build compiler/entry.vl --compiler named.wasm -o /dev/null
```

Six warm runs aggregated, **13,452 samples**, `$mNN` module suffixes stripped.

| % self | % incl | fn | note |
| ---: | ---: | --- | --- |
| 25.19 | 25.19 | `__str_eq__` | |
| 4.82 | 4.82 | `fnStmtsPosOf` | linear scan of `fnStmts`, then `monoOrigNode` |
| 4.75 | 4.75 | `__str_hash__` | 4.64 of it under `__map_probe__` |
| 4.71 | 4.80 | `nameNamesFunction` | scans the WHOLE node arena per call |
| 4.56 | 4.56 | `modSrcPush` | one host call per source code point |
| 2.62 | 7.50 | `tokenize` | |
| 2.62 | 11.13 | `__map_probe__` | string-keyed map probe |
| 2.17 | 2.17 | `tyTopIndexOf` | |
| 1.19 | 1.19 | `peek` | |
| 1.02 | 4.64 | `capScan` | |
| 1.01 | 1.01 | `daSnapshot` | definite-assignment snapshot per function |
| 1.00 | 1.00 | `__str_concat__` | |
| 0.98 | 2.59 | `modRenamed` | |
| 0.97 | 0.97 | `advance` | |
| 0.90 | 0.90 | `rbyteAt` | one host call per EMITTED byte |
| 0.75 | 0.75 | `wU8` | |
| 0.73 | 0.73 | `mkTok` | |
| 0.71 | 4.51 | `vcLoadToks` | |
| 0.68 | 1.87 | `capIsBound` | |
| 0.67 | 5.56 | `vcLoadToksMod` | |

**Delta vs the last recorded baseline** (master `8d2471e`, post-D-RET/leg-C): the
cost centre has **not** moved. `__str_eq__` 25.93 → 25.19, `__str_hash__` 5.33 →
4.75, `__str_concat__` 1.01 → 1.00, `fnStmtsPosOf` 4.17 → 4.82, `modSrcPush` 4.88
→ 4.56. The destringify slices that landed since are correctness work and read as
such: **~0% of runtime moved.** That is the standing correction restated with
fresh numbers, not a new finding.

**The identifier-interning arc, re-derived.** Splitting `__str_eq__`'s 25.19% by
the class of thing its caller is comparing (probing one frame up through
`__map_probe__` to its own caller):

| consumer class | share of all samples |
| --- | ---: |
| **SYMBOL / IDENTIFIER** (scope slots, capture tables, module rename tables, struct FIELD names, function/global index maps, keyword classification) | **19.10%** |
| TYPE names (variant/struct index, rep-tree spellings, literal-union aliases) | 6.08% |

Top symbol-side consumers: `modRenamed` 1.26, `capIsBound` 1.18,
`__map_probe__<fnIndexOf>` 1.01, `__map_probe__<globalIndexOf>` 0.88,
`paramTypeNode` 0.76, `scopeSlotOf` 0.69, `objFieldType` 0.67, `keywordKind` 0.66,
`exportSlotOfTarget` 0.62, `declaredSlotOf` 0.62. The memory file's 21.49/4.44
split re-derives to 19.10/6.08 — the classification boundary moved slightly, the
conclusion did not: **interning identifiers to i32 symbol IDs is still the largest
single compiler-side arc, and it is a different layer from the destringify (type)
program.**

### 2.1 Allocation census

**Whole-program volume (the honest headline).** `vl` runs the compile engine under
the NULL collector — nothing is ever reclaimed — so peak RSS *is* total allocated,
to page granularity. Per-process `wait4` rusage, min of N, quiet box:

| workload | wall | peak RSS |
| --- | ---: | ---: |
| `vl build tiny.vl` (seed-load floor) | 6 ms | **16.3 MB** |
| `vl build compiler/entry.vl` (self-compile) | 1,950 ms | **510.8 MB** |
| `vl check compiler/entry.vl` | 969 ms | **649.5 MB** |

**~0.5 GB of never-freed GC heap to compile `compiler/*.vl` — 100,238 lines /
4.56 MB — i.e. ~5 KB of heap per source LINE, or ~112 bytes of heap per source
BYTE.**
And `vl check` allocates *more* than `vl build` while doing less work, which is
itself a filed lead (§3, item 6).

**Static census by heap type** (`wasm-tools print` over the compiler binary; 4,748
allocation instructions across 645 functions):

| n | opcode | heap type | what it is |
| ---: | --- | --- | --- |
| 2,573 | `array.new_fixed` | `(array (mut i32))` | a literal of the shape a **string** takes — VL's `string` and its `i32[]` share this heap type, and the compiler's literals are overwhelmingly strings |
| 1,693 | `array.new_default` | `(array (mut i32))` / `(array (ref null …))` | list backing (growth) |
| 1,560 | `struct.new` | `{backing, len, cap}` | the list wrapper |
| 1,205 | — | `(array (ref null (array (mut i32))))` + wrapper | `string[]` backing and its wrapper |

**The structural finding: VL's `string` is `(array (mut i32))` — 4 bytes per code
point.** That single fact explains the whole top of the profile. `__str_eq__` at
25% is an element-wise compare over 4× the bytes ASCII needs; `__str_hash__`
likewise; the compiler's own 4.6 MB of source becomes an 18 MB i32 array before it
is a string. `memory-gc-design.md` §2.2 already records the trade (i8/UTF-8 is 4×
denser and strictly *less* scannable under WasmGC's no-SIMD/no-reinterpret rules)
and it is not re-opened here.

The two hottest allocation-weighted functions by static site count × self-time are
`tokenize` (24 sites, 2.62% self) and `capScan` (10 sites, 1.02% self); after that
the census is diffuse. **There is no single allocation hotspot to cut** — the
volume is the string representation and the per-push list growth, not one
mis-written table.

### 2.2 The `flat` records lever — verdict: not the compiler's lever, and the real one is next door

The hypothesis was that `flat` record layouts (P1.2) could cut the compiler's GC
over-allocation. Measured, it does not, for two independent reasons:

1. **`flat` is a declaration feature.** Per `flat-records-design.md` §0 it ships as
   checker-side validation plus a constant fold of `T.size` / `T.field`; **zero
   emitter lines**, and a `flat type` emits byte-identically to the same
   declaration without it. Nothing is stored flat by declaring it flat. Storing a
   table flat means hand-writing `__load_i32__`/`__store_i32__` accessors over
   `std:buffer` — and there is no `__store_i8__`/`__store_i16__` at all
   (`memory-gc-design.md` §1.2), so a packed row cannot even be written.
2. **It would target the smaller half.** The flat-able surface in the compiler is
   the fixed-width i32 sidecar tables. Their readers total ~10% of self-time
   (`fnStmtsPosOf` 4.82, `tyTopIndexOf` 2.17, `capScan` 1.02, `daSnapshot` 1.01,
   `pushScope` 0.22, …). The string layer — `__str_eq__` 25.19 + `__str_hash__`
   4.75 + `__map_probe__` 2.62 + `__str_concat__` 1.00 = **33.6%** — is 3× larger
   and is NOT flat-able: moving strings to linear memory is the write-our-own-GC
   project that `memory-gc-design.md` §3 evaluates and rejects.

**But the owner's instinct points at a real, adjacent, already-designed win.** The
flat/linear-memory tier's payoff in the compiler is not record layouts, it is the
**host↔guest byte staging**:

- `modSrcPush` is **4.56% self, the 5th hottest function**, and it is *one host
  call per source code point*. `rbyteAt` (0.90% self) is one host call per emitted
  byte. `memory-gc-design.md` §1.3 measures staging at ~10% of a self-compile.
- **The host half is already written.** `scripts/vl-host/src/main.rs`'s `StrIn`
  probes for `<name>Reserve(n)` and for an exported `ioMem` + `<name>Load(count)`,
  and falls back gracefully to per-code-point pushes. The comment says it: "no
  seed exports these yet."
- **The blocker just moved.** #1170 (07-26) landed linear memory that grows, reads
  at every width, and is visible to the host. What remains is compiler-side:
  force the memory section, export it as `ioMem`, and add the
  `srcReserve`/`srcLoad`/`modSrcReserve`/`modSrcLoad`/`modKeyReserve`/`modKeyLoad`
  exports that append UTF-32LE from it.
- It needs **no host change and no ABI break**: an old seed simply does not export
  them and takes the existing path. No A/B seed split.

That is item 1 of §3. **It shipped; §6 records what it cost, what it bought, and
the one clause above that was wrong** — "export it as `ioMem`" is not something a
`.vl` file can do, so the host's probe was widened by one line. The seed-split
half of the claim held: no split was needed.

---

## 3. The program, prioritized

Expected win / cost / risk / measurement plan per item. Shares are of a
self-compile unless stated.

| # | item | expected | cost | risk | how it is measured |
| --- | --- | --- | --- | --- | --- |
| 1 | ~~**Bulk host↔guest staging, IN**~~ — **SHIPPED, §6.** `srcLoad`/`modKeyLoad`/`modSrcLoad`/`cliResultLoad` + the memory the emitter exports; the host's batched path activates itself | predicted −4.6% self (`modSrcPush`); **got** `modSrcPush` 4.74 → 0.00 self, `modSrcLoad` 2.23 self, and the host's staging phase 192 → 135 ms | one host LINE (the memory probe) + 4 compiler-side exports; the fallback was already written | low — old seeds fall back, no seed split (**held**) | profile self-% of `modSrcPush` (target ≈0); the host's own `[profile] stage_program` phase; wall clock is too noisy alone |
| 1b | ~~**…and OUT**~~ — **SHIPPED, §7.** `rbyteStore` (bytes, packed 4/word) + `cliCmdDataStore` (code points); the guest writes the same window and the host copies out | `[profile] readback` 17 → **1 ms**; `vl fmt compiler` 4,520,527 host calls → 290 and 520 → **453 ms** (−12.9%) | 2 compiler-side exports + 2 host structs; NO host probe change (`io_mem` was already there) | low — same 2×2 fallback, no seed split (**held**) | the `readback` phase; a `$VL_HOSTCOUNT` per-channel call counter; and the payload-free `vl fmt --check` as the control (run it to the same N) |
| 2 | **Intern identifiers to i32 symbol IDs** — **THE TABLE AND PHASE 3 SHIPPED, §9.** `compiler/symbols.vl` + the arena-node carrier + the eight notifications; the three whole-program name→index maps are sym-indexed dense arrays. **Phases 4 (checker scope chain, now the largest single consumer at 2.83%) and 5 (`modRenamed`, 1.82%) remain**, and §9.7 records the coverage blocker phase 4 acquired | re-baseline confirmed the phase table (3 = 6.32% vs 6.2 predicted, 4 = 4.73% vs 4.4, 5 = 1.63% vs 1.6); phase 3 delivered **−4.5%** of a self-compile and **2,466,975 → 479,079 string-keyed probes** | large | medium-high — **the suite and the six-channel corpus are the witnesses; the ladder is BLIND to all eight name-writer poisons** (§9.6.1 corrects §9.6's filed column) | the consumer-class split per the design's §7 probes; the both-implementations count in §9.4 |
| 2b | ~~**the four avoidable costs the re-baseline found**~~ — **SHIPPED, §8.** `retCapturedMapShape`'s per-return capture re-walk, `emitReturnValue`'s four un-hoisted `fnStmtsPosOf` calls, `nameNamesFunction`'s whole-arena rescan, `parentLetOf`'s double probe, `keywordKind`'s 19-way chain | **−10.7%** of a self-compile (interleaved min-of-15) | five local rewrites, no new data structure | low — all five are strict behaviour-preserving rewrites with the argument at the site | wall clock with `vl check`/`vl fmt` as flat controls at min-of-21; per-function samples PER RUN |
| 3 | ~~**`nameNamesFunction`: index the arena once**~~ — **SHIPPED, §8.3.** Incremental fold with a high-water mark | 2.64% self → **0.07%** | small | the invalidation was the whole question and the answer is three facts pinned at their sites | as filed |
| 4 | ~~**`fnStmtsPosOf`: an index at the writers**~~ — **SHIPPED, §17, and NOT as filed.** No index was built: every one of the scan's 22,612 calls re-derives a `fnStmts` position its own caller is standing on. `emitCurFnPos` carries `emitCodeSection`'s loop index; `mapRetExprShape`/`retCapturedMapShape` take the position their callers already spell `fnStmts[fe]` | 3.09% self → **0.01%**; a 1,600-frame ladder **48.9% → 3.7% self, −49.8% of the whole compile** | small — one global, one parameter, four call sites | low — no new table, no invalidation surface; the writers were never touched | 12 interleaved warm guest profiles per leg; a counting build for the call/step census; CPU-ms with emitted bytes asserted md5-identical first |
| 5 | **Native-align: batch the `vl check` legs** the way RUN/TRAP is batched | the pooled version (shipped) took 27 → 19 s on CI; a `vl check` batch mode would take the remaining ~1,600 process spawns to a handful, and the 4-core cap stops applying | medium: a host `check --batch` mode + per-case verdict files | medium — the per-case verdict is the gate; a batch that blurs verdicts weakens it | the interleaved A/B in §1.5, plus the memo-key sabotage |
| 6 | **`vl check` allocates more than `vl build`** (649 MB vs 511 MB) while doing less | unquantified; a 138 MB gap in the LSP's own path | investigation first | none (a measurement) | peak RSS per §2.1; then bisect by pass |
| 7 | **Editor latency**: `vl check` on one compiler file is 231 ms | the LSP path; see §4 | unquantified | — | the §4 table |
| 8 | **`ci-embed-seed` recompiles the whole crate every push** — `build.rs` emits `cargo:rustc-env=VL_SEED_KEY=<hash of the seed>`, so a changed seed invalidates the crate fingerprint by construction | ~17 s off a job that is NOT the critical path (42–74 s against `ci-native`'s 42–50 s) — so this is a "when it is free" item, not a lever | small: compute the key at startup instead — but read `build.rs`'s header first, it is baked in to avoid hashing ~1 MB per invocation | low, but it trades a CI second for a runtime millisecond, which is the wrong direction if done naively | several samples of `Finished \`release\` profile in Xs` — three readings were 48 s, 16 s and 19 s, so ONE sample cannot size this |

**Explicitly NOT on this list, and why:**

- **Interning TYPE names** — 6.08%, and the destringify program is already the
  right vehicle for it. It is the smaller half of the split; do not do it first.
- **More destringify slices sold as speed.** Measured again above: the profile did
  not move across the slices since `8d2471e`. Destringification is a CORRECTNESS
  program. D-RET (#1087) was the one real perf win because that function was
  genuinely hot.
- **`flat` record conversion of compiler tables** — §2.2.
- **A different collector for the compile engine** — `memory-gc-design.md` §4.2
  already measured it: `none` 2.59 s, `tracing` 3.92 s, `refcount` 19.28 s. The
  shipped choice is right.
- **UTF-8 / i8 strings** — `memory-gc-design.md` §2.2: 4× denser, strictly less
  scannable, and it is a whole-language change, not a compiler change.

---

## 4. LSP / tools latency

Per-process `wait4` rusage, min-of-N, quiet box (load ≈ 1.4–5), `.cwasm` sidecar
**warm**.

| task | wall | peak RSS |
| --- | ---: | ---: |
| `vl check tiny.vl` (1 fn — the floor) | **5 ms** | 15.1 MB |
| `vl build tiny.vl -o /dev/null` | 6 ms | 16.3 MB |
| `vl check compiler/typecheck.vl` (one 21,947-line file) | **231 ms** | 188.6 MB |
| `vl check compiler/entry.vl` (26-file graph) | 969 ms | 649.5 MB |
| `vl build compiler/entry.vl` (self-compile) | 1,950 ms | 510.8 MB |
| `vl fmt --check compiler` (whole tree) | 559 ms | 508.8 MB |
| `vl fmt --check std` | 11 ms | 18.5 MB |
| `vl check std` (directory) | 15 ms | — |

Reading: **the single-file LSP path is fine at the small end and the seed-load
floor is 5 ms**, so per-keystroke checking of an ordinary file is not the problem.
The 231 ms for one large compiler file, and the 969 ms whole-graph check, are what
an editor would feel on a big project — and both are §3's items 2–4 territory.
`vl fmt` over the whole compiler tree at 559 ms is comfortably inside a save-hook
budget.

**§6 and §7 both move this table**, and in the same direction for the same reason
— they pay in proportion to bytes crossing the boundary per unit of work, which is
why `vl fmt` moves most and `vl check` barely at all. Re-measured on the same box
after both (interleaved min-of-21, `.cwasm` warm, load 0.5): `vl fmt compiler`
(whole tree, to stdout) **453 ms**, `vl fmt compiler/typecheck.vl` **99 ms**,
`vl fmt --check compiler` 438 ms, `vl check compiler/entry.vl` 814 ms,
`vl check compiler/typecheck.vl` 199 ms, `vl check tiny.vl` 4 ms, and the
self-compile 1,566 ms. These are a quieter box than the 559/231/969/1,950 row
above, so read the A-vs-B columns in §7.3 rather than differencing across
sections.

**COLD vs WARM, measured — and the "~10×" I first wrote is wrong for the case that
matters.** Deleting `build/vl-compiler.wasm.cwasm` and re-running the same command:

| task | cold | warm | ratio |
| --- | ---: | ---: | ---: |
| `vl build tiny.vl` | **1,850 ms** | 6 ms | **290×** |
| `vl check compiler/typecheck.vl` | 1,968 ms | 222 ms | 8.9× |

The cold cost is a **constant ~1.85 s** — the Cranelift compile of the ~1.1 MB
seed — so the RATIO is entirely a function of how small the real work is, and it
is worst exactly where an editor lives. That is the reason the shipped binary's
embedded-seed cache is gated in CI at all (see `ci-embed-seed`), and the reason
a "the sidecar makes it 10× slower" rule of thumb should not be quoted: it is 290×
for a one-function file.

---

## 5. Re-verifying each headline

| headline | probe |
| --- | --- |
| CI step decomposition | `gh api repos/voces/vl/actions/runs/<id>/jobs` — step `started_at`/`completed_at`; take medians over FULL runs (a docs-only run skips the heavy steps and drags every median down) |
| `vl-bin` hit rate 97.9% | count `"Build vl-host (native tool)"` steps whose `conclusion` is `skipped` |
| the align-suite A/B | `SELFHOST_NATIVE_ALIGN=1 deno test --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts`, interleaved, min of 3, on a box whose load you state |
| the memo is not cross-contaminating | collapse the memo key to drop `rel`; the suite must fail (260/1,646). Dropping the `--codegen` half stays green **for a stated reason** — read the comment before concluding it is untested |
| profile top-20 | the `VL_PROFILE_GUEST` recipe in §2; ≥5 warm runs, strip `$mNN`, and **re-baseline before targeting** — shares move as work lands |
| `__str_eq__` consumer split | walk each `__str_eq__` sample one frame up (two, through `__map_probe__`) and classify the caller |
| ~0.5 GB per self-compile | `wait4` rusage `ru_maxrss` on a FRESH child per measurement. `getrusage(RUSAGE_CHILDREN)` is a cumulative high-water mark and will report the max over every child so far — that mistake made `vl check` look like it allocated 649 MB when the number was really the previous `vl build` |
| `string` is `(array (mut i32))` | `wasm-tools print build/vl-compiler.wasm` and read the type section; `array.new_fixed` of it is a string literal |
| cold vs warm sidecar | delete `build/vl-compiler.wasm.cwasm` and re-run the SAME command. The cost is a constant ~1.85 s, so quote it as a constant, never as a ratio — the ratio is 290× on a one-function file and 8.9× on a 22 K-line one |
| compiler byte-identity of a CI-only change | `git diff master --name-only -- compiler/ std/ scripts/` is empty, and `vl build compiler/entry.vl` `cmp`s equal to the seed |
| §6's staging cut | `VL_PROFILE=1 vl build compiler/entry.vl --compiler <seed>` and read the `[profile] stage_program` line; interleave the two seeds, min of 9, state the load |
| §6's fallback matrix | the same phase timer across the 2×2 of {old,new} host × {old,new} seed — exactly one cell is fast, and all four outputs `md5` equal |
| §6's V8 leg | `node` a fresh `WebAssembly.Instance` and stage the same 4.57 M code points twice: `modSrcPush` per point vs `new Int32Array(memory.buffer)` + `modSrcLoad` |
| §7's per-channel OUT costs | compile a throwaway `vl` with an `AtomicU64` per channel bumped at each `<name>At` call site and dumped under `$VL_HOSTCOUNT`; drive `vl build compiler/entry.vl`, `vl fmt compiler`, `vl fmt <one file>`, `vl check`, `vl check --json`, `vl test`, and a build with 300 type errors |
| §7's read-back cut | `VL_PROFILE=1 vl build compiler/entry.vl --compiler <seed>` and read `[profile] readback`; interleave the two seeds, min of 11 |
| §7's `vl fmt` cut | interleaved min-of-15 wall clock of `vl fmt compiler` on both seeds — and `vl fmt --check compiler` at min-of-**21** as the payload-free control (it reads a false +2.4% at min-of-9) |
| §7's fallback matrix | the same `readback` phase across {old,new} host × {old,new} seed — exactly one cell is 1 ms, all four md5s equal; plus a Node harness that prints `rbyteStore NOT EXPORTED` for the master seed |
| §7's "the corpus cannot see the string channel" | run sabotage B (`cliCmdDataStore` drops one code point at a 16,384 seam) as the corpus A/B's B leg: **0 diffs over 1,712 files × 6 fields**, while `tests/selfhost_native_bulk_readback_test.ts` names the chunk size |
| §9's phase re-baseline (3 = 6.32 / 4 = 4.73 / 5 = 1.63) | the §2 recipe at ≥12 warm runs, then walk each string-primitive sample up past the primitives to its first real consumer and sum the phase's members |
| §9.2's "the string-wrapper conversion is a WASH" | build the intermediate (maps converted, every caller still passing a string) and read `sidOf` + `sidLookup` as consumers — they sum to what `globalIndexOf` + `fnIndexOf` + `parentLetOf` cost, to within 0.01 points |
| §9.4's probe counts and the ZERO divergences | one throwaway compiler keeping the OLD `{[string]: i32}` maps alive beside the new arrays, answering every query BOTH ways and comparing, reporting through `return emitFail("COUNTPROBE …")` at the end of `emitProgram` |
| §9.4's 95.1% carrier hit rate | `sidOfNode` calls vs fills in that same instrument — it is R3's whole justification and it is two counters |
| §9.5's −4.5% | the INTERLEAVED profile A/B (14 runs per leg, samples PER RUN), corroborated by min-of-41 wall clock. **Do not quote a single wall clock**: four runs read −2.0 / −3.7 / −4.2 / −5.6% and one control read +2.6% |
| §9.6's poison columns | apply the poison, build with the GOOD seed, `cmp` compile(X, source) against X — and put the good seed BACK before the next poison (§8's harness bug). **The "ladder is the only witness for six poisons" reading was WRONG and §9.6.1 retracts it**: the ladder is blind to all eight name-writers. Include a provably-unreachable poison as a CONTROL — a column that reads identically in every row is a claim about the harness |
| §9.6's four "0 real" suite columns | read the failure MESSAGE, not the count: `glob match took …ms` and `--jobs 4 … ratio 0.75` are load-induced timing tests, and the same suite on the same tree is 3,610/0 |

---

## 6. Item 1 shipped — bulk source ingestion over linear memory

The compiler's four string-INPUT channels no longer cross the host boundary one
code point at a time. `compiler/driver.vl`'s `srcLoad` header owns the protocol;
this section is the measurement and the ABI record.

### 6.1 The cost, re-derived on this base

`feac41f0`, the published `seed-latest`, six warm guest runs, **11,925 samples**:
`modSrcPush` **4.77% self** (569 samples), `modKeyPush` 0.08%. That is the same
number §2 recorded at `883dca44` (4.56%) inside its error bars — the target had
not moved. (`srcPush` and `cliResultPush` read 0.00% here for a structural reason,
not because they are cheap: a `vl build` of a graph never touches the single-source
buffer, and the CLI pump is a different entry point. They are measured in their own
right below, on `vl check` and `vl fmt`.)

The guest profiler **cannot see the half that matters**, and the host's own phase
timer can: `VL_PROFILE=1 vl build compiler/entry.vl` reports

```
[profile] stage_program: 186 ms      <- 4,565,054 host calls
[profile] compile.call: 1498 ms
```

**~10.5% of a self-compile is staging** — matching `memory-gc-design.md` §1.3's
independent ~10% — of which the guest-visible push is ~4.8% and the rest is the
wasmtime trampoline, which is invisible to a guest sampling profiler by
construction. **Quote the phase timer for this item, not the profile share.**

### 6.2 What shipped

Four exports, one loop shape, no new language surface:

| export | accumulator | who feeds it |
| --- | --- | --- |
| `srcLoad(count)` | `vcCodes` | `vl build`/`run` on an import-free file |
| `modKeyLoad(count)` | `modKeyAcc` | the H3 module fetch loop (keys) |
| `modSrcLoad(count)` | `modSrcAcc` | the H3 module fetch loop (**the self-compile**) |
| `cliResultLoad(count)` | `cliResultAcc` | the CLI pump's `CMD_READ_FILE` (**`vl check`/`fmt`/`test`**) |

Each appends the `count` UTF-32LE code points the host wrote at **byte 0 of the
module's linear memory**. The memory itself is not new API: a `__load_i32__` in
those loops sets the emitter's `memUsed`, which emits section 5 (one page, 64 KiB)
and — since P0.2 / ruling O4(i) — exports it automatically as `memory`.

**The one claim in §2.2 that was wrong: "no host change."** §2.2 said to "export it
as `ioMem`", and no `.vl` file can do that — the export name is fixed by the
emitter, deliberately (a bespoke export name for the compiler's own memory would be
language surface invented for one consumer). So `StrIn::probe` gained ONE line: it
now probes `ioMem` and then `memory`. Widening a probe is back-compatible in both
directions, which §6.5 proves rather than asserts.

**No `<name>Reserve` is exported.** VL has no list-capacity primitive, so there is
nothing for a capacity hint to do; `.push`'s 2× growth already bounds the copy at
2N. The host treats `Reserve` and `Load` as independently optional, so this costs
one failed lookup per channel at startup.

**Not converted, and why.** `cliArgPush` (argv) and `cliDirNamePush` (one directory
entry) carry tens of code points, not millions — 0.00% of every profile. The
OUTPUT direction was left as a separate item and is untouched *here*: `rbyteAt` is
still one host call per emitted byte at this point (0.90–0.96% self,
`[profile] readback: 19–30 ms`), and so are `cliCmdDataAt` / `cliCmdPathAt` /
`modPendingAt`. **§7 is that mirror** (guest writes the memory, host reads it), and
its own measurement found the ranking here was incomplete: `cliCmdDataAt` is the
bigger of the two, at 4.52 M calls for `vl fmt compiler`.

### 6.3 Measured

**Guest profile, same input both legs** (branch source; A = master's compiler,
B = the branch's; six warm runs each, `$mNN` stripped):

| fn | A (master) | B (branch) |
| --- | ---: | ---: |
| `modSrcPush` | **4.74% self** | **0.00%** |
| `modSrcLoad` | — | **2.23% self** |
| `modKeyPush` / `modKeyLoad` | 0.06% | 0.08% |
| `modCommit` (incl — the token scan, unchanged work) | 5.03% | 5.23% |

The residue is real and expected: WasmGC has no runtime memory→array copy
(`memory-gc-design.md` §2 #10), so the element move survives; only the CALL is
bought. A local-alias/byte-cursor rewrite of the loop was built and A/B'd — 135 vs
139 ms, under the floor — and rejected in favour of four identically-shaped loops.

**Host-side, wasmtime, interleaved min-of-11, `.cwasm` warm, 24-core box at load
2.8–3.2** (the same A/B at load 4.7–7.0 read 192/135 — the DELTA is stable, the
absolutes are not):

| phase | master seed | branch seed |
| --- | ---: | ---: |
| `stage_program` | **190 ms** | **132 ms** (−30.5%) |
| `compile.call` | 1,548 ms | 1,534 ms (noise; the sign is not stable) |
| whole `vl build` | 1,795 ms | 1,728 ms (−3.7%) |

**The self-compile's total wall clock is NOT the headline** — the staging phase is
~10% of it and the rest is noisier than the win. The phase timer is the instrument.

**Tools, interleaved min-of-11, same box and load:**

| task | master | branch |
| --- | ---: | ---: |
| `vl fmt --check compiler` | 528 ms | **476 ms** (−9.8%) |
| `vl check compiler/entry.vl` | 941 ms | **884 ms** (−6.1%) |
| `vl check compiler/typecheck.vl` | 226 ms | **211 ms** (−6.6%) |

`vl fmt` gains most because it reads the most source per unit of work — which is
the general shape of this item: **it pays in proportion to bytes-in over
work-done**, so the tools benefit more than the compiler does. §4's table moves by
these amounts and is otherwise unchanged.

**V8 (Node), the same ABI, same 4,565,054 code points, min of 7 alternating legs:**

| leg | ms |
| --- | ---: |
| per-code-point `modSrcPush` | 40.5 |
| `new Int32Array(memory.buffer)` + `modSrcLoad` | **27.7** |

**1.46× on V8 vs 1.42× on wasmtime — but note the absolute scale:** V8 stages in
40 ms what wasmtime takes 192 ms to stage. A JS→wasm call is already cheap, so the
V8-side saving is ~13 ms against a ~560 ms V8 self-compile (~2%). The deno corpus
harness still uses `pushString`/`srcPush` and is deliberately left alone: its files
are tens of lines.

**Peak RSS is unchanged** — 511.2 MB → 511.3 MB (`wait4` on a fresh child). The
extra 64 KiB page is 0.01%, and the GC-side accumulator is exactly what it was.
**This item buys time, not memory.**

**Byte delta:** the compiler is 1,111,882 → **1,112,716 bytes (+834)**.

### 6.4 What the ABI record says

- `compiler/driver.vl` — `srcLoad`'s header: the protocol, the staging window
  (`ioMem[0 .. 4*count)`, page 0, owned by this protocol and used for nothing
  else), the three constraints that force a per-element loop, and why there is no
  `Reserve`.
- `scripts/vl-host/src/main.rs` — `StrIn`'s header: the probe order and the
  both-directions compatibility argument.
- `docs/internals/cli-design.md` — `cliResultLoad` in the exports block.
- `docs/internals/native-modules-design.md` — `modKeyLoad`/`modSrcLoad`.
- `docs/internals/memory-gc-design.md` §1.3 — the "the emitter half does not
  exist" note, now closed with its number.

### 6.5 Fallback compositions — proved, not assumed

Both halves of the ABI are optional and are probed independently, so all four
compositions must work. The witness is the phase timer (the bulk path is ~55 ms
faster on this input) plus the md5 of the compiler each cell produces:

| composition | `stage_program` (min of 5) | output |
| --- | ---: | --- |
| old host + old seed | 186 ms | `e7906fc95c7c` |
| old host + **new** seed | 185 ms | `e7906fc95c7c` |
| **new** host + old seed | 190 ms | `e7906fc95c7c` |
| **new** host + **new** seed | **131 ms** | `e7906fc95c7c` |

**Exactly one cell takes the bulk path, and all four produce the byte-identical
compiler** (which is also `cmp`-equal to the branch seed, so the fixpoint holds in
every cell). The old host does not see a `memory` export and does not look for one;
the old seed exports no `*Load`. A second, independent witness for the old-seed
half: the Node harness prints `NOT EXPORTED by this module` for the master seed.

**Seed-bootstrap: no split.** The published `seed-latest` (1,111,882 bytes) compiles
this branch's source directly — `__load_i32__` and the automatic memory export both
predate it (#1170, P0.2). PR A/B was not needed and is not used.

### 6.6 Gate

`rm -f build/vl-compiler.wasm && scripts/fetch-seed.sh` → fetched 1,111,882 bytes;
`refresh-compiler.sh --prove-fixpoint` → fixpoint at 2 compiles, 1,112,716 bytes;
`native-fixpoint.sh` → stage3 == stage4; `SELFHOST_NATIVE_ALIGN=1 deno task test`
→ **3,599 passed / 0 failed / 7 ignored** (3,594 + this PR's 5), the ignored SET
identical to master's (all seven in `cases_wasm_test.ts`); `lint-self.sh` clean;
`rep-fuzz-check.sh` exact (1 baselined, 0 new, 0 stale).

**Six-channel corpus A/B** (master-built vs branch-built compiler, `-o` path
normalized): **1,712 files, all six fields `same`.**

**Fuzz A/B**, 14 seeds × 3 depths × 300 = 12,600 programs per leg: identical
finding sets (160 each, same md5). **Comparator sensitivity confirmed at a
fraction of that volume** — sabotage A as the B leg gives 6 findings vs 0, a
7-line diff. Note WHY it reddens: `scripts/fuzzgen.vl` is 52 KB, four chunks, so a
broken intake cannot compile the fuzzer's own generator. The fuzz channel is
therefore not evidence about generated-program SHAPES here; it is evidence that
the harness noticed at all.

**A cold `.cwasm` sidecar fails a test that is about neither the sidecar nor the
compiler.** One suite run reddened at
`vl_check_hygiene_test.ts: glob match took 33779ms — backtracking regression`. The
glob was fine: the sabotage harness had deleted `build/vl-compiler.wasm.cwasm`, and
`deno test --parallel` on 24 cores then had every spawned `vl` Cranelift-compile the
1.1 MB seed at once. Warming the sidecar with one `vl check` took the whole suite
37 s → 4 s and the failure vanished. §4 records the cold cost as a ~1.85 s CONSTANT;
under a parallel spawn storm it is that constant times the fan-out. **Warm the
sidecar before any suite run you intend to read a number from.**

**A new suite, `tests/selfhost_native_bulk_intake_test.ts` (5 tests, 80 ms),** is the
standing gate: it asserts the ABI is exported at all, that the staging window is a
whole 64 KiB page (both sides derive the chunk size from it), and that bulk-in ==
push-in EXACTLY at 0 / 1 / cap−1 / cap / cap+1 / 2·cap / 2·cap+7 code points and
over astral characters. **Sabotage-verified against both §6.7 compilers**, and it
names the defect where a ladder only says "parse error":
`length mismatch at 1 code points` (A) and `length mismatch at 16384 code points`
(B). It reaches the seam without a 16 KB fixture because the payload is generated.

### 6.7 Integrity sabotages — and which instrument was actually load-bearing

A bulk copy that drops or duplicates a code point is a silently WRONG compile, so
both sabotages attack CONTENT, and both were run through every channel.

**Sabotage A — drop the last code point of every chunk** (`while i < count - 1`,
all four loops; fires on every file of any size).

| witness | reading |
| --- | --- |
| self-compile (fixpoint rung 1) | **TIMEOUT** — a truncated module KEY never resolves, so the H3 fetch loop re-requests it forever |
| `vl check compiler/typecheck.vl` | rc 1 — `"P" is not exported by "./ast"` |
| `vl fmt --check compiler` | rc 2 — parse error, then every file "not formatted" |
| `vl check`/`build` of a SMALL corpus case | **rc 0 — clean.** The dropped code point is the trailing newline |
| six-channel corpus A/B | **97 of 1,712 rows differ** — but 95 of them are `BUILDRC(*/124)`, i.e. the fetch-loop hang, and only **2** are genuine content divergence (`scripts/fuzzgen.vl`, `tests/cases/literals/long-literal-chunked.vl`) |

**Sabotage B — drop one code point only at a FULL-CHUNK SEAM** (`if count == 16384
{ i = 1 }`; fires only on a file that spans more than one chunk).

| witness | reading |
| --- | --- |
| self-compile | **rc 1, loud** — `parse error … "P" is not exported by "./ast"` |
| `vl check compiler/typecheck.vl` | rc 1 |
| `vl fmt --check compiler` | rc 2 |
| small corpus case | rc 0 — clean, correctly (one chunk) |
| corpus A/B | 26 of 1,712 rows |

**Three findings worth more than the green run:**

1. **The BYTES channel — field 5, the one you would reach for — read `1712 same`
   under BOTH sabotages.** A corrupted intake makes a build FAIL, it does not make
   it emit different bytes, and field 5 only compares when both legs return 0. For
   a source-intake defect the live channels are CHECKRC/CHECKMSG/BUILDRC/BUILDMSG.
2. **The corpus barely covers the chunk seam.** `cap` is `memory_size / 4` =
   **16,384 code points ≈ 16 KB**, not 64 KB. Exactly **3** of the 1,712 corpus
   files exceed one chunk (`std/buffer.vl`, `scripts/fuzzgen.vl`,
   `tests/cases/literals/long-literal-chunked.vl`), and sabotage B's other 23 rows
   are cases that merely IMPORT `std/buffer.vl`. **22 of the compiler's 26 files
   exceed one chunk** — the fixpoint ladder is the seam instrument, and the corpus
   is a bystander that happens to own three files.
3. **A hang is a witness, but it is a bad one, and it breaks the comparator.**
   `abcorpus3.sh` has no per-invocation timeout, so sabotage A did not redden it —
   it hung it, spawning ~1,600 immortal `vl` processes. Use the `TMO`-bearing
   variant when the B leg is a deliberately broken compiler; rc 124 is a divergence
   like any other.
4. **The fuzz channel reddens for a reason that is not about fuzzing.**
   `scripts/fuzzgen.vl` is 52 KB — four chunks — so a broken intake cannot compile
   the fuzzer's own GENERATOR, and the run produces no findings at all. Treat that
   as "the harness noticed", not as shape coverage. The generator emits programs of
   tens of lines; it can never reach a chunk seam by construction, exactly as the
   3+-atom value-union sabotage could never be reached (`vl-compiler-profiling`,
   the limits-of-fuzz finding).

**What would have caught this WITHOUT the sabotages.** The honest answer is: the
fixpoint ladder, and nothing else that runs by default — which is why
`tests/selfhost_native_bulk_intake_test.ts` now exists. It reaches the seam with a
generated payload instead of a fixture, in 80 ms instead of a ladder, and it names
the size at which the intake diverged.

---

## 7. Item 1's mirror — bulk result read-back over linear memory

§6 made the compiler's string INPUT cross the host boundary in bulk and left the
OUT direction open on purpose. This section closes it. `compiler/driver.vl`'s
`rbyteStore` header owns the protocol; this is the measurement and the ABI record.

### 7.1 The cost, re-derived per channel

The guest profiler cannot see a trampoline (§6.1, method note 16), so the OUT
direction was measured two ways instead: the host's own `[profile] readback`
phase, and a **per-channel host-call counter** compiled into a throwaway `vl`
(one `AtomicU64` per channel, incremented at every `<name>At` / `<name>Push` call
site, dumped at exit under `$VL_HOSTCOUNT`). Master host, master seed, `.cwasm`
warm. Every OUT channel the host has, and what each actually moves:

| OUT channel | export pair | worst driver measured | calls | ms |
| --- | --- | --- | ---: | ---: |
| emitted wasm bytes | `rbyteLen`/`rbyteAt` | `vl build compiler/entry.vl` | **1,112,716** | **19** |
| CLI payload out | `cliCmdDataLen`/`cliCmdDataAt` | `vl fmt compiler` (whole tree to stdout) | **4,520,527** | **87** |
| CLI payload out | " | `vl fmt compiler/typecheck.vl` (one 22 K-line file) | 1,010,306 | 20 |
| CLI payload out | " | `vl check compiler/entry.vl` (hints + summary) | 16,752 | 0 |
| CLI payload out | " | `vl check --json compiler/entry.vl` | 15,883 | 0 |
| test module bytes | `rbyteLen`/`rbyteAt` | `vl test` (4 fixture files) | 19,800 | 0 |
| diagnostics | `diagMsgLen`/`diagMsgAt` | a build with **300** type errors | 9,790 | 0 |
| CLI path out | `cliCmdPathLen`/`cliCmdPathAt` | `vl check compiler/entry.vl` | 545 | 0 |
| pending module keys | `modPendingLen`/`modPendingAt` | self-compile | 511 | 0 |
| module key table | `modKeyAtLen`/`modKeyAtCharAt` | a multi-module diagnostic | ~500 | 0 |
| test names / failure text | `vltNameAt`/`vltFailAt` | `vl test` | ~150 | 0 |

**Two channels are the item and the other nine are not**, and the ordering is not
the one the filing predicted. `rbyteAt` was named as "the certain one" and it is
real — but the BIGGER OUT channel is `cliCmdData`, which nothing had named:
`vl fmt` over the compiler tree pushes 4.52 M code points out one call at a time,
almost exactly mirroring §6's 4.57 M coming in. **The lesson generalises past this
item: enumerate and COUNT the whole family before picking a member.** The brief
named one channel and guessed at a second; the counter found the ranking was
neither. **Diagnostics were named as a
candidate and measured out**: 300 diagnostics — far more than any real run — are
9,790 calls and under a millisecond. They stay per-call.

### 7.2 What shipped

Two exports, two shapes, no new language surface:

| export | accumulator | element | chunk | who reads it |
| --- | --- | --- | ---: | --- |
| `rbyteStore(off, count)` | `W.bytes` | a BYTE, packed 4 per i32 word | 65,536 | `vl build` / `run` / `test` (CMD_TEST_STASH) |
| `cliCmdDataStore(off, count)` | `cliCmdData` | a code point, UTF-32LE | 16,384 | the CLI pump: `vl fmt` stdout + write, every `vl check` line, `--json` |

Each writes `min(count, len - off)` elements at **byte 0 of the module's linear
memory** — the same staging window `srcLoad` reads from, owned by the protocol and
used for nothing else — and returns the count written. The host copies that range
out in ONE `Memory::data` slice and asks again from `off + written`.

**The byte channel packs and the string channel does not.** The intake's element
IS an i32 code point, so it had no choice; here the element is a byte, and packing
makes the host's copy a `memcpy` of exactly the bytes it wants instead of a strided
gather — and it quadruples the chunk to a whole page, so a self-compile reads back
in **17** calls rather than 68. The packing tail (`count % 4 != 0`) is assembled
high-byte-first into one final word whose START is the largest multiple of 4 below
`count`, hence at most `cap - 4`: the 1–3 padding bytes it also writes always land
inside the window.

**A `Store` that returns 0, a negative, or more than it was asked for FAILS the
read.** It is deliberately not "fall back and carry on": re-asking from the same
offset is an infinite loop, and §6.7 finding 3 is that a hang is a witness that
breaks every comparator downstream of it.

**No host-side probe change was needed this time.** §6 widened `StrIn::probe` to
look for `memory` after `ioMem`; that lookup is now a shared `io_mem()` helper and
the two new structs (`BytesOut`, `StrOut`) use it unchanged. The §6 lesson —
*check whether a plan's compiler-side step is EXPRESSIBLE before banking "no host
change"* — was applied in advance here: `__store_i32__` is one of the fifteen
lowered memory builtins (`memory-gc-design.md` §1.2), so the guest half was
expressible as written.

**Not converted, and why.** Everything in §7.1's table below the two shipped rows.
`cliCmdPath` is the interesting one: it is on the SAME `StrOut` type as
`cliCmdData` and could have a `Store` for eight lines, and it deliberately does
not. It carries one path, and leaving it per-code-point keeps the host's presence
probe exercised **in production on every `vl check`** rather than only against an
old seed. The JS consumers (`lsp/src/wasmChecker.ts`, `tests/cases_wasm_test.ts`)
are left alone for the reason §6 left the deno harness alone, now with a number:
see §7.4.

### 7.3 Measured

**Host phase timer, interleaved min-of-15, `.cwasm` warm, 24-core box at load
0.9** (A = the master-built compiler, B = the branch-built one, same host):

| phase | A (master seed) | B (branch seed) |
| --- | ---: | ---: |
| `readback` | **17 ms** | **1 ms** (−94%) |
| `stage_program` | 126 ms | 127 ms (control — §6's channel, untouched) |
| `compile.call` | 1,415 ms | 1,419 ms (control — inside the guest, untouched) |
| whole `vl build` | 1,592 ms | 1,578 ms |

(The same A/B at load 1.7–1.8 read `readback` 17/1, `stage_program` 133/132,
`compile.call` 1,479/1,496, whole build 1,674/1,669 — the DELTA is stable, the
absolutes are not, exactly as §6.3 found.)

**Host-call counts on the same two seeds** (the `$VL_HOSTCOUNT` instrument again,
this time compiled into the branch host so both sides use one instrument):

| task | A: per-element calls | B: bulk calls |
| --- | ---: | ---: |
| `vl build compiler/entry.vl` | 1,113,241 | **17** (+1 `rbyteLen`) |
| `vl fmt compiler` | 4,525,102 | **290** (+536 un-bulked `cliCmdPath`) |
| `vl fmt compiler/typecheck.vl` | 1,010,348 | **62** |
| `vl check compiler/entry.vl` | 17,297 | **85** (+545 `cliCmdPath`) |
| `vl test` (4 fixtures) | 20,500 | **13** (+407 `cliCmdPath`) |

**Tools, interleaved min-of-21, same box and load** (wall clock, `.cwasm` warm):

| task | A | B | |
| --- | ---: | ---: | ---: |
| `vl fmt compiler` (4.52 M code points out) | 520 ms | **453 ms** | **−12.9%** |
| `vl fmt compiler/typecheck.vl` (1.01 M) | 113 ms | **99 ms** | **−12.4%** |
| `vl build compiler/entry.vl` (self-compile) | 1,596 ms | 1,566 ms | −1.9% |
| `vl check --json compiler/entry.vl` | 731 ms | 740 ms | +1.2% (noise; −0.7% at min-of-15) |
| `vl check compiler/entry.vl` | 816 ms | 814 ms | −0.2% |
| `vl check compiler/typecheck.vl` | 200 ms | 199 ms | −0.5% |
| `vl fmt --check compiler` (**control** — no payload out) | 439 ms | 438 ms | −0.2% |
| `vl check tiny.vl` (**control** — the load floor) | 4 ms | 4 ms | 0 |
| `vl test tests/fixtures/vl-test-parallel` | 4 ms | 4 ms | 0 |

**The controls needed min-of-21 to converge, and at min-of-9 and min-of-15 the
payload-free `vl fmt --check compiler` read +1.5% and +2.4%.** Both were noise:
at min-of-21 it is 439/438. A change that is supposed to move NOTHING on a channel
is exactly where an unconverged minimum invents a regression — **run the control to
the same N as the headline.** (`vl check --json`'s +1.2% is the same artefact with
the sign flipped: it read −0.7% at min-of-15 and its OUT channel is 15,883 code
points, three orders below the two that moved.)

**The self-compile's wall clock is not the headline** (again): read-back is ~1% of
it, and `compile.call`'s run-to-run spread is larger than the win. `vl fmt` is the
headline because it is the tool whose output-bytes-per-unit-work ratio is highest
— the exact mirror of §6, where `vl fmt` gained most for having the highest
input-bytes-per-unit-work ratio.

### 7.4 V8, and why the JS consumers keep the per-element path

Same module, same instance, the read-back run both ways (min of 7):

| leg | 1,113,241 bytes |
| --- | ---: |
| per-byte `rbyteAt` | 3.4 ms |
| `rbyteStore` + `new Uint8Array(memory.buffer)` | **0.7 ms** (4.9×) |

The ratio is bigger than wasmtime's, the absolute is not: **V8 reads back in 3.4 ms
what wasmtime takes 19 ms to read**, so a JS→wasm call is ~3 ns against wasmtime's
~17 ns. The LSP's own worst OUT case is `fmtByteAt` over the repo's largest file —
1,010,306 calls, **4.93 ms in V8** — and its real workload is a user's file, two
orders of magnitude smaller. The corpus harness's cases are tens of lines.
**Converting them buys ~4 ms on a payload no editor produces**, so they stay, and
the presence probe means they can be converted later without a seed split.

**Peak RSS is unchanged** — the staging page already existed for §6, and the guest
writes into it rather than allocating. **Byte delta:** the compiler is
1,112,716 → **1,113,241 bytes (+525)**.

### 7.5 What the ABI record says

- `compiler/driver.vl` — `rbyteStore`'s header: the OUT protocol, why the byte
  channel packs, the tail's in-window proof, and the "a bad return FAILS, it does
  not retry" rule.
- `compiler/cli.vl` — `cliCmdDataStore`'s header: the code-point variant, the
  number that justified it, and why `cliCmdPath` has no twin.
- `scripts/vl-host/src/main.rs` — `BytesOut` and `StrOut` headers (and `io_mem`,
  now shared with `StrIn`).
- `docs/internals/cli-design.md` — `cliCmdDataStore` in the exports block.
- `docs/internals/memory-gc-design.md` §1.3 — the OUT bullets, now struck through
  with their numbers.
- `ROADMAP.md` Track B — both halves of "bulk host I/O", and the note that
  wasmtime's `ArrayRef::new_from_i8_slice` would remove the element loop that
  survives on BOTH sides — but only once strings are `(array i8)` (B7).

### 7.6 Fallback compositions — proved, not assumed

Both halves are probed independently, so all four compositions must work. Witness
= `[profile] readback` (min of 5) + the md5 of the compiler each cell builds:

| composition | `readback` | output md5 |
| --- | ---: | --- |
| old host + old seed | 18 ms | `3925d4d52573` |
| old host + **new** seed | 19 ms | `3925d4d52573` |
| **new** host + old seed | 18 ms | `3925d4d52573` |
| **new** host + **new** seed | **1 ms** | `3925d4d52573` |

**Exactly one cell takes the bulk path, and all four produce the byte-identical
compiler** (also `cmp`-equal to the branch seed, so the fixpoint holds in every
cell). A second, independent witness for the old-seed half: a Node harness prints
`rbyteStore NOT EXPORTED by this module` for the master seed and reads it per byte.

**Seed-bootstrap: no split.** The published `seed-latest` (1,112,716 bytes)
compiles this branch's source directly — `__store_i32__` and the automatic memory
export both long predate it.

### 7.7 Integrity sabotages — and the instrument that was NOT load-bearing

A bulk copy that drops, duplicates or mis-packs one element is a silently WRONG
result, so both sabotages attack CONTENT, one per shipped channel.

**Sabotage A — the BYTE channel, every chunk.** `rbyteStore` reports `count` to
the host but writes one byte fewer, so the last byte of every chunk is stale.
Characterised exactly: `cmp -l` of a 150-byte and an 1,863-byte module against the
good compiler shows **one** differing byte each, both the LAST, both zeroed.

| witness | reading |
| --- | --- |
| self-compile (fixpoint rung 1) | **rc 1** — `is not a valid WebAssembly module … unexpected end-of-file` |
| `vl build` of a small corpus case | **rc 1** |
| six-channel corpus A/B | **1,433 of 1,712 rows** differ — all on BUILDRC(0/1) + BUILDMSG |
| — its BYTES channel (field 5) | **`1712 same`** |
| — its RUN channel (field 6) | **`1711 same`** |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` (new suite held out) | **31 failed** |
| `vl fmt --check compiler` / `vl check` | rc 0, clean (a different channel) |
| `vl run` of anything | **rc 0, clean — see below** |
| fuzz A/B, 300 programs | **identical findings — see below** |
| the new readback suite | FAILS: `rbyteStore(0, 1) content differs from rbyteAt: expected [0], got [98]` |

**Sabotage B — the CODE-POINT channel, at a FULL-CHUNK SEAM only.**
`cliCmdDataStore` replaces the last code point of a 16,384-element chunk with its
predecessor; fires only on a payload spanning more than one chunk.

| witness | reading |
| --- | --- |
| self-compile (fixpoint rung 1) | **rc 0, GREEN** — the byte channel is untouched |
| `vl check compiler/typecheck.vl` | rc 0, clean |
| `vl fmt --check compiler` | **rc 0, GREEN** — `--check` never reads the payload out |
| `vl fmt compiler`, content-compared | 2,731,700 differing bytes — but nothing standing does that compare |
| **six-channel corpus A/B** | **ZERO diffs on all six fields, 1,712 files** |
| fuzz A/B | identical findings |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` (new suite held out) | **2 failed** — both in `tests/vl_fmt_scale_test.ts` |
| the new readback suite | FAILS: `cliCmdDataStore(0, 16384) content differs from cliCmdDataAt` |

**Four findings worth more than the green run:**

1. **`vl run` is BLIND to a corrupted byte read-back, and that is why the fuzz
   channel is.** `vl run` compiles with `emit_names = true`, so the module's LAST
   section is the wasm **name** custom section — and wasmtime parses a malformed
   name section leniently and ignores it. Sabotage A zeroes exactly the last byte,
   which under `--names` lands in that custom section. So `vl run -e 'print(6*7)'`
   prints `42`, the corpus RUN field reads `1711 same`, and the fuzz harness (which
   drives `vl run --batch`) returns the SAME findings from a compiler that cannot
   produce a valid module. **The custom section is a shock absorber; `vl build`,
   which does not ask for names, is the channel that sees it.** Do not reach for
   `vl run` as the integrity witness of an emitted-bytes change.
2. **The corpus BYTES channel (field 5) read `1712 same` under BOTH sabotages** —
   the third time this exact blindness has been recorded, and the first on the OUT
   direction. Field 5 only compares when both legs return 0, and a corrupted
   read-back makes the leg return 1. For a read-back defect the live corpus
   channels are BUILDRC/BUILDMSG, and only for the byte half.
3. **The corpus is a total bystander for the CODE-POINT channel.** Sabotage B
   produced **zero** diffs over 1,712 files × six fields, because `vl check` and
   `vl build` only ever push a few hundred code points through `cliCmdData` — the
   seam is 16,384. The fixpoint ladder is green too. The channel's only standing
   witness turned out to be `tests/vl_fmt_scale_test.ts`, which formats a
   ~3,500-line file and asserts **idempotence** — a test written for an O(n²)
   regression, catching a linear-memory ABI defect by accident. That is one
   accidental test standing between this channel and a silent `vl fmt -w` that
   corrupts source files on disk, which is the whole argument for §7.8.
4. **A sabotage has to be characterised, not assumed.** "Drop the last byte of
   every chunk" was written as a per-chunk corruption; `cmp -l` says it lands on
   exactly ONE byte of a sub-chunk module, and that byte is often inside a section
   nobody validates. The witness table above is only meaningful because the
   sabotage was measured before it was believed.

### 7.8 The standing gate

`tests/selfhost_native_bulk_readback_test.ts` — 7 tests, **142 ms** — is the OUT
mirror of §6.6's intake suite and, per finding 3, the only instrument that names
this defect class:

- the ABI is exported at all (both `Store`s + the memory), and `cliCmdPathStore`
  is asserted ABSENT so §7.2's deliberate omission cannot rot into an accident;
- the window is a whole 64 KiB page (both chunk sizes derive from it);
- bulk-out == per-element-out EXACTLY over an **(offset, count) matrix** — offsets
  0/1/2/3/4/cap−1/cap/cap+1/2·cap/len−1/len × counts 0/1/2/3/4/5/7/8/cap−1/cap —
  on payloads deliberately longer than two chunks, for both channels;
- the whole module round-trips and still starts with `\0asm`;
- astral code points survive the string channel as ONE element each (a host that
  wrote UTF-16 units passes every ASCII assertion and fails this one);
- the guest clamps at the end instead of over-reading.

It reaches the seam without a fixture: the byte payload is a generated 60,000-char
string literal (~180 KB emitted) and the code-point payload is the CLI pump driven
to a `CMD_PRINT_OUT` of a generated 3,000-line file, both in-process. Both §7.7
sabotages fail it, and it names the offset and the chunk size where a ladder says
"parse error".

---

## 8. Item 2 — the identifier-interning arc: re-baselined, designed, and RE-ORDERED

§3 item 2 was the largest compiler-side item on the list, and this section is what happened
when its own precondition — **re-baseline before targeting** — was obeyed.
`docs/internals/identifier-interning-design.md` is the design (rulings, alternatives, the ID
space, the carrier, the invariant, the phase plan); this is the measurement and the record of
what shipped.

### 8.1 The re-baseline, and the finding that re-ordered the arc

Master `1517c7f6`, **12 warm guest runs, 20,985 samples**. `__str_eq__` 25.19 → **27.71**,
`__str_hash__` 4.75 → **5.62** — the pie SHRANK (#1312/#1313 took ~10% out at the host
boundary) so the string layer is a bigger share of it. `modSrcPush` 4.56 → 0.00, replaced by
`modSrcLoad` 2.32, exactly as §6 predicted.

Splitting the string primitives by what their CALLER is comparing, with an UNCLASSIFIED bucket
that is printed rather than dropped:

| class | share | |
| --- | ---: | --- |
| **SYMBOL / IDENTIFIER** | **19.59%** | the arc's target; 19.10% at `883dca44` — stable |
| TYPE | 9.13% | was 6.08%; the difference is the rep tree, now attributed |
| UNCLASSIFIED | 4.62% | diffuse, no member over 0.25% |
| **TOKKIND** | **2.47%** | **NEW — inside neither earlier number** |
| MODPATH | 1.21% | |

**TOKKIND is a class the earlier splits did not have**: the parser compares `tok.kind` against
string literals everywhere. It is a CLOSED ~60-element vocabulary, which is a different problem
from identifiers — it needs an enumeration, not a table (design §4.1).

> **§10 took this item and the last clause did not survive contact.** Re-baselined at
> `fb31405d` the class HELD (2.65% structurally; this 2.47% was measured by a name-based
> classifier that under-reads it). But the enumeration is ~570 sites, and the thing that
> actually moved TOKKIND was eight lines making `__str_eq__` short-circuit on `ref.eq` —
> because every string LITERAL is one pooled global, so `tok.kind == "IDENT"` compares a
> reference against ITSELF. §10.6 re-sizes what the enumeration is still worth.

**And then the ranking:** the SYMBOL class has NO hotspot. Its largest member is 3.07%
(`globalIndexOf`) and its top five total 10.31%. Chasing it consumer-by-consumer needs a
carrier for the id (design R3), and before any of that, **four of its largest measurable costs
turned out not to be about identity at all**:

| what | measured | what it actually was |
| --- | ---: | --- |
| `captureNamesOf` under `retCapturedMapShape` | **4.35%, and 100% of it from that ONE call site** | a full capture re-WALK per returned identifier, for every function in the program |
| `fnStmtsPosOf` under `emitReturnValue` | **4.34% of its 5.54% self** | the same O(functions) scan called FOUR times in one call frame |
| `nameNamesFunction` | **2.64%, 100% from `anonFieldCode`** | a whole-arena rescan per query |
| `parentLetOf` | 1.64% | `.has(k)` then `[k]` — two probes for one answer |

That is ~12% of a self-compile in four places, none of which an intern table would have
touched. **A fifth, `keywordKind` at 0.76%, is the item the filing named as phase-1 interning
material and is answered by a first-character dispatch instead** (design §4.1: interning would
pay one hash per identifier TOKEN to replace 19 length-compares, and would need ids whose
numeric values mean something, which ruling R2 forbids).

### 8.2 What shipped

Five strict behaviour-preserving rewrites, each with its equivalence argument at the site.

1. **`retCapturedMapShape` takes the conjunction's cheap half first** (`emit_classify.vl`). The
   arm answers "is this returned identifier a captured MAP", which requires BOTH that the name
   is in the capture set AND that its value kind is `"map"` — and `captureValKind`'s own first
   line is `parentBindingOf(fe, name)`, which returns `"i32"` at -1. So testing
   `parentBindingOf(fe, name) >= 0` first is exactly equivalent, calls nothing the original did
   not call on this path, and is O(1) for a frame with no parent — every top-level function.
2. **`emitReturnValue` hoists `fnStmtsPosOf`** (`wasmEmit.vl`) — one read under `fn.fnRet < 0`,
   four uses. This is a strictly WEAKER claim than the cross-call memo `fnStmtsPosOf`'s header
   rejects: it needs `fnStmts`/`monoOrigNode` stable inside ONE call frame, and both are written
   only by passes that complete before `emitCodeSection` starts. **The filed index stays filed** —
   what this adds to the filing is that three quarters of that scan's cost was one call site.
3. **`nameNamesFunction` folds the arena incrementally** (`emit_base.vl`) instead of rescanning
   it, resting on three facts pinned at their sites: the arena only grows, `addNode` takes a
   complete node so a FuncDecl's name is final at append, and the ONE in-place `fnName` write
   that lands afterwards (`emit_collect`'s lambda numbering) calls the new `noteFuncName`.
4. **`parentLetOf` probes once** — `plScanStmt`'s first line proves every stored value is >= 0,
   so `?? -1` is unambiguous and `.has` is redundant.
5. **`keywordKind` dispatches on the first character** (`lexer.vl`). Closed vocabulary, at most
   three keywords per bucket; a non-keyword costs one character read and a run of i32 compares.

### 8.3 Measured

Same input both legs, `.cwasm` warm, 24-core box at load 1.9, **interleaved min-of-21**:

| task | A (master) | B (branch) | |
| --- | ---: | ---: | --- |
| **`vl build compiler/entry.vl`** | 1,544 ms | **1,372 ms** | **−11.1%** |
| `vl check compiler/entry.vl` | 819 ms | 818 ms | −0.1% (control) |
| `vl check compiler/typecheck.vl` | 198 ms | 197 ms | −0.5% (control) |
| `vl fmt --check compiler` | 452 ms | 448 ms | −0.9% (control) |
| `vl check` of a one-function file | 4 ms | 4 ms | 0 (the floor) |

**The controls are not decoration here: all five changes are on the EMIT path, so `vl check`
and `vl fmt --check` are STRUCTURALLY flat** and any movement they show is the error bar. At
N=15 they read −1.5% and −1.6%; at N=21, −0.1% and −0.9%. Same lesson as §7.3.

Guest profile, 12 warm runs per leg, interleaved batches, absolute samples PER RUN:

| | A /run | B /run | |
| --- | ---: | ---: | ---: |
| `fnStmtsPosOf` | 97.8 | 40.9 | −58% |
| `nameNamesFunction` | 39.8 | 0.8 | −98% |
| `capScan`+`capIsBound`+`capRecord` | 32.7 | 6.2 | −81% |
| `__str_eq__` | 486.2 | 441.1 | −9.3% |
| `__str_hash__` | 102.3 | 93.6 | −8.5% |
| SYMBOL class | 341.0 | 293.5 | −13.9% |
| TOKKIND class | 40.9 | 31.0 | −24% |
| **all samples** | **1,712** | **1,549** | **−9.5%** |

**Byte delta:** 1,113,241 → **1,115,110 (+1,869)**.

**DETERMINISTIC COUNTS — one throwaway compiler that runs BOTH implementations at each
converted site and reports through `emitFail`** (the guest has no `print` that reaches a
`vl build`). One self-compile, arena 247,145 nodes:

| site | before | after | |
| --- | ---: | ---: | ---: |
| `nameNamesFunction` scan steps | **15,074,198** | **247,118** | 61× |
| — calls / OLD-vs-NEW answer disagreements | 61 / **0** | | the differential oracle |
| `captureNamesOf` calls from `retCapturedMapShape` | **4,176** | **0** | every reach skipped |
| `fnStmtsPosOf` calls from `emitReturnValue` | 35,908 | 8,977 | 4× |
| `fnStmtsPosOf` calls, whole compile | 46,037 | 19,106 | **−58.5%** |
| `parentLetOf` map probes | 1,590,610 | 795,305 | 2× |

The counts and the profile agree to within a point: −58.5% of `fnStmtsPosOf`'s CALLS against
−58% of its self-time, −98.4% of the fold's STEPS against −98%. And the residue is now sized:
`fnStmtsPosOf` still runs 19,106 times for **25,953,420 scan steps** (1,358 per call), which is
what §3 item 4's index would take.

### 8.4 The sabotage that NOTHING caught — and the test that now does

Six poisons, each compiled into a real compiler and run through the whole gate. The full table
is in the design's §6.6; the one that matters here:

**A COLLISION IN AN IDENTITY TABLE IS INVISIBLE TO EVERY STANDING INSTRUMENT.** Keying
`nameNamesFunction`'s set on `name[0]` — so `q` and `qq` share an entry, and so does every
other pair sharing a first character — produced a compiler that **self-compiles (rc 0), IS A
FIXPOINT OF ITSELF** (so `native-fixpoint.sh`'s stage3 == stage4 passes), diffs **ZERO of
1,713 corpus files on all six channels**, and passed **all 3,608 tests the suite then had**. Its only trace was
that the compiler it builds is 14 bytes different from the good one — which nothing compares,
because on a branch the compiler is supposed to change.

That is the fourth recording of the corpus reading `same` under a real defect (§6.7, §7.7 twice)
and the FIRST where the fixpoint ladder was blind too. New standing gate:
`tests/cases/objects/anon-field-value-name-not-a-function.vl` — `q` (an i32 binding) beside
`qq` (a function) in one anon-struct literal — which fails in both harnesses under the poison
and names the defect: `struct.new[0] expected type (ref 5), found global.get of type i32`.

The other five, for the record: `keywordKind` dropping one bucket arm → self-compile rc 1 +
**791 failed**; the hoisted `fnStmtsPosOf` reading a stale position → rc 1 + **675 failed**;
`parentLetOf`'s miss reading as node 0 → rc 1 + **75 failed**; the `retCapturedMapShape`
pre-gate forced always-false → **32 failed over 11 cases** in `closures/`+`maps/` (that is the
reorder's coverage number); and deleting the `noteFuncName` notification → **nothing at all**,
which is a stated VACUITY: the only names it can add are `__lambda_<n>` and nothing queries
that spelling. The line stays and the site says why, so a green run does not license deleting
it.

**A sabotage has to be characterised before its witness table is believed** (§7.7 finding 4,
again): weakening the same pre-gate from `>= 0` to `> 0` LOOKED like a sabotage and is nearly a
no-op — the only binding it drops is one at arena node 0. It moved four bytes of the compiler
and zero tests.

### 8.5 Gate

`fetch-seed.sh` → 1,113,241 bytes; `refresh-compiler.sh --prove-fixpoint`;
`native-fixpoint.sh` → stage3 == stage4 at 1,115,110; `SELFHOST_NATIVE_ALIGN=1 deno task test`
→ **3,610 passed / 0 failed / 7 ignored** (master's 3,606 + 4: two new corpus cases × two
harnesses), the ignored SET identical to master's; `lint-self.sh` clean; `rep-fuzz-check.sh`
exact. **Six-channel corpus A/B: 1,714 files, all six fields `same`.** **Fuzz A/B: 14 seeds ×
3 depths × 300 = 12,600 programs per leg, 80 findings each, same md5.** Seed-bootstrap: no
split — the published seed compiles this branch's source directly (nothing here is a new
language feature).

---

## 9. Item 2's PAYING PHASE — the table ships, and phase 3 converts

§8 designed the intern table and DEFERRED it on the measurement that the symbol layer's four
biggest costs were avoidable calls. This section is the phase that follows: the re-baseline on
the post-§8 profile, the table, and the conversion of the three whole-program name→index maps.
`docs/internals/identifier-interning-design.md` §8 holds the design side — including the two
rulings this phase had to ADD.

### 9.1 The re-baseline — the phase table held

Master `13f318ec`, **12 warm guest runs, 19,549 samples**, `.cwasm` warm, `$mNN` stripped.
The pie moved by §8's −11.1%; the ranking did not.

| % self | fn | | | % of all samples | consumer | phase |
| ---: | --- | --- | --- | ---: | --- | --- |
| 27.66 | `__str_eq__` | | | 3.20 | `globalIndexOf` | 3 |
| 5.81 | `__str_hash__` | | | 2.39 | `lookup` (checker) | 4 |
| 3.25 | `tokenize` | | | 1.68 | `fnIndexOf` | 3 |
| 2.73 | `__map_probe__` | | | 1.63 | `modRenamed` | 5 |
| 2.63 | `tyTopIndexOf` | | | 1.44 | `parentLetOf` | 3 |
| 2.57 | `modSrcLoad` | | | 1.35 | `variantIndexOf` | TYPE |
| 2.30 | `fnStmtsPosOf` | | | 0.96 | `objFieldType` | 4 |
| 1.28 | `__str_concat__` | | | 0.74 | `declaredSlotOf` | — |
| 1.07 | `modRenamed` | | | 0.70 | `paramTypeNode` | 4 |
| | | | | 0.68 | `scopeSlotOf` | 4 |

**phase 3 = 6.32%** (§8's table predicted 6.2), **phase 4 = 4.73%** (4.4), **phase 5 = 1.63%**
(1.6). String primitives total **37.49% of all samples / 610.7 per run**. `keywordKind` is
0.00 — §8.2's first-character dispatch, as recorded. **Nothing collapsed; the arc was aimed
at the right three tables, and this section converts phase 3.**

Two caller attributions decided HOW rather than WHETHER:

- **`globalIndexOf` is 93.9% reached through `globalLetOf`**, and `globalLetOf`'s callers are
  §8-§4.3's declined sibling-predicate run (`globalStructIndex` 0.36, `globalIsMap` 0.20,
  `globalIsNulRefArray` 0.20, `globalIsNulMap` 0.19, …) plus three ident resolvers.
- **`parentLetOf` is 84% reached through FOUR functions** — `unionNameOfIdent` 1.09,
  `identFnTypeAnnName` 1.00, `identClosureFe` 0.35, `identCopySource` 0.30 — *the same three
  that dominate `globalLetOf`.* Each resolves ONE identifier against BOTH tables.

### 9.2 R3 confirmed by a dead-exact WASH

The first build converted the three maps and left every caller passing a string. Measured:
the three consumers vanished and **`sidLookup` 4.07% + `sidOf` 2.26% = 6.33%** took their
place — against the **6.32%** they replaced.

**That wash is the phase's most important number.** It is the design's R3 sentence turned into
a measurement: *interning at the point of use has already paid the probe it was meant to
save.* Every point of value in this phase came from the next step — feeding the id from the
arena-node carrier at call sites that already hold an index.

### 9.3 What shipped

`compiler/symbols.vl` — one table, one leaf, importing only `ast` (R1). Whole-program id space
reset where `P.nodes = []` is (R2). The carrier `sidNode: i32[]` indexed by arena node,
filled lazily (R3), with the eight in-place name writers notifying (R4). `sidOf` mints,
`sidLookup` probes without minting, `sidText` is an array read, `sidArrGet/Put/Clear` are the
dense-array primitives (R6).

Converted: `globalNameMap` → `globalIndexBySid`, `fnNameMap` → `fnIndexBySid`,
`nestedNameSet` → `nestedNameBySid`, `parentLetOf`'s per-block map → generation-stamped
`plSidVal`/`plSidGen`, `startBlockLetOf`'s memo → generation-stamped `sblVal`/`sblGen`. Then
the call sites: the whole ident-resolution family takes a sid
(`unionNameOfIdentSid`, `identFnTypeAnnNameSid`, `identClosureFeSid`, `identCopySourceSid`,
`calleeCloSigKeySid` and the `calleeRet*`/`calleeReturns*` chain), the 18 `globalIs*` sibling
predicates take a sid, the 17 `fnRet*` predicates take a sid, and ~70 call sites feed them
`sidOfNode(<the node index they already had>)`.

**`emitIdentNode` is the shape that made R3 load-bearing**: one identifier read resolved
through SEVEN name-keyed lookups, and the arena index was already threaded in and named
`_exprIx` — unused. It is one array read now, and the other six are array reads too.

### 9.4 The DETERMINISTIC counts — one instrument, both implementations

A throwaway compiler that keeps the OLD `{[string]: i32}` maps alive beside the new arrays,
answers every query BOTH ways, counts the probes each scheme pays and compares the answers,
then reports through `emitFail` at the end of `emitProgram` (§8's counting channel — the guest
has no `print` that reaches a `vl build`). **One self-compile of `compiler/entry.vl`, arena =
247,754 nodes, 6,711 distinct symbols interned:**

| | count |
| --- | ---: |
| **string-keyed probes, OLD scheme** | **2,466,975** |
| **string-keyed probes, NEW scheme** (every `sidOf` + `sidLookup`) | **479,079** |
| | **5.15× — −80.6%** |
| **OLD-vs-NEW answer DISAGREEMENTS** | **0** of 2,371,115 compared |
| — `globalIndexBySid` queries | 1,223,033 |
| — `fnIndexBySid` queries | 340,228 |
| — `nestedNameBySid` queries | 8,846 |
| — `parentLetOf` queries / rebuilds | 799,008 / 9,965 |
| — `startBlockLetOf` queries | **0** |
| `sidOfNode` calls / fills | **1,946,211 / 95,018** |
| — i.e. the carrier is READ **20.5×** per intern, a **95.1% hit rate** | |
| `unionNameOfIdent`'s param scan: `__str_eq__` → i32 compares | 515,560 |

**The 95.1% hit rate is R3's justification, measured.** A scheme that interned at the point of
use would have paid 1.95 M probes where this one pays 95 K.

**Two numbers worth keeping past this PR.** `startBlockLetOf` is queried **zero** times on the
compiler's own source — its memo (and the `parentLetOf` thrash it was written to prevent) is
dead weight on this input, exactly as `rcmsWalks` was at §8. And `parentLetOf` still rebuilds
its block map **9,965 times for 799,008 queries** (80 queries per rebuild), which sizes what a
per-function cache would be worth if anyone wants it.

### 9.5 Measured

**Guest profile, interleaved A/B/A/B, 14 runs per leg, same input both legs (the branch
tree), `.cwasm` warm, 24-core box, load 2.3.** Absolute samples PER RUN, because a share of a
shrinking pie is not a saving:

| | A /run | B /run | |
| --- | ---: | ---: | ---: |
| `__str_hash__` | 89.6 | 55.8 | **−37.8%** |
| `__map_probe__` | 42.5 | 22.1 | **−47.9%** |
| `__str_eq__` | 436.8 | 419.5 | −4.0% |
| `plScanStmt` (the per-block build) | 8.8 | 6.0 | −31.7% |
| `sidOfNode` (the carrier's own cost) | 0.0 | **17.5** | new |
| **all string primitives** | **588.0** | **516.2** | **−12.2%** |
| **all samples** | **1,564.7** | **1,493.8** | **−4.5%** |

And the consumer table, which is the phase stated exactly:

| consumer | A /run | B /run |
| --- | ---: | ---: |
| `globalIndexOf` | 45.4 | — |
| `fnIndexOf` | 27.5 | — |
| `parentLetOf` | 22.7 | — |
| **phase 3, total** | **95.6** | — |
| `sidOf` | — | 21.4 |
| `sidLookup` | — | 11.0 |
| **its replacement, total** | — | **32.4 (−66%)** |
| … plus the carrier | — | 17.5 |
| **net** | **95.6** | **49.9 (−48%)** |

`lookup` — the CHECKER's scope chain, phase 4 — is now the largest single string consumer at
**2.83%**, up from #2.

**Wall clock, interleaved min-of-N, `.cwasm` warm.** A = the master-built compiler
(`13f318ec`, 1,115,110 bytes), B = the branch-built one (1,113,727). Four runs, because the
spread matters more than any single reading:

| run | N | load (start→end) | **`vl build` (self-compile)** | `vl check` graph | `vl check` one file | `vl fmt --check` | `vl check` tiny |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 21 | 186 → 23 | **−3.7%** | −0.9% | +0.0% | +0.6% | 0 |
| 2 | 21 | 1.9 → 2.7 | **−2.0%** | +0.5% | **+2.6%** | +1.0% | 0 |
| 3 | 41 | 1.9 → 2.1 | **−5.6%** | −1.0% | +1.1% | −0.5% | 0 |
| 4 | 41 | 2.0 → 2.8 | **−4.2%** | −2.2% | +0.5% | −0.7% | 0 |

**Read this table honestly: the headline is −2.0% to −5.6% and the control band is up to
±2.6%.** Run 2's `+2.6%` on a channel that cannot move (the whole conversion is emit-path;
`vl check` never enters `emitProgram`) is the measurement's own error bar, and it is
*larger than run 2's headline*. The converged pair (N=41, runs 3-4) reads **−4.2% / −5.6%
against a ±1.1% / ±2.2% band**, and it agrees with the interleaved profile's **−4.5%** and
with the deterministic count's arithmetic (2.0 M probes removed ≈ 10% of the profile's
hash+probe time, less the carrier's 17.5 samples/run) — three instruments, one answer.
**Quote −4.5% (the interleaved profile) as the number, not any single wall clock.**

**Byte delta:** 1,115,110 → **1,113,727 (−1,383)**. The conversion REMOVES bytes: five
`{[string]: i32}` map instantiations and their probe call sites cost more code than the
dense-array reads that replace them.

### 9.6 The poisons — fourteen, and the column that matters is WHICH instrument reddened

Every id-minting and id-invalidating path, poisoned into a real compiler and run through the
whole standing gate. `native-fixpoint`/`--prove-fixpoint` is shown as its own column because
for six of these it is the ONLY witness.

| poison | self-compile | fixpoint ladder | suite | the NAMED witness |
| --- | --- | --- | --- | --- |
| **P1 COLLISION — `sidOf` keys on the first character** | **rc 1** | — | **2,241 failed** of 3,610 | `arrays/array-slice.vl` +2,240 |
| **P1b TARGETED collision — `qq` and `q` share an id** | rc 0 | **BROKEN** | **4 failed** | `tests/cases/objects/anon-field-value-name-not-a-function.vl` (#1314's witness, in both harnesses) |
| P2a — writer 1/8, driver `n.fnName = modRenamed(…)` | rc 0 | HOLDS ‡ | 0 failed | **inert today** ‡ |
| P2b — writer 2/8, driver `n.letName` | rc 0 | HOLDS ‡ | 0 real† | **inert today** ‡ |
| P2c — writer 3/8, driver `n.identName` | rc 0 | **HOLDS — measured** ‡ | 0 real† | **inert today: 1,714/1,714 same on all six corpus channels** ‡ |
| P2d — writer 4/8, `emit_collect` lambda numbering | rc 0 | HOLDS ‡ | 0 real† | the suite + the corpus ‡ |
| P2e — writer 5/8, `emit_mono` registry hit | rc 0 | **HOLDS — measured** ‡ | **18 failed** | `closures/closure-alias-union-return-hof.vl` + 5 more in `generics/` |
| P2f — writer 6/8, `emit_mono` new instance | rc 0 | HOLDS ‡ | **19 failed** | `functions/value-flow-mono.vl`, `generics/body-type-param.vl` … |
| P2g — writer 7/8, `emit_mono` registry hit (call spine) | rc 0 | HOLDS ‡ | 0 failed | the suite + the corpus ‡ |
| P2h — writer 8/8, `emit_mono` specialization | rc 0 | HOLDS ‡ | 0 failed | the suite + the corpus ‡ |
| **P3 — the CARRIER survives an arena reset** | rc 0 | **BROKEN** | **1,273 failed** | `arith/typed-add.vl` +1,272 |
| **P4 — the SID-KEYED TABLES survive an id-space reset** | rc 0 | **BROKEN** | **18 failed** | `index/write-trap.vl`, `maps/list-of-maps-*.vl` — all 18 `array element access out of bounds`, **all 18 pass in isolation** |
| **P5 — `sidLookup` where the table is built LAZILY** | rc 0 | **BROKEN** | 0 real† | **the ladder alone** |
| P6 — `sidArrGet`'s absence test off by one (`>` for `>=`) | **rc 1** | — | **2,807 failed** | `arith/literal-add.vl` +2,806 |
| P7 — the carrier declines to name a `Param` | rc 0 | **BROKEN** | **177 failed** | `closures/closure-arm-nullable-scalar-result-union.vl` + 176 |

† **Characterised, not counted.** Four poisons showed 1-2 suite "failures" whose messages are
`glob match took 44942ms — backtracking regression` and `expected parallel scheduling: --jobs 4
took 2412ms … ratio 0.75` — load-induced TIMING tests, on a box running a compiler build and a
full suite back to back. The clean run of the same suite on the same tree is 3,610/0. They are
reported as zero. (**Characterise a sabotage's witnesses before believing them** — §8.6, third
recording, and this time the direction is the flattering one.)

‡ **THE `P2*` LADDER COLUMN WAS WRONG AND IS CORRECTED — see §9.6.1.** As first written every
P2 row read **BROKEN**, and findings 1 and 2 below were derived from that column. Re-measured
at merge time, **the ladder is BLIND to every name-writer poison**. The rows above now carry
the corrected reading. The non-P2 rows have NOT been re-measured and are left as filed.

**Three findings from this table.**

1. **THE LADDER IS BLIND TO ALL EIGHT NAME-WRITERS; THE SUITE AND THE CORPUS ARE THE
   WITNESSES.** (Corrected — §9.6.1 holds the measurements.) Disabling all eight notifications
   at once still self-compiles at rc 0, is a fixpoint of itself, and emits the CLEAN compiler
   source byte-for-byte identically — while reddening **31 suite cases and 15 corpus rows**.
   `scripts/native-fixpoint.sh` is still mandatory (it is the named witness for the COLLISION
   and reset classes), but on this layer it is the suite and the six-channel corpus A/B that
   are load-bearing, not the ladder. **The fuzz A/B is vacuous here** — 0 divergences over
   1,440 programs against the all-eight poison, because `fuzzgen` emits no generic/callback
   shape that reaches monomorphization.
2. **WRITERS 1–3 ARE STRUCTURALLY INERT TODAY, AND THAT IS A PROPERTY OF THE PIPELINE ORDER,
   NOT OF THE POISON.** Every `sidOfNode` caller lives in `emit_*`; the driver's module merge
   runs strictly before any emit pass, so `sidNode` is still empty when `modRw*` renames and
   `sidNoteNodeName` returns at its own `ix >= sidNode.length` guard. The three driver
   notifications therefore cannot change an output today — measured, not argued: P2c is
   1,714/1,714 same on all six corpus channels and a fixpoint. **Keep them.** They are the
   defence for the day a pass between the merge and emit probes the carrier, and that day
   arrives silently. What is NOT true is that an instrument would catch their removal.
3. **P4 IS THE ONE THIS PHASE ACTUALLY SHIPPED WITH, BRIEFLY.** It is not a hypothetical: the
   first build of the conversion had exactly this defect, and its 18 failures are how the
   sid-vs-name aliasing difference (design §8.3) was found. Every one of the 18 passes in
   isolation — the wasm harness's SHARED `WebAssembly.Instance` is the only instrument in the
   gate that can see it, which makes it this hazard's named witness and worth protecting.

### 9.6.1 The correction — the ladder column did not reproduce at the merge gate

The table above was filed with **BROKEN** in the fixpoint column of all eight `P2*` rows, and
the doctrine claim "six poisons redden ONLY the fixpoint ladder" was derived from it. Re-run
independently at the merge gate, on this branch's own tree, against a freshly fetched
`seed-latest` (1,115,110 B), **not one of the eight reproduces**. Method exactly as §5's row
prescribes: apply the poison, build `X` with the GOOD seed, `cmp` `compile(X, source)` against
`X`, restore the good seed before the next poison.

| re-measured | self-compile | `compile(X)==X` | suite | corpus A/B (6 ch.) | fuzz A/B |
| --- | --- | --- | --- | ---: | ---: |
| **all eight at once** (`sidNoteNodeName` body deleted) | rc 0 | **HOLDS**, `abcc33f4…` both stages | **31 failed** | **15 rows** | 0 / 1,440 |
| P2c alone (writer 3/8) | rc 0 | **HOLDS**, `b7328d4d…` both stages | — | **0 rows / 1,714** | — |
| P2e alone (writer 5/8) | rc 0 | **HOLDS**, `cmp` clean | — | — | — |

Three things follow, and the third is the one to carry forward.

1. **The aggregate refutes the whole column, not just the two rows spot-checked.** Disabling a
   SUPERSET of the notifications cannot repair a fixpoint that any subset breaks (barring a
   cancellation for which there is no mechanism), so an all-eight poison that holds means no
   single one breaks. The two singles were run anyway, because "cannot" is an argument.
2. **The all-eight poison is a real miscompile, and the instruments that see it are named.**
   Its 15 corpus rows are 13 build-rc/build-msg flips plus **two byte diffs, one of which is a
   `RUNOUT`** — `tests/cases/index/generic-trap.vl` runs to completion and prints something
   ELSE. Silently wrong output, caught by field 6 and by the suite, invisible to the ladder.
3. **The most likely cause of the original reading is the harness bug §5's own row warns
   about** — a `build/vl-compiler.wasm` left poisoned from the previous iteration makes
   `compile(X) == X` fail for *every* subsequent poison, which is exactly the shape of a
   column that reads BROKEN in all eight rows including the three that are provably inert.
   **This is inference, not measurement: the original runs were not preserved.** The
   transferable rule is the one that would have caught it at filing time — *a poison column
   that reads the same in every row is a claim about the HARNESS until one row is shown to
   differ*, and the cheapest way to show it is to poison something provably unreachable and
   confirm the column goes quiet. P2c is now that control, and it is checked in as one.

### 9.7 What did NOT ship, and the blocker phase 4 acquired

`lookup` is now the biggest single string consumer (2.83%) and the rewrite that would remove
it is small — `T.scopes` has ten real use sites, all in `typecheck.vl`, and a sid-indexed value
cell plus an undo log replaces an O(levels) chain walk at two probes per level with ONE array
read. **It is not free, and the reason is coverage, not difficulty.**

`emit_classify.vl` ~19500 and `emit_sections.vl` ~611/625/813 name `T.scopes[top][name] = v`
and `T.scopes.pop()` as the shapes their arms exist for — a write to an element of a GLOBAL
struct-field map-array, and a Member-receiver ref-list `.pop`. **Deleting the scope chain
deletes the self-compile's exerciser of both.** That is DELETE-THE-BYSTANDER in reverse, and
it has to be answered first: establish whether `tests/cases` covers those two shapes, add the
cases if it does not, and only then take the chain. Filed so the next slice starts at the
obstacle instead of rediscovering it after the diff is written.

Also sized here: `modRenamed` (phase 5) reads **1.82% / 27.1 samples per run** on the converted
profile — it went UP as a share, because it is 87% reached from `modRwExpr` and this phase did
not touch the merge. **§16 is phase 5**; both figures re-derive there, and both understate the
row — the self share is under half of what the function costs, and a second reader of the same
table is not named here at all.

### 9.8 Gate

Every rc read BARE (a pipe reports `tail`'s status, not the command's).

| gate | result |
| --- | --- |
| `rm -f build/vl-compiler.wasm && scripts/fetch-seed.sh` | 1,115,110 bytes |
| `scripts/refresh-compiler.sh --prove-fixpoint` | fixpoint in 2 compiles at **1,113,727** |
| `scripts/native-fixpoint.sh` | **stage3 == stage4** at 1,113,727 |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | **3,610 passed / 0 failed / 7 ignored** — the ignored SET identical to master's (all seven in `cases_wasm_test.ts`) |
| `scripts/lint-self.sh` | clean |
| `scripts/rep-fuzz-check.sh` | exact (1 baselined, 0 new, 0 stale) |
| **six-channel corpus A/B** vs the master-built compiler | **1,714 files, all six fields `same`** (`-o` path normalized) |
| **fuzz A/B**, 14 seeds × 3 depths × 300 = **12,600 programs per leg** | **180 findings each, identical md5** `8360086f8275186a…` |
| — and its SENSITIVITY, on a known-broken compiler (P7) | 40 findings → **139**, 117 differing lines — **the comparator reddens** |

**Seed-bootstrap: NO SPLIT.** The freshly fetched `seed-latest` (1,115,110, i.e. `13f318ec`)
compiles this branch's source directly — `compiler/symbols.vl` uses no language surface the
published seed lacks.

---

## 10. The TOKKIND slice — the vocabulary was never the lever, the COMPARE was

§8.1 filed a class the earlier profile splits did not have: **TOKKIND, 2.47%** — "the parser
compares `tok.kind` against string literals everywhere … a CLOSED ~60-element vocabulary, which
is a different problem from identifiers — it needs an enumeration, not a table". This section
re-baselines that class on the post-#1315 pie, sizes what the enumeration would actually cost,
and records the measurement that chose a different answer for a fraction of the price.

### 10.1 The re-baseline — the class did NOT collapse, and the name-based split under-reads it

Master `fb31405d`, **14 warm guest runs, 21,154 samples**, `.cwasm` warm, `$mNN` stripped,
24-core box at load 0.4.

The classifier used at §8.1 is a hand-written map from CONSUMER FUNCTION NAME to class, which
is the wrong instrument for a re-baseline: it scores the functions its author remembered. Run
unchanged on these samples it reads TOKKIND at **2.14%** — it misses `skipNewlines`, `accept`,
`kindAt`, `looksLikeObject`, `isStmtKeyword` and all of `modScan`, while counting `keywordKind`,
which is not a tok-kind consumer at all. So the split was re-derived **structurally**: walk each
string-primitive sample up to its first real consumer, then attribute that consumer to the
`compiler/*.vl` file that DEFINES it. That is a property of the code rather than of a list
(`vl-structural-census-beats-names`, again).

| defining file of the consumer | samples/run | % of all samples |
| --- | ---: | ---: |
| `emit_classify.vl` | 129.1 | 8.55 |
| `typecheck.vl` | 126.1 | 8.34 |
| `driver.vl` | 63.9 | 4.23 |
| `emit_rep.vl` | 50.4 | 3.34 |
| `symbols.vl` | 33.9 | 2.25 |
| `emit_base.vl` | 30.3 | 2.00 |
| **`parser.vl`** | **27.1** | **1.79** |
| `emit_query.vl` | 15.7 | 1.04 |
| `emit_sections.vl` | 11.6 | 0.77 |
| **`lexer.vl`** | **9.9** | **0.65** |
| `wasmEmit.vl` / `emit_collect.vl` / `ast.vl` / `emit_rewrite.vl` / `tyname.vl` | 16.3 | 1.07 |
| **all string primitives** | **514.2** | **34.03** |

TOKKIND read off that table member by member, with the non-members NAMED rather than absorbed:

| member | samples/run | |
| --- | ---: | --- |
| `parser.vl`, all consumers | 27.1 | `binPrec` 5.14, `parsePostfix` 3.64, `parseBlock` 2.36, `parsePrimary` 2.14, `parseStmt` 2.14, `parseUnary` 1.93, `expectClose` 1.07, then diffuse |
| — less `coalesceMixOp` | −2.0 | it compares operator LEXEMES (`&&`, `\|\|`, `??`) — a different closed vocabulary |
| `lexer.vl` `tokenize` | 7.1 | the three `!= ""` no-match sentinel tests, per token |
| `driver.vl` `modScan` | 7.9 | the import/export token re-scan; kind and text compares mixed |
| **TOKKIND** | **≈40.1** | **≈2.65%** |
| *(excluded)* `keywordKind` | 1.8 | compares IDENT TEXT to keyword spellings — an enumeration changes what it RETURNS; it cannot remove the compare |
| *(excluded)* `scanQuoted` | 0.9 | `__str_concat__`, escape decoding |

**2.47% → 2.65%: the class held, and the brief's refutation branch does not open.** Not because
nothing happened to it — #1314's own A/B moved it 40.9 → 31.0 samples/run — but because #1314
and #1315 removed SYMBOL-class cost, so TOKKIND kept its share of a smaller pie.

### 10.2 The census — 570 sites, and two thirds of them in one file

Every occurrence of a token-kind literal, over the 66-element vocabulary extracted from
`keywordKind`/`oneCharKind`/`twoCharKind`/`threeCharKind`/`mkTok`, by file and by role:

| file | total | `==`/`!=` | helper ARG (`expect("X")`, `accept("X")`) | `mkTok` | other |
| --- | ---: | ---: | ---: | ---: | ---: |
| `parser.vl` | **376** | 324 | 50 | 0 | 2 |
| `lexer.vl` | 88 | 1 | 0 | 9 | 78 |
| `driver.vl` | 76 | 76 | 0 | 0 | 0 |
| `typecheck.vl` | 16 | 15 | 1 | 0 | 0 |
| `format.vl` | 8 | 8 | 0 | 0 | 0 |
| `fuzzgen.vl` / `ast.vl` / `check_query.vl` / `fmt_util.vl` / `lint.vl` | 6 | 3 | 1 | 0 | 2 |
| **total** | **570** | 427 | 52 | 9 | 82 |

Two corrections the census makes to the filing. **45 of `driver.vl`'s 76 are one COLD
function** — `lexClsOf`, the LSP token classifier, at 0.00 samples on a self-compile. And
`format.vl`/`lint.vl`/`fmt_util.vl`/`check_query.vl`, named in the filing as comparison sites,
contribute **18 sites and zero self-compile samples** between them: `vl build` never formats.

### 10.3 The three filed designs, and the fourth the measurement picked

**(c) — intern the ~60 spellings through `compiler/symbols.vl` — is refuted by that file's own
header.** `sidOf` is one `__str_hash__` plus one probe and pays only where the caller already
holds the id (R3). A token kind is at most 18 characters and its `__str_eq__` usually fails on
the length compare, so interning AT THE POINT OF USE is strictly a loss; interning INTO `Tok`
is design (a) with a hash table where a constant would do.

**(a) vs (b) — and the ranking is the opposite of the obvious one.** The natural reading is
that (a) (an i32 `kindCode` ALONGSIDE `kind: string`) is the safe incremental option and (b)
(replacing the field outright) is the risky big-bang. Measured, the safety runs the other way:

```
$ cat t1.vl
const KC_A = 3
function f(): i32 { KC_A }
export function g(): i32 { const k = f() ; if k == "IDENT" { return 1 } ; 0 }
$ vl check t1.vl
[ERROR]: cannot compare i32 with string
```

Under **(b)** every one of the 570 sites that has not been converted is a hard type error: the
checker is a COMPLETE ORACLE for the conversion and it cannot be silently half-done. Under
**(a)** a missed site keeps comparing strings and still type-checks — the conversion is partial
and the only signal is a profile that under-delivers. That is
`vl-classifier-taught-half-a-set` with the checker offering to prevent it, and it is the single
thing that would make a 570-site rewrite tractable. **If the enumeration is ever taken, it is
(b).**

**(d) — the one the measurement chose: do not enumerate the vocabulary; make the COMPARE an
identity compare.** VL's `string` is `(array (mut i32))`, hence an `eqref`; and every distinct
string LITERAL in a program is interned as ONE immutable module global by the string-literal
pool (`emit_state.vl`'s `gStrPoolTexts`/`gStrPoolIx`, consumed by `emitStr`). So `tok.kind` on
an `IDENT` token and the literal `"IDENT"` in `parser.vl` are **the same object**, and
`__str_eq__` was walking five code points to discover it. A `ref.eq` short-circuit at the top of
the helper is **eight lines of `emit_sections.vl` and twelve bytes of emitted wasm** — and it is
not specific to token kinds at all: it fires wherever a value that came from a pooled literal is
compared against that literal.

### 10.4 What shipped

1. **`__str_eq__` opens with `ref.eq`** (`emit_sections.vl`). A pure short-circuit: same
   reference ⇒ equal, always; distinct references fall through to the existing walk. The null
   corner (`ref.eq(null, null)` would answer 1 where the old body trapped in `array.len`) is
   unreachable, and that was MEASURED rather than argued — a `string | null` operand is
   unwrapped BEFORE the call, so two null strings compared with `==` trap at the same address
   under both compilers instead of printing `EQ`.
2. **`binPrec` dispatches on the first character** (`parser.vl`) — §8.2 item 5's `keywordKind`
   recipe applied to the other closed vocabulary in the parser. The expression climber asks
   `binPrec` of every token that could follow an operand and the usual answer is `0`, which the
   `==` ladder charged **25 `__str_eq__` CALLS** to reach. Buckets hold at most six members and
   keep FULL string compares inside, because `(first char, length)` is not a unique key over
   this vocabulary — `STAREQ`/`STRING` both hash to (S,6) — and a cheaper in-bucket test would
   be exactly the identity COLLISION §8.4 records as invisible to every standing instrument.
   The dispatch narrows; it never decides.
3. **`tokenize`'s three no-match sentinel tests read `.length != 0`** (`lexer.vl`) instead of
   `!= ""` — three `__str_eq__` CALLS per token, ~all misses, to ask what `array.len` answers
   inline.

A static differential oracle checks (2): it extracts the `kind -> precedence` MAP from the old
body (`git show HEAD`) and from the new one and compares them as maps, and separately proves
every arm sits in the bucket its own first character selects. **25 arms both sides, zero
precedence disagreements, zero mis-bucketed arms.**

New standing case: `tests/cases/operators/precedence-ladder.vl` — every rung of the binding
ladder pinned so that a DROPPED arm (which answers `0` and silently truncates the expression)
or a MIS-BUCKETED one (which re-associates it) prints a different number. Neither failure mode
is a crash, and neither shows up in a fixpoint: a compiler that mis-parses `a - b * c` still
reproduces itself if it mis-parses its own source the same way twice.

Not shipped: the enumeration. §10.6 records what it is now worth and what it would cost.

### 10.5 Measured

**Guest profile, interleaved A/B/A/B, 14 runs per leg, same input both legs, `.cwasm` warm,
24-core box at load 0.4.** Absolute samples PER RUN, because a share of a shrinking pie is not
a saving.

| | A (master) | B (branch) | |
| --- | ---: | ---: | ---: |
| `__str_eq__` | 424.2 | 345.1 | **−18.6%** |
| all string primitives | 514.2 | 437.1 | **−15.0%** |
| — reached from `lexer.vl` | 9.9 | 3.9 | **−60.6%** |
| — reached from `parser.vl` | 27.1 | 16.9 | **−37.6%** |
| — reached from `emit_rep.vl` | 50.4 | 31.5 | −37.5% |
| — reached from `driver.vl` | 63.9 | 51.9 | −18.8% |
| — reached from `typecheck.vl` | 126.1 | 110.6 | −12.3% |
| **all samples** | **1,511.0** | **1,418.3** | **−6.1%** |

Per converted site: `binPrec` **5.14 → 0.57 (−89%)**, `tokenize` **7.14 → 1.29 (−82%)**.

**FOUR interleaved runs, because the spread matters more than any single one** (§9.5's lesson,
and this session had a machine that kept falling over, so every run is reported with the box it
ran on):

| run | A /run | B /run | delta | box |
| ---: | ---: | ---: | ---: | --- |
| 1 | 1,491.9 | 1,428.9 | −4.2% | busy |
| 2 | 1,511.0 | 1,418.3 | **−6.1%** | idle |
| 3 | 1,597.1 | 1,542.0 | −3.4% | still settling (5-min load 20.8) |
| 4 | 1,513.1 | 1,441.0 | −4.8% | idle |

**Quote −4.8%, the median; the range is −3.4% to −6.1%.** Run 3's A leg is 1,597 samples/run
against 1,492–1,513 for the others — the profiler's sample count scales with wall time, so that
row is a slow box inflating both legs, and it is the least trustworthy of the four. The
per-file deltas, by contrast, are stable across all four runs (`parser.vl` −36% to −38%,
`lexer.vl` ≈−60%, `emit_rep.vl` −30% to −38%) and `__str_eq__` reads −12.0/−16.0/−16.9/−18.6%.
**The structural deltas are the robust measurement; the whole-compile percentage is the noisy
one.**

**The attribution between `ref.eq` and the two TOKKIND rewrites, by two independent
instruments.** A separate interleaved A/B of the `ref.eq` change ALONE reads **−4.1%** against
master (12 runs/leg), and an interleaved A/B of ref.eq-only against all-three isolates the two
rewrites at **−0.7% / −10.7 samples per run** (12 runs/leg). The per-consumer deltas in the
headline run agree to within a third of a sample: `binPrec` −4.57 plus `tokenize` −5.85 =
**−10.4 samples/run of the total −92.7**. So **`ref.eq` is ~89% of the win and the two
TOKKIND-specific rewrites are ~11%** — and that is the finding, not a footnote: the class was
real, and the cheapest thing that moved it was not aimed at it.

The three percentages do NOT sum (−4.1 and −0.7 against a −4.8% median); they are separate runs
at different box loads. **Quote the direct master-vs-branch interleaved profile.**

**Wall clock, interleaved min-of-21, `.cwasm` warm — run TWICE:**

| channel | run 1 A → B | | run 2 A → B | |
| --- | ---: | ---: | ---: | ---: |
| **`vl build compiler/entry.vl`** | 1,279 → 1,226 ms | **−4.14%** | 1,353 → 1,297 ms | **−4.14%** |
| `vl check compiler/entry.vl` (graph) | 787 → 744 ms | −5.46% | 815 → 781 ms | −4.17% |
| `vl check compiler/typecheck.vl` | 189 → 181 ms | −4.23% | 202 → 188 ms | −6.93% |
| `vl fmt --check compiler` | 433 → 405 ms | −6.47% | 440 → 430 ms | −2.27% |
| `vl check` of a one-line file (the floor) | 5 → 5 ms | **+0.00%** | 5 → 5 ms | **+0.00%** |

The two runs agree on the headline channel to the second decimal (−4.14% both times) and the
floor reads exactly zero both times, which is the control behaving.

**There is no structurally-flat control for this change and that is worth stating plainly.**
Unlike §8 and §9, whose conversions were emit-path only, `ref.eq` is whole-program: every
channel that compares strings SHOULD move, and all four do, in the same direction and by
roughly the profile's margin. The only channel that cannot move is the seed-load floor, and it
reads exactly zero. Where §9.5 had to discount a `+2.6%` control, here the flat channel is flat
and the moving channels agree with the profile.

**Byte delta:** 1,113,727 → **1,113,946 (+219)**. Note the compiler needs THREE compiles to
reach its fixpoint on this branch rather than the usual one, because `build/vl-compiler.wasm`'s
own `__str_eq__` is emitted by whatever compiler built it: the seed emits a stage-1 without the
fast path, and stage-1 emits a stage-2 with it.

**And the same twelve bytes, confirmed across the corpus.** 937 of the 1,715 corpus files emit
`__str_eq__` at all; every one of those 937 differs by **exactly +12 bytes** and the other 778
are byte-identical. Nothing else in the emitter moved.

### 10.6 What did NOT ship — the enumeration, re-sized

After this branch the TOKKIND residue is `parser.vl` 16.9 + `lexer.vl` 3.9 = **20.8 samples/run
= 1.47%**, plus `modScan`'s kind-compare share of 7.0. An enumeration would take most of it —
call it **1.5–1.9% of a self-compile for ~570 sites across 7 files**, 376 of them in
`parser.vl`.

Three things a future slice should not have to re-derive:

1. **It is design (b), not (a)** — §10.3. Replacing `kind: string` with an i32 makes `vl check`
   a complete conversion oracle; adding a field alongside it does not, and a half-converted
   parser reads as a disappointing profile rather than an error.
2. **The renderer is small.** There are **47 `.kind` READS** in all of `compiler/*.vl` and NO
   host or test reader — `tok.kind` never crosses the wasm boundary. A `tokKindName(code)`
   consumed by `kindDesc`/`foundDesc` covers the whole rendering surface.
3. **Mint the string FROM the code; never mint both at the producer.** If `mkTok` takes the code
   and sets `kind: tokKindName(code)`, a two-kinds-one-code collision cannot make the two
   disagree — and it becomes VISIBLE, because the rendered spelling in an `expected …` message
   changes and the corpus's CHECKMSG channel reddens. Minting them independently is the silent
   version, and silent identity collisions are the class §8.4 and §9.6 both had to learn twice.

Also filed, unfixed and now sized: `driver.vl`'s `modScan` (7.0 samples/run after this branch)
re-scans each module's token stream for imports/exports with kind and text compares mixed, and
`coalesceMixOp` (1.1) compares operator LEXEMES against `"&&"`/`"||"`/`"??"` — a second closed
vocabulary, never enumerated, small.

### 10.7 The poisons — and the CONTROL that proves the column measures the code

Seven poisons, each compiled into a real compiler from the freshly restored good seed and run
through the ladder and the whole suite. §9.6.1's correction is obeyed literally: **the good seed
is restored before every row** — and checked, not assumed, because an interrupted sweep left
both `emit_sections.vl` and `build/vl-compiler.wasm` carrying P2's residue exactly as that
finding predicts — and a **provably-unreachable poison is included as a control** so the column
can be shown to go quiet.

Two notes on reading the ladder column. An emitter-shape poison changes the emitted
`__str_eq__`, so stage1 ≠ stage2 for BYTE reasons alone; the honest question is whether the
sequence CONVERGES, so the column reports **stage2 == stage3**, which is what
`refresh-compiler.sh --prove-fixpoint` actually asks. The clean branch converges in three
compiles for exactly the same reason.

The WITNESS column runs five named cases DIRECTLY against the poisoned compiler, one `vl`
process at a time, and diffs rc+stdout against the good one. It replaced "run the 3,612-case
suite" for two reasons, and the second is §10.7.1's own story: the suite's answer to "which
instrument reddens" is a NUMBER when the ledger wants a NAME, and `deno test --parallel` fans
out a `vl` child per case, which against a poisoned compiler under the NULL collector is a bomb.
The suite still runs, but only where the LADDER HOLDS — i.e. where the poison produced a working
compiler and a pass/fail count means something.

| poison | self-compile | ladder | witnesses (of 5) | suite | the NAMED witness |
| --- | --- | --- | --- | --- | --- |
| **P0ctl — CONTROL, `binPrec`'s length guard `< 2` → `< 1`** | rc 0, 1,113,946 | **HOLDS** | **0 RED** | **3,612 / 0 failed / 7 ignored** | **— every column quiet, as it must be** |
| **P1inv — the `ref.eq` fast path INVERTED** (identical refs fall through, DIFFERENT refs answer 1) | rc 0, 1,113,953 | **BROKEN** | **5 RED** | skipped | everything |
| **P2zero — the fast path answers 0** (a string is unequal to ITSELF) | rc 0, 1,113,946 | **BROKEN** | **5 RED** | skipped | everything |
| **P3drop — `binPrec` DROPS the `PERCENT` arm** | rc 0, 1,113,932 | **BROKEN** — stage2 cannot compile the compiler | **2 RED** | skipped | **`operators/precedence-ladder.vl`** + `arith/ops.vl` |
| **P4bucket — `USHR` MIS-BUCKETED under `S`** (so `>>>` answers 0) | rc 0, 1,113,934 | **BROKEN** — stage2 cannot compile the compiler | **2 RED** | skipped | **`operators/precedence-ladder.vl`** + `bitwise/shifts.vl` |
| **P5prec — `PERCENT` returns the WRONG binding power** (10, not 11) | rc 0, 1,113,946 | **HOLDS — a fixpoint of itself** | **1 RED** | **2 failed** | **`operators/precedence-ladder.vl` — AND NOTHING ELSE IN THE GATE** |
| **P6len — the lexer's no-match sentinel always says "matched"** | rc 0, 1,113,946 | **BROKEN** — stage2 cannot compile the compiler | **5 RED** | skipped | everything |

**P5prec is the row this PR's test case exists for, and it is the §8.4 shape again.** It builds
a compiler that self-compiles at rc 0 and **IS A FIXPOINT OF ITSELF** (stage2 == stage3, same
1,113,946 bytes as the clean branch), mis-associating `a - b % c` the whole time — because a
compiler that mis-parses its own source the same way twice still reproduces itself. Its only
trace anywhere in the standing gate is the two failures of
`tests/cases/operators/precedence-ladder.vl` (once per harness). `bitwise/precedence.vl`,
`bitwise/shifts.vl`, `arith/ops.vl` and `strings/basics.vl` all read `same`. **Without the case
this PR adds, P5prec ships green.**

The witness column also separates the three parser poisons, which a count could not:
`precedence-ladder.vl` is the only case that reddens for all of P3drop, P4bucket and P5prec;
`bitwise/precedence.vl` reddens for none of them.

### 10.7.1 The harness finding — and the control is what produced it

The suite column melted this machine repeatedly: `deno test` went 2.5 GB → 27.4 GB in under
twenty seconds, and on a later attempt the box fell from 15 GB available to 1.3 GB in five
seconds at load 149 with **no single process over 8.5 GB** — death by AGGREGATE. Two guards were
built for it. The first, a 10 GB per-process cap, never fired. The second watched
`MemAvailable`, fired correctly, and then reported **OOM in four consecutive rows** — including
two whose `cp` had silently failed so they were running the GOOD compiler, and one whose ladder
had CONVERGED.

**A column that reads the same in every row is a claim about the harness** (§9.6.1 finding 3,
third recording), and the provably-unreachable control settled it: P0ctl produces a compiler
whose ladder converges and whose five witnesses all read `same`, and its suite run STILL melted
the box from a quiesced start. The poison could not be the cause.

**The cause is the `.cwasm` sidecar.** Every row `cp`s a new `build/vl-compiler.wasm`, which
invalidates its 10 MB compiled sidecar; then 24 `deno test` workers each Cranelift-compile the
same 1.1 MB WasmGC module simultaneously. The same suite against a warm sidecar finishes in
**four seconds at rc 0**. One serial `vl check tiny.vl` after the `cp` — about two seconds —
removes the hazard entirely, and P0ctl's suite then read a clean 3,612/0/7.

Three things to carry forward:

1. **Warm the sidecar serially after any write to `build/vl-compiler.wasm`, before any parallel
   consumer.** This is a property of the harness, not of this branch.
2. **A poisoned compiler is a memory hazard, not just a failing one.** `vl` runs the compile
   engine under the NULL collector, so a poison that damages a length or a loop bound becomes
   unbounded allocation. Restoring the good seed between rows is a SAFETY INTERLOCK; two crashes
   in this session left `emit_sections.vl` and `build/vl-compiler.wasm` poisoned, and every row
   after that measured the residue.
3. **The earlier "1 failed"/"2 failed" readings on the control were harness artifacts too** —
   the load-induced `glob match took …ms` and `--jobs 4 … ratio 0.75` timing tests that §9.6's
   footnote † had to characterise away. With a warm sidecar they do not fire at all. That
   footnote can be retired for this class of run rather than re-applied.

### 10.8 Gate

Every rc read BARE (a pipe reports `tail`'s status, not the command's).

| gate | result |
| --- | --- |
| `rm -f build/vl-compiler.wasm* && scripts/fetch-seed.sh` | **1,113,727 bytes** (`fb31405d`) |
| `scripts/refresh-compiler.sh --prove-fixpoint` | rc 0 — fixpoint in **3 compiles** at **1,113,946** |
| `scripts/native-fixpoint.sh` | rc 0 — **stage3 == stage4** at 1,113,946 |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | **3,612 passed / 0 failed / 7 ignored** (master's 3,610 + 2: the new case × two harnesses); ignored SET md5 `a4295be3bf18e7367d730e02a02d3b43` — **identical to master's** |
| `scripts/lint-self.sh` | rc 0, clean |
| `scripts/rep-fuzz-check.sh` | rc 0, exact (1 baselined, 0 new, 0 stale) |
| **six-channel corpus A/B** vs the master-built compiler | **1,715 files.** Fields 1/2/3/6 (CHECKRC, CHECKMSG, BUILDRC, **RUN**) **all `same`**. Fields 4/5 differ on **937** rows — every one by **exactly +12 bytes**, the emitted `__str_eq__` prologue; the other 778 emit no `__str_eq__` and are byte-identical. BUILDMSG moves with BYTES because `vl build` echoes the size. |
| **fuzz A/B**, 14 seeds × 3 depths × 2 modes × 300 | **50,400 programs per leg, 0 divergences** |
| **the fixpoint needs 3 compiles, not 1** | expected and explained: `build/vl-compiler.wasm`'s own `__str_eq__` is emitted by whatever compiler built it, so the seed emits a stage-1 without the fast path and stage-1 emits a stage-2 with it. The control confirms it — master source under the master seed is a ONE-step fixpoint. |

**Seed-bootstrap: NO SPLIT.** The freshly fetched `seed-latest` (1,113,727, i.e. `fb31405d`)
compiles this branch's source directly; `ref.eq` is an opcode the emitter already writes
elsewhere (`wasmEmit.vl`'s closure equality) and nothing here is new language surface.

---

## 11. The storage class of a top-level binding — a script's loop stops being 4x slower than a function's

A top-level `let`/`const` lowered to a module GLOBAL. A mutable wasm global is
observable module state, so an engine must keep it in memory across anything that could
read it; a local lives in a register. The consequence is that **the first program a new
user writes is the slow spelling of itself**:

| program shape | wall (master) |
| --- | ---: |
| top-level `let s: f64` accumulate loop, 10^10 iterations | **16,839 ms** |
| the identical loop inside `function run(): f64` | 4,041 ms |
| top-level `let s: i64` loop | 4,588 ms |
| the identical loop inside `function run(): i64` | 2,181 ms |

`deno eval` of the equivalent JS is 5.47 s, so VL LOST to JS on the one-liner spelling
and won comfortably on the function spelling. Confirmed by disassembly: the top-level
loop body is `global.get $global$0` / `global.set $global$0` per iteration where the
in-function version is `local.get` / `local.set`.

**The optimizer will not do this for us.** The cells are not exported and the module has
exactly one function, and `wasm-opt --closed-world -O3 --gufa -O3` still leaves 7 global
ops in the loop (16.5 s after). The choice of storage class belongs to the emitter.

### 11.1 What shipped

`computeGlobalPromotion` (`compiler/emit_sections.vl`) gives a qualifying top-level
binding a LOCAL of the synthetic start function instead of a cell, and the binding emits
no cell at all — `gCellIdx` re-densifies the survivors and `userGlobalIdx` is the single
index translation that reads it. **The binding STAYS in `globalStmts`**, which is the
design's load-bearing restraint: `globalCellKind`, `letIsLitUnion`, `letIsNulBoolAnn`
and every other classifier keep asking about the same `LetDecl` and keep answering the
same thing. Promotion moves the VALUE, never the BINDING, so no kind ladder, niche flag
or narrowing table is touched. The slot is registered under `<name>#g`, a spelling no
source identifier can produce, so nothing resolves to it by name either.

### 11.2 The safety predicate

Four clauses, all four required. P2/P3 are `globalPromotable`; P1/P4 are
`computeGlobalPromotion`.

| | clause | why |
| --- | --- | --- |
| **P1** | the module HAS a top-level statement list | a binding in a pure-library module has nothing to be faster for, and this guarantees `hasStart` is already 1 — promotion can never MINT a start function |
| **P2** | the cell kind is a plain numeric scalar (`i32`/`i64`/`f64`/`f32`) | for exactly these, `fbValtypeNullable(ck, cs)` and `fbValtype(ck, cs)` are the same byte, so a local is a drop-in for the cell; and they are precisely the kinds `emitIdentNode`'s non-const `ref.as_non_null` recovery already excludes, so no read-side path changes shape |
| **P3** | the binding has an initializer | the global section already rejects one without, and a slot has no other way to acquire a value |
| **P4** | every `Ident` node IN THE WHOLE ARENA spelling this name is inside the top-level region | rules out a named function body reading it, a lifted lambda capturing it, a monomorphized clone mentioning it, and any mention reached by a path the emitter does not model |

**P4 is computed in the conservative DIRECTION, and that is the whole argument.** The
obvious implementation — walk each function body looking for the name — is unsound under
a walker hole: a shape the walk does not know hides a reference and the binding is
promoted anyway. So the walk goes the other way. `promoMark` marks the top-level region
(never descending into a nested `FuncDecl`, because a lifted lambda's body is its own
wasm function that still addresses the cell), and a FLAT SCAN of the entire arena —
exhaustive by construction, no walker involved — vetoes any binding named by an
unmarked `Ident`. A hole in `promoMark` leaves a mention unmarked, which REFUSES the
promotion. Every hole costs population; none costs soundness.

P4 subsumes the export question rather than testing it: an `export let` produces no
export entry at all (`exportSlotOfTarget` matches `FuncDecl`s only), the name section has
no global-name subsection, and a VL program runs BY INSTANTIATION — the start section IS
the top level, nothing before it, nothing after. The start function's frame is the whole
observable lifetime of a binding no other function names.

### 11.3 The failure ladder has three rungs, and none of them is silent

`emitUserGlobalGet` / `emitUserGlobalSet` (`wasmEmit.vl`) are now the only producers of a
USER cell's `global.get`/`global.set` — the string-literal pool is `fbGlobalGet`'s only
other caller — so cell-vs-local is one decision no emit site can bypass. A promoted
binding reached outside `emitStartFnCode`'s context window (`gPromoInStart`) is an
`emitFail`, not a wrong opcode. **Sabotaged, in that order:**

| sabotage | what happens |
| --- | --- |
| **A** — P4's veto made a no-op (`gPromoOk[gj] = 1`) | `promoted-scalar-start-locals.vl` still correct; `promotion-blocked-by-function-read.vl`, `cross-function.vl` and `mutate-in-loop.vl` become LOUD emit rejects naming the source position: `emitProgram: promoted top-level binding read outside the top-level statement list` at `…:8:9`. 2 of the 3 structural tests redden; the promotion test stays green |
| **B** — promotion disabled entirely (P1 always returns) | **every program still prints exactly the right thing.** Nothing behavioural moves. Only the structural assertions redden, 5≠0 and 2≠1 |
| **C** — A *and* the `emitFail` net removed | still loud, one rung down: `is not a valid WebAssembly module`. The slot is not even assigned while a user body is emitted, so the wrong-frame read emits an out-of-range local index and fails validation |

**Sabotage B is the finding worth keeping.** The behavioural corpus — 1,720 files with
`@log` oracles — is COMPLETELY BLIND to this optimization being switched off, because a
correct program is correct in either storage class. That is exactly why
`tests/vl_global_promotion_test.ts` counts global-section entries instead of trusting the
oracle, and why the inverted control asserts EXACTLY ONE rather than "at least one": zero
would mean a binding a function reads got promoted, two would mean the fixture stopped
testing anything.

### 11.4 The population

Global-section entries per corpus program, both compilers, A minus B:

```sh
# per corpus file: vl build with each compiler, then
wasm-tools print out.wasm | grep -c '^  (global '
```

**182 of the 1,442 corpus programs that build (12.6%) promote at least one binding;
538 bindings in total.** The largest single program promotes 35.

**The compiler itself promotes ZERO, and P1 is not the reason.** `compiler/*.vl` has 588
top-level `let`/`const` declarations and no top-level statements at all, so P1 declines
first — but a probe that RELAXES P1 (`startStmts.length < 0`) and rebuilds still emits
**2,280 globals, unchanged**. P4 vetoes all 588: every top-level binding in a compiler is
module state read from function bodies, which is what module state IS. So the
self-compile is untouched by this item, and "relax P1 to reach the compiler" is refuted
rather than filed.

### 11.5 The speedup

Wall clock, **interleaved** A/B (the two compilers alternate sample by sample, so box
drift lands on both legs — a block-sequential run of the same eight programs read a
monotonically falling series that invents a difference), median of 5, load 7.30.

| program | master | branch | ratio | min ratio |
| --- | ---: | ---: | ---: | ---: |
| top-level `let s: f64` loop | 16,839 ms | **4,081 ms** | **4.13x** | 4.12x |
| the same loop in `function run(): f64` | 4,041 ms | 4,077 ms | 0.99x | 1.00x |
| top-level `let s: i64` loop | 4,588 ms | **3,481 ms** | **1.32x** | 1.24x |
| the same loop in `function run(): i64` | 2,181 ms | 2,156 ms | 1.01x | 0.97x |
| Mandelbrot, working vars at top level | 3,471 ms | **2,553 ms** | **1.36x** | 1.34x |
| Mandelbrot, working vars block-scoped | 2,379 ms | 2,528 ms | 0.94x | 0.99x |
| sieve, counters at top level | 2,526 ms | 2,442 ms | 1.03x | 1.06x |
| sieve, counters block-scoped | 2,651 ms | 2,614 ms | 1.01x | 0.97x |

**THE NOISE FLOOR IS STATED BY THE MODULES, not by a repeat count.** The two
`function run()` programs declare no top-level binding at all, so both compilers emit
**byte-identical wasm** for them (`cmp`-equal) — whatever ratio they read is the
instrument. They read 0.99x and 1.01x on medians, 1.00x and 0.97x on minima: **the floor
is +-3%**, and the block-scoped Mandelbrot's 0.94x median is inside it (its minima read
0.99x).

**The headline is the convergence, not the ratio.** After promotion the top-level and
in-function f64 programs read 4,081 ms and 4,077 ms — the same program, as their now
byte-identical loop bodies say they should be. The one-liner spelling stopped being the
slow spelling, and VL stopped losing to `deno eval` (5.47 s) on it.

**Two things this measurement REFUTES about itself:**

1. **A "realistic program" is not automatically a promoting program.** The first
   Mandelbrot and sieve I wrote declared their working variables inside the loop bodies —
   already start-function locals — and read 0.95x and 1.00x. They are kept above as
   controls. Promotion pays only where a promoted binding is touched in the hot path,
   which is why the sieve's top-level variant only reads 1.03x: its inner loop is
   dominated by the `flags[m] = 0` array store, and `flags` is a ref cell that P2
   excludes.
2. **The i64 pair does NOT converge and this is not attributed.** `wasm-tools print`
   shows the two i64 loop bodies are byte-identical after promotion, yet 3,481 ms vs
   2,156 ms is a stable 1.61x apart across every sample. Whatever that residue is, it is
   not a storage class — the f64 pair with the same structure converges to 0.1%. Filed
   as observed, with no mechanism claimed.

### 11.6 The byte delta

| | |
| --- | --- |
| the compiler | 1,114,399 -> **1,119,281 bytes (+4,882)** — ALL of it the new emitter source; the compiler promotes nothing (§11.4) |
| corpus, 1,442 programs built by both legs | **net -974 bytes** |
| the 1,260 programs that promote nothing | **+0 bytes, on every single one** |
| the 182 that promote | -974 net; 96 smaller, 78 larger, 8 unchanged |

**The per-binding model, and why some programs GROW.** A const-init cell costs
`valtype + mut + init + end` = init+3. Promoted, it costs a locals-vector run (2) plus
`init + local.set` (init+2) = init+4. So **+1 byte per promoted CONST-init scalar** —
visible bare in the largest grower, which promotes 35 bindings for exactly +34 bytes. A
NON-const cell instead loses its zero-init constexpr (an `f32.const 0.0` is 5 bytes) and
keeps the same store, so it shrinks 3-6. The corpus is net negative because the f32/f64
cells dominate; a program of nothing but `const` i32s pays a byte each for its registers.

The zero on all 1,260 non-promoting programs is the stronger half of this table: the
change is exactly inert where it does not fire.

### 11.7 Gate

Every rc read BARE (a pipe reports `tail`'s status, not the command's).

| gate | rc | result |
| --- | ---: | --- |
| `rm -f build/vl-compiler.wasm && scripts/fetch-seed.sh` | 0 | **1,114,399 bytes** (master `154e14f8`) |
| `scripts/refresh-compiler.sh --prove-fixpoint` | 0 | fixpoint in **2 compiles** at **1,119,281** |
| `scripts/native-fixpoint.sh` | 0 | **stage3 == stage4** at 1,119,281 |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | 0 | **3,652 passed / 0 failed / 7 ignored** — the ignored COUNT is the documented 7, so the native prereqs held and the run is readable |
| `scripts/lint-self.sh` | 0 | clean (self-lint + fmt-check) |
| `scripts/rep-fuzz-check.sh` | 0 | exact — 1 baselined, 0 new, 0 stale |
| **six-channel corpus A/B**, 1,720 files | — | CHECKRC **0 differ**, CHECKMSG **0**, BUILDRC **0**, BUILDMSG 176, BYTES 176, **RUN 8** |
| **fuzz A/B**, 14 seeds x 150 x depths 3-5 | — | **identical finding sets** — 1 each (the baselined REJECT), md5 `bc11dae2de25ec29bcd6be5a706fcb75` both legs |

**The RUN channel's 8 rows are the wasm BACKTRACE ADDRESS, and the corpus has no other
divergence.** Every one is a `@trap` case whose stderr carries `0x9f - vl!<wasm function
4>`; the rc is identical on all 8, the trap reason is identical on all 8, and normalizing
`0x<hex>` to `0xADDR` takes the differing set to **ZERO rows**. A change that moves module
bytes moves the address a trap reports, and 8 of 1,720 corpus files print one. Worth
recording as a property of the channel: **RUN is not address-stable, so a byte-moving
change should classify its RUN rows before reading them as behaviour.**

BUILDMSG moves with BYTES because `vl build` echoes the size it wrote.

**The fuzz channel's REACH was measured rather than assumed**, per the standing rule
against banking a zero from a vacuous run. Generating a batch and comparing declared
globals per case: **22 of 400 generated cases promote exactly one binding (5.5%)** —
thin, but real, so the identical finding sets above are evidence. (The generator emits
one top-level statement, `go()`, which satisfies P1; most of its top-level `const`s are
closure- or composite-typed and P2 declines them.) The reach probe is
`scripts/fuzzgen.vl` split on `===CASE` with `wasm-tools print | grep -c '^  (global '`
under each compiler.

**Seed-bootstrap: NO SPLIT.** The freshly fetched `seed-latest` compiles this branch's
source directly. Nothing here is new language surface — the emitter writes `local.get` /
`local.set` and registers locals through `addLocalName` exactly as `emitFuncCode` does.

### 11.8 What is NOT promoted, and what the next slice would be

- **Every ref-typed cell** (string, list, map, struct, closure, union, and all their
  nullable forms). A non-const ref cell is declared NULLABLE and every read recovers with
  `ref.as_non_null`; a local of the same kind is non-null. Reconciling those two valtypes
  is the whole of the next slice and is deliberately not attempted here.
- **Any binding in a module with no top-level statements** (P1) — including all 588 of
  the compiler's, though §11.4 shows P4 would have vetoed them anyway.
- **Any binding whose NAME appears anywhere in any function body**, even when that
  mention is a same-named local of that function. P4 is name-keyed, not binding-keyed;
  making it binding-keyed would add population at the cost of the property that makes the
  flat arena scan exhaustive.

---

## 12. PERF item P1 — `return_call` in tail position, and the flag the host does not set

`perf-landscape.md` §5 P1, shipped. A call standing alone as a function's entire return
value now lowers to wasm `return_call` instead of `call` + `return`.

### 12.1 The measurements

Interleaved A/B, min-of-5, `taskset -c 2-5`, load average 4.7–5.0 (shared box).
**Noise floor measured, not assumed**: the same bytes run as both sides of the harness
read 0.985 with 4–6% within-side spread, consistent with the suite's documented 7%.
Quoted at BOTH optimizer levels, because a win visible only under `wasm-opt` is a
different claim:

| benchmark | level | before | after | ratio (min) |
|---|---|--:|--:|--:|
| `recursion/tailcall` | `vl build` default | 1179.8 ms | 585.5 ms | **2.01x** |
| `recursion/tailcall` | `-O3` | 1161.8 ms | 581.3 ms | **2.00x** |
| `recursion/mutual` | `vl build` default | 1557.6 ms | 793.4 ms | **1.96x** |

Matching the filed 2.06x / 1.97x. **`-O3` cannot recover this**: `wasm-tools print` of the
baseline `-O3` module contains ZERO `return_call`, so the emitter has to choose it.
Read the ratios, not the absolutes — one baseline rep read 3793 ms under contention
against a 1179 ms min, which is exactly why min-of-N is the statistic.

The emitted module for `bench/recursion/tailcall` is **byte-identical to the hand-patched
prototype** the landscape measured, which is the strongest available confirmation that the
emitter reproduces the thing that was measured.

### 12.2 The capability, which is not a speed claim

`digestTail(5_000_000, 0)` traps `wasm trap: call stack exhausted` on master and prints
`407392` here. Pinned as `tests/cases/functions/tail-call-depth.vl`, which also carries a
mutual-recursion descent and a NON-tail control (`1 + sumDown(n-1)`) so that ordinary
frame-consuming recursion is pinned as still frame-consuming.

**This is the one intended behavioral change in the corpus**, and the six-channel A/B
below isolates it to that single file.

### 12.3 Which tail positions are covered, and which are declined

COVERED — a DIRECT call to a user function that is the last thing written when a
result-position `return` is terminated. That includes explicit `return f(x)`, an implicit
trailing tail value, and each arm of a tail-position `if`/`else`. Self- and
mutual-recursion both convert.

The tail-position test is a WRITE CURSOR, not a syntactic search: `emitDirectCall` records
`(tailCallEnd, tailCallIdx)`, and the terminator fires only when `tailCallEnd == wLen()`
and the trailing bytes still spell that exact call. Two conditions for the reason
`uBoxNewEnd`'s header already states — an operand can spell any opcode, so the byte
pattern alone proves nothing, and the cursor alone proves nothing. Both are reset per
function, so a cursor left by one body can never be read as another's.

DECLINED, deliberately:

- **A VOID enclosing function.** This is the ONE place the soundness argument in §12.4
  breaks: `return` tolerates leftover operands beneath the result, `return_call` does not,
  so a void caller with a value-returning callee would validate before and not after.
  Declined rather than reasoned about.
- **A union-box RETURN SINK function.** Its exits are branches to a single exit block whose
  emission is gated on `uSinkFired`; a tail call is neither a branch nor a box
  construction. Kept disjoint instead of ordered.
- **`call_ref` (closure / captured calls).** `return_call_ref` exists and is a real
  follow-up; not attempted here.
- **`call_indirect`** — VL emits none today (see P2).

### 12.4 Why no result-type comparison is needed

`return_call`'s validation rule is the SAME subtyping condition on the callee's results
that the `return` being replaced already imposes. So wherever `call f` immediately followed
by `return` validates, the fused form validates. **Verified against the real validator
rather than assumed**: a callee returning a concrete `(ref $s)` tail-called from an
`anyref`-returning function validates (`wasm-tools validate --features all`), and a genuine
`[i32]` vs `[i64]` mismatch is rejected. The arity hole is the void case, declined above.

### 12.5 THE HOST FLAG — a required companion change outside this PR's partition

**`vl build -O` and `-O3` HARD-FAIL on any module containing `return_call`**:

```
[wasm-validator error in function 0] unexpected false: return_call* requires tail calls
  [--enable-tail-call]
Fatal: error validating input
Error: wasm-opt ... failed (exit Some(1))
```

`BINARYEN_FEATURES` in `scripts/vl-host/src/main.rs` is
`--enable-reference-types --enable-gc --enable-bulk-memory` and must gain
**`--enable-tail-call`**. Verified: with the flag, the identical invocation exits 0 and the
`return_call` survives the whole `--closed-world -O3 --gufa -O3` profile.

This is the same class as the `--enable-bulk-memory` note already in
`tests/selfhost_native_opt_test.ts` — binaryen 130 hard-fails validation on an opcode it
was not told about, rc=1 and no output file — and it is pinned there for exactly this
reason. `wasm-dis` (the `--wat` path) is NOT affected; it does not validate.

**CI is green without it today only by luck of population**: the six `selfhost_native_opt`
cases (`arith/ops`, `objects/struct`, `strings/basics`, `loops/while-sum`,
`tostring/numbers`, `maps/basics`) happen to contain no tail-position user call, and all
six pass. The bootstrap is unaffected — `refresh-compiler.sh` and `native-fixpoint.sh`
never invoke `-O`. But `vl build -O3` on any tail-recursive user program fails today.

### 12.6 Host verification — three engines, plus the one that is retired

The emitted compiler ITSELF now contains `return_call`, and the playground and LSP
instantiate that module, so engine support is not only a question about user programs.

| host | engine | result |
|---|---|---|
| `scripts/vl-host` (`vl run`) | wasmtime, `wasm_gc` + `wasm_function_references`, **never sets `wasm_tail_call`** | **runs** — prints `91392`, the module's `meta.expect` |
| `tests/support/runWasm.ts` (`deno task test`) | deno 2.9.0 / V8 14.9 | **runs** — `logs=["91392"]`; 5M-deep descent also returns `407392` |
| `lsp/src/wasmCheckerNode.ts` path | Node v24.18.0 / V8 | **runs** — `logs=["91392"]` |
| `scripts/wasmtime-host.rs` | wasmtime, same `Config` | **retired spike** — no build wiring, docs-only, in no gate. Not executed; the identical `Config` is verified above. |

NOT verified, and stated as such: a real BROWSER for `playground/`. The support floor
argues it is safe — WasmGC ships no earlier than tail calls in any of the three engines
(Chrome 112 tail calls / 119 WasmGC; Firefox 121/120; Safari 18.2 both), so an engine that
can already run VL's WasmGC compiler can run its tail calls — but that is an argument, not
a measurement.

### 12.7 The gate

| leg | rc | headline |
|---|--:|---|
| fresh `seed-latest` + `--prove-fixpoint` | 0 | fixpoint at stage 3, `compile(next2) == next2` |
| `native-fixpoint.sh` | 0 | stage3 == stage4 byte-for-byte |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | 0 | **3659 passed / 0 failed / 7 ignored** (7 is the baseline; ~600 would mean voided prereqs) |
| `lint-self.sh` | 0 | self-lint + fmt-check clean |
| `rep-fuzz-check.sh` | 0 | 1 baselined failure, 0 new, 0 stale |
| corpus A/B, six channels, 1,721 files | — | see below |
| fuzz A/B, 6,000 cases | — | identical finding sets (32 = 32) |

**Compiler size: 1,120,712 → 1,118,836 bytes (−1,876).** `return_call <idx>` is one byte
shorter than `call <idx>` + `return`, so the compiler's own tail-call population is legible
in the delta.

### 12.8 The corpus A/B, and the two normalizations it needs

Six channels (check rc / check out / build rc / **build stderr** / run rc / run out) over
all 1,721 files under `tests/cases`, master's `seed-latest` against this branch. Build
stderr is not optional: `vl build` exits 1 BOTH for a clean emit reject and for an invalid
module, so without it an invalid-wasm → clean-reject change reads as no difference.

Raw: **1,721 records differ** — all harness artifact. Two normalizations, in order:

1. The per-invocation `mktemp -d` path in `wrote /tmp/tmp.XXXX/m.wasm`. Random per run, so
   it differs even A-vs-A. → 96 records left.
2. The module SIZE in that same line, which is EXPECTED to move here. → **1 record left.**

That one record is `tests/cases/functions/tail-call-depth.vl`, the new fixture: `R_RC=1`
with a `call stack exhausted` backtrace on master, `R_RC=0` on this branch. **RUN is
identical on 1,720 of 1,721 files**, and the 96th minus that fixture is 95 files whose only
change is a smaller module.

The first normalization is worth naming: an unnormalized six-channel A/B on this harness
reads 100% differing and means nothing. Diff the channels, then subtract what the harness
itself varies — A-vs-A is the control that tells you which is which.

### 12.9 The fuzz leg is CLEAN but its REACH is unproven — do not bank it

Identical finding sets, 32 REJECT on each side, empty diff. **But the reach probe reads
zero**: of the cases the run retained, 0 contained a `return_call` at all. Per the standing
rule against banking a zero from a vacuous run, that clean result is WEAK evidence and is
not what this change rests on. The load-bearing instrument is the corpus A/B, whose reach
IS demonstrated — 95 files changed emitted size, i.e. 95 files actually took the rewrite.

### 12.10 What was dropped, and one refutation worth keeping

**P6 (fuse `a/b` and `a%b`) — DROPPED, not attempted.** The fusion is only sound if it
cannot move a trap. `i32.rem_s(INT32_MIN, -1)` returns 0 while `i32.div_s(INT32_MIN, -1)`
TRAPS, so lowering the remainder as `a - q*b` introduces a divide the source did not ask
for; and when the remainder is spelled BEFORE the quotient, hoisting the divide can move a
trap ACROSS an intervening side effect. Both are answerable — the arithmetic identity
itself is exact, since `|q*b| <= |a|` cannot overflow and the subtraction wraps back — but
the sign/edge grid that would prove it was not built, and a fused remainder that changes
which case traps is a soundness bug, not a 1.99x.

**P10 (`const` → immutable global) — DROPPED for lack of evidence, but the filed population
is WRONG in the interesting direction.** The landscape asks whether #1321's start-local
promotion has emptied it. It has NOT, and the surviving shape is specific:

> a top-level `const` is promoted to a start-function local only when nothing reads it from
> inside a function body. **A `const` read from inside a function must stay a real wasm
> global** — and that is precisely the loop-bound case P10 is about.

Measured at this commit, `const ci: i32 = 1_000_000` read from inside `work()` emits
`(global (;1;) (mut i32) i32.const 1000000)`; a const `string` and a const `i32[]` also
survive as `(mut …)` cells, while `const` i64/f64/boolean bindings used only at top level
are promoted away and emit no cell. So the population is non-empty and is exactly the
perf-relevant one.

The one-line change (emit mutability `0x00` for a `const` in `emitGlobalSection`'s
constexpr arm) was implemented and reverted unshipped. It is sound by construction — both
writers are excluded, since the checker rejects assignment to a const name and the start
function runs only the initializers `globalRunsInStartFn` claims (promoted or
non-constexpr), which that arm is neither — and it verifiably emits immutable cells that
still run. **What is missing is the only number that matters**: whether an immutable cell
actually lets binaryen fold the loop bound. P10's filed value was always "enables
downstream folding", so shipping it without that measurement would prove nothing. The next
attempt should measure the fold before writing the patch.

## 13. PERF item P2 — a closure's code pointer stops being a `funcref`

VL's closure fat-pointer was `{ code: funcref, env: structref, id: i32 }` and every call
read field 0. **In wasmtime a `funcref` cannot live in the GC heap as a pointer**, so that
`struct.get` does not lower to a load — it lowers to the builtin host call
`get_interned_func_ref` (`wasmtime-internal-cranelift-47.0.2/src/func_environ/gc.rs`,
carrying wasmtime's own TODO to remove it). The mirror libcall
`intern_func_ref_for_gc_heap` runs on every `struct.new`. So a function value cost a host
call **per call** and a second one **per creation**, and `emitMfInvoke` paid the first
**once per element** of every `.map`/`.filter`.

Field 2 already held `gImports + fe`, the callee's wasm function index, kept only as the
`==` identity token. That is exactly `call_indirect`'s operand. The funcref is now gone.

### 13.1 What shipped

| site | before | after |
| --- | --- | --- |
| `emit_sections.vl` element section | DECLARATIVE segment (flags `0x03`), no table | a `funcref` **table** of `gImports + n` entries (new section 4) + an **ACTIVE** segment at offset `gImports` |
| `emit_sections.vl` closure struct | 3 fields, field 0 `funcref` | 2 fields: `{ env: structref, id: i32 }` |
| `wasmEmit.vl` `emitClosureValueCore` | `ref.func` + env + id | env + id |
| the three read sites | `struct.get 0; ref.cast $fnsig; call_ref $fnsig` | `struct.get 1; call_indirect $fnsig` |

The segment offset is `gImports` so that **table slot `i` holds wasm function `i`** — the
stored id indexes the table with no translation, which is why nothing else had to learn a
bias. The leading `gImports` (≤ 5) slots stay null; they mirror the imported functions,
which are never function-value targets.

`emit_bytes.vl` gains `fbCallIndirect` and loses `fbRefFunc`/`fbCallRef` — with them
`OP_REF_FUNC` and `OP_CALL_REF`, because `vl check --severity info` (the `lint-self.sh`
gate) fails on an unused function and would have caught them anyway.

**Field numbering moved, and that is the whole risk surface.** Env went 1 → 0 and id
2 → 1, so all eight remaining reads had to move together. The layout has a property worth
recording: the two surviving fields have **different valtypes** (`structref` and `i32`),
so any read left at the old index is a wasm **validation** failure, never a silent
misread. The one thing validation cannot catch is the table MAPPING — a segment written
at the wrong offset sends a call to a different function of the same signature, which
`call_indirect`'s type check accepts. That is what the new corpus case exists for.

### 13.2 Soundness is preserved, and the design doc's claim was already wrong

`docs/internals/selfhost-lambdas-design.md` §3.2 chose the funcref representation partly
on "mismatched call = **validation** error" versus the table's "runtime trap". **That was
never true of what shipped.** Field 0 was declared a GENERIC `funcref` (deliberately — so
one closure struct serves every arity), so the call site had to `ref.cast` it to the
concrete `$fnsig`, and a `ref.cast` is a RUNTIME check. The guarantee was always a
runtime trap; `call_indirect` performs the same runtime signature check against the same
type index, so it is the same guarantee, not a weaker one.

Demonstrated rather than asserted. No VL source spelling can deliver an arity-2 callee to
an arity-1 call site, so the wrong-signature closure was injected at the wasm level — the
closure built for `(i32)=>i32` was made to carry `(i32,i32)=>i32` while the call site kept
its arity-1 `$fnsig`:

| module | edit | result |
| --- | --- | --- |
| master | `ref.func 5` → `ref.func 6` | validates, then **`wasm trap: cast failure`** |
| this branch | `i32.const 5` → `i32.const 6` | validates, then **`wasm trap: indirect call type mismatch`** |

Both trap; neither runs the wrong function. The two failure modes a table has that a
field does not also trap rather than misbehave: an id landing on a null slot is
`uninitialized element`, and one past the end is `undefined element: out of bounds table
access`. The trap TEXT differs between the two representations, and no corpus case
observes it — the six-channel A/B's RUN channel, which carries trap reasons, is identical
on all 1,722 files.

### 13.3 Measured

Interleaved min-of-5 (every configuration once per round, fixed order, so load drift hits
both sides), `taskset -c 6`, prebuilt modules, empty-program startup subtracted, with a
byte-identical copy of the A module run as its own configuration to measure the floor.
**Three passes**: two against master at `25b1d785` on a quiet box, one against master at
`fc15b17e` (post-rebase, so it includes P1 and P11) under heavy contention.

| pass | load (before → after) | noise floor, identical bytes |
| --- | --- | --- |
| 1 | 0.66 → 1.96 | **0.76%** |
| 2 | 1.79 → 1.86 | **0.35%** |
| 3 (rebased) | 36.25 → 15.70 | **2.55%** |

Every ratio below is quoted across all three passes. Nothing here is within the floor.

| benchmark | master | this branch | **x (default)** | master -O3 | branch -O3 | **x (-O3)** |
| --- | --: | --: | --: | --: | --: | --: |
| `algorithms/lambda-hot` | 2085–2145 ms | 458–464 | **4.50 / 4.54 / 4.68** | 163–175 | 168–175 | 1.00 / 1.04 / 1.00 |
| `algorithms/dispatch-table` | 1142–1187 | 361–386 | **2.98 / 3.17 / 3.23** | 1197–1227 | 247–258 | **4.90 / 4.76 / 4.75** |
| `.map`, 10M callbacks | 141–144 | 52–56 | **2.58 / 2.52 / 2.75** | 40–43 | 40–44 | 0.91 / 0.99 / 1.01 |
| 50M closure CALLS | 483–484 | 65–66 | **7.34 / 7.34 / 7.37** | 19–20 | 20 | ~1.00 |
| 50M closure CREATIONS + calls | 3113–3132 | 110–113 | **28.4 / 28.3 / 27.8** | ~20 | ~20 | ~1.00 |

**The call win and the creation win are different libcalls, so they are measured
separately.** `call-only` holds one closure and calls it 50M times; `alloc-call` is the
same program with the creation moved inside the loop (verified in the disassembly: the
`struct.new` really is in the loop body). The difference between them, on one compiler, is
the cost of one closure creation.

| | master | this branch | saved |
| --- | --: | --: | --: |
| per closure CALL | — | — | **8.35–8.37 ns** |
| per `.map` ELEMENT | — | — | **8.50–9.16 ns** |
| closure CREATION | **52.6–53.0 ns** | **0.87–0.95 ns** | **51.7–52.0 ns** |

Creation collapses to under a nanosecond because, with no funcref in it, the record
becomes an ordinary struct that Cranelift can **scalar-replace** when it does not escape —
the same reason §4.2's creation ladder read 2.1 ns for an i32 field against 56.4 ns for a
`ref.func` one.

### 13.4 What the report claimed, and what the measurement says

| claim | measured | verdict |
| --- | --- | --- |
| `lambda-hot` **5.4x** | **4.50–4.68x** | **too high** — real, but a sixth smaller |
| `dispatch-table` **3.3x** | **2.98–3.23x** | slightly too high |
| **−9.4 ns** per `.map` element | **−8.5 to −9.2 ns** | confirmed at the low end |
| **−41 ns** per closure allocation | **−51.7 to −52.0 ns** | **too low** — the allocation win is 26% bigger than filed |
| the funcref read costs 9.40 ns | 8.35 ns per call | confirmed within noise |
| "the self-hosted compiler itself uses closures" | **false** — see 13.6 | refuted |

Two further results the filing did not predict:

- **P2 does not compose with `-O3` on `lambda-hot`; it composes on `dispatch-table`, and
  there it rescues `-O3` outright.** On `lambda-hot` binaryen already devirtualizes and
  deletes the closure, so `-O3` is unchanged (1.00x) and still 2.6–2.8x faster than this
  branch's default build — the remaining gap is inlining, not dispatch. On
  `dispatch-table` the target is genuinely dynamic and devirtualization is impossible:
  master's `-O3` is a **0.94–0.97x pessimization**, and with P2 the same flag becomes a
  **1.42–1.55x win**. Filed at 4.75–4.90x, the largest single ratio in the set.
- **`-O3` on `.map` is a wash either way** (0.91 / 0.99 / 1.01 across three passes — the
  0.91 sat outside pass 1's floor and did not reproduce, so it was noise, not a
  regression).

### 13.5 Gate

| leg | rc | headline |
| --- | --: | --- |
| `fetch-seed.sh` (fresh `seed-latest`) | 0 | seed-latest moved mid-session; both the old and the new one compile this source |
| `refresh-compiler.sh --prove-fixpoint` | 0 | fixpoint holds; **same bytes from two different seeds**, which is the property that matters |
| `native-fixpoint.sh` | 0 | stage3 == stage4 byte-for-byte |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | 0 | 3,665 passed, 0 failed, **7 ignored** (the baseline count — not ~600, so prereqs held) |
| `lint-self.sh` | 0 | self-lint + fmt-check clean |
| `rep-fuzz-check.sh` | 0 | exact — 1 baselined, 0 new, 0 stale |
| **six-channel corpus A/B**, 1,722 files | — | CHECKRC 0, CHECKMSG 0, BUILDRC 0, BUILDSTDERR 0, RUNRC 0, **RUN 0** — only BYTES moves |
| **fuzz A/B**, 7 seeds incl. `--branching` | — | identical finding sets on every seed |

**The corpus A/B is clean on all six behavioural channels and moves only module SIZE**:
412 of 1,722 modules change, **net −3,123 bytes**, 296 smaller and 116 larger, from −127
to +5. The largest shrinks are closure-dense files (a `ref.cast` plus a `ref.func` per
closure outweigh the table); the +5 rows are `functions/nested*`, where a program builds
one capturing closure and pays the table section's fixed cost against almost no saving.

Two instrument notes, both of which would have produced a false clean:

- **The shared six-channel harness normalizes `0x<hex>` but not the per-invocation
  `mktemp` directory**, which appears in `vl build`'s own "wrote …" line. Un-normalized,
  **1,442 of 1,720 files "differed"** — every one of them spuriously, and a real
  difference would have been indistinguishable in that noise. The temp path has to be
  normalized rather than the line dropped, because that same line carries the module byte
  count, which is the one channel that legitimately moves here.
- **Fuzz REACH was measured, not assumed.** The emitter only emits section 4 when a
  function value exists, so the table's presence in the output IS the reach oracle:
  **39 of 400 generated modules (9.75%) emit one** (70 of 400 spell `=>` in source; the
  rest are rejects or type-only spellings). The identical finding sets are therefore
  evidence rather than a vacuous zero.

**Seed-bootstrap: NO SPLIT.** A freshly fetched `seed-latest` compiles this branch's
source directly — the change adds no language surface, only two byte emitters.

### 13.6 What could not be verified, and what is deliberately left

- **The self-hosted compiler does not exercise this path.** `compiler/*.vl` uses no
  function values (`fnValUsed == 0`), so its own module has **zero tables and zero
  `call_indirect`** and the bootstrap ladder is silent on the change — `compile(next) ==
  next` at the first rung held precisely because the emitter's own output is unaffected.
  The briefing expected a mistake here to "break the bootstrap loudly"; it would not. The
  load-bearing gates are the corpus, the suite and the fuzz A/B, not the fixpoint.
- **V8 is verified; a browser is not.** `tests/cases_wasm_test.ts` runs the whole corpus
  through `tests/support/runWasm.ts` on deno/V8 — a different engine from wasmtime, where
  a funcref field is an ordinary load — and it is **1,654 passed / 0 failed**, including
  the new case. The playground/browser path was **not** verified: this worktree has no
  browser and the playground tests run under deno, so they are the same V8 evidence, not
  new evidence.
- **The `-O3` module was checked for the O3-NOOP hazard** (`vl build -O3` writes the
  unoptimised module and exits 0 when it cannot find `wasm-opt`): every `-O3` build is
  byte-different from its `-O0` twin, asserted per benchmark in the build script.
- **The identifiers still say `call_ref`** — `emitCallRef`, `callRefSlot`,
  `fnUsesCallRef`, `blockHasCallRef`. They name the function-VALUE call path, not the
  instruction, and renaming them is a mechanical sweep across ~110 sites in five files
  that would bury this change and collide with concurrent work. The COMMENTS that
  asserted the removed mechanism (a funcref field, `ref.func`, a call-site `ref.cast` on
  it) were rewritten; the path names were not.
- **The complementary hoist is not attempted, and the 10.6x it was filed at does not
  survive P2** — §13.7 re-derives it at **1.12x**. It does NOT compose with this change;
  it is the same saving counted twice.
- **`return_call_indirect` is now available and unused.** P1 (#1324) emits `return_call`
  for a direct call in tail position; a function-value call in tail position could take
  `return_call_indirect` (`0x13`) by the same rule. Not attempted here.

### 13.7 G2 (P2 follow-on (a), the loop hoist) re-derived — **1.12x, not 10.6x**, and NOT taken

Workboard G2 carries "hoist the closure unpack out of loops — **10.6x** where it applies
(1072.7 → 101.5 ms)". **That number belongs to P2 and has already been banked.** It comes
from `perf-landscape.md` §4.2's WAT ladder, where the thing being hoisted above the loop
was the **funcref** field read — the 9.40 ns `get_interned_func_ref` libcall §13 deleted.
The same ladder's last row is the shape P2 shipped (i32 table index + `call_indirect`,
146.2 ms). Hoisting on top of THAT can only remove what is still in the loop: two ordinary
field loads, priced by rows 2 and 3 of the same ladder at 0.15 + 0.14 = **0.29 ns**. So the
ladder's own arithmetic caps the follow-on at ~1.26x, and 10.6x is the same saving counted
a second time.

Measured rather than left as arithmetic. Three constructed witnesses, `scripts/p7-time.sh`
(interleaved, min+median of user+sys CPU ms, `taskset -c 2-5`), stdout asserted equal
across every module before timing, and a **byte-identical copy of the A module timed as its
own configuration** so the floor is per-witness rather than per-rig.

**Witness 1 — a capturing lambda in a local, called 50,000,000 times, nothing else in the
loop.** Four modules: `A` as the emitter writes it, `A2` a byte-identical copy of `A`, `N`
with only the `callRefSlot` spill removed, `B` with both `struct.get`s hoisted above the
loop. Plain `vl build` (no `wasm-opt`). Three runs, min-of-9 / min-of-7 / min-of-11:

| module | loop body | cpu_min (ms) | vs A |
|---|---|--:|--:|
| `A` | spill + `struct.get 0` + `struct.get 1` | 113 / 113 / 111 | — |
| `A2` | **identical bytes to A** — the floor | 113 / 116 | **1.00 / 0.97** |
| `N` | spill removed, both loads still in the loop | 114 / 112 | 0.99 / 0.99 |
| `B` | both loads hoisted above the loop | 100 / 100 / 99 | **1.13 / 1.13 / 1.12** |

**0.26 ns per call** ((113−100) ms / 50M), against 0.29 ns predicted by the ladder. The
`callRefSlot` spill costs **nothing** — Cranelift coalesces the copy — so the whole of the
residual is the two loads, and a peephole that only deletes the spill buys zero.

**Witness 2 — the same loop with the closure arriving as a PARAMETER**, so nothing can
scalar-replace it. Min-of-7, floor (identical bytes) 4% on that run:

| rung | in-loop | hoisted | x |
|---|--:|--:|--:|
| default | 118 | 108 | 1.09 |
| `-O` | 145 | 127 | 1.14 |
| `-O3` | 121 | 100 | 1.21 |

**Witness 3 — `.map` over 1,000 elements × 10,000 reps = 10M callback invocations**, the
`emitMfInvoke` path P2 flagged as the widest exposure. Default rung: 47 → 46 ms against a
control of 49. **Inside the floor and not resolvable** — 10M × 0.26 ns is 2.6 ms of a 47 ms
run, and `.map` is allocation-dominated.

**`wasm-opt -O` ALREADY PERFORMS THIS TRANSFORM whenever the closure does not escape.**
Read out of the disassembly, not assumed: at `-O`, witness 1's closure struct is gone
entirely (`Heap2Local` scalarises it — env and id become locals set before the loop, the
loop body is `local.get env / arg / local.get id / call_indirect`), and witness 3's `.map`
is the same. It does **not** happen for witness 2, where the closure is a parameter: both
`struct.get`s stay in the loop at `-O` **and** at `-O3`. So the population G2 can still pay
on is "a closure the optimiser cannot scalar-replace (a parameter, an array element, a
field), called in a loop that does not rebind it" — plus everything at the plain `vl build`
rung.

**Not taken, and the reason is the size, not the shape.** The source-level hoist is a
targeted transform, not a general LICM: the closure struct's two fields are **immutable**
(`{ env: structref, id: i32 }`, neither declared `mut`), so no call in the loop can
invalidate a cached unpack and the whole soundness condition is "the callee `Ident`'s
binding is declared outside the loop and is neither assigned nor shadowed inside it". That
is P5's `loopHoistOpen` shape — a name-keyed scan plus a loop prologue plus two frame slots
per hoisted site — and P5's own whitelist cannot be reused, because it declines **any**
call and a closure call is a call. M-sized machinery for a ≤1.26x ceiling that `-O` already
reaches on the scalarisable majority.

The `emitMfInvoke` variant is ~20 lines and needs no analysis at all (the emitter owns both
the local and the loop, so `cL` is provably written once before it), but witness 3 says it
is unmeasurable. It would still add two slots to the `.map`/`.filter` frame of every
function that uses one, i.e. a corpus-wide byte move for a win under the floor.

## 14. PERF item P5 — the list header stops being re-read once per element access

`compiler/wasmEmit.vl emitListIdxGuard` re-loads a list's backing-array ref
(`struct.get 0`) **and** its `len` (`struct.get 1`) on every single element
access. §4.5 of the landscape bisected 9.9% of `matmul` to exactly that, and
nothing downstream recovers it: the ref SSA value differs each iteration, so
Cranelift can neither GVN the length load nor LICM the object-size chain, and
`wasm-opt -O3` will not move a `struct.get` past an `array.set` it cannot prove
non-aliasing. V8 hoists it for free, which is why the same bytes cost 408 ms
there and 424+ here.

Across a loop that provably cannot REALLOCATE the list, both fields are now read
once into locals before the loop, and every access inside reads the locals.

### 14.1 The soundness condition, which is the whole of the work

The condition is deliberately **syntactic and local**. `hoistSafeExpr` /
`hoistSafeStmt` are a WHITELIST whose fall-through is DECLINE, so a construct
added to the language later cannot silently license a stale header — the same
discipline `blockHasArrNew` learned the hard way when an unenumerated statement
shape left a frame unreserved.

ACCEPTED — a body built only from literals, identifiers, parentheses, unary and
binary operators (assignment included), `o.f` reads, `x[i]` reads and stores,
`is`/`as`, and `if`/`while`/`for`/`return`/`break`/`continue`/`let` over the
same. Inside such a body: `xs[i]` reads and `xs[i] = v` stores at any depth, on
a binding declared OUTSIDE the loop, at any of the four scalar list reps, a ref
list, or a string list. An indexed STORE is accepted because `array.set` changes
neither the backing's identity nor `len`.

DECLINED, each because the alternative is a miscompile:

- **Any call at all.** `xs.push(v)` reallocates the backing and leaves a cached
  ref pointing at the ABANDONED array — a silently lost write — and any call can
  reach the list through a parameter, a capture or a global and push it there.
  Banning every call is what makes "cannot reallocate" a local question instead
  of an interprocedural one.
- **A rebinding** — a `let`/`const` or loop variable taking the spelling, or an
  assignment `xs = …`. The body's `xs` would not be the wrapper the prologue read.
- **A nullable receiver** (`xs: i32[] | null`, narrowed). The prologue would have
  to recover non-null BEFORE the loop, moving a trap ahead of the source's guard.
- **Every shape not enumerated** — lambdas, `match`, `o?.f`, list and object
  literals, nested declarations.

A `while`'s CONDITION is held to the same standard as its body, because it
re-runs every iteration. Hoisting out of a loop that may run **zero** times is
safe because the prologue only reads two fields of a non-null wrapper, which
cannot trap on its own.

Two shapes are declined that a stronger analysis would keep, and both are
recorded rather than hidden. `algorithms/spectralnorm`'s inner loop is declined
for a call to `aij`, a pure leaf function — recovering it needs a callee summary
(no push, no assignment to a non-local) and is not attempted. `for … in <list>`
loops do not open hoists at all; only `while` and `for … to …` do.

### 14.2 The fixture has teeth — measured, not asserted

`tests/cases/arrays/list-header-hoist-grid.vl` is six must-decline shapes and six
must-hoist ones. Every declining case is written so a wrong hoist is LOUD. That
was verified by SABOTAGE, in a throwaway worktree so no artifact was restored by
rebuilding it (the playbook's rule):

| sabotage | effect on the grid |
|---|---|
| delete the CALL decline (one line) | case 1 `pushThenRead` **traps**: `out of bounds array access`, a fresh index guarded against a stale `len` |
| neuter the REBIND decline | case 2 `reassignInLoop` prints **3 instead of 21** — exit 0, no trap, a silent wrong answer |

The second is the one that matters: without it the grid would have pinned only
the loud failure mode.

### 14.3 What it measures

Min-of-5, A/B interleaved inside each rep, `taskset -c 2-5`, load 2.4–3.5.
**Noise floor 0.49%** from a probe with IDENTICAL bytes on both sides — and a
second, free floor probe: `algorithms/nbody` compiled **byte-identically** on both
sides and read **1.0000**.

| benchmark | A (HEAD) | B (P5) | B/A default | B/A `-O3` |
|---|--:|--:|--:|--:|
| `arrays/reverse-inplace` | 2174 | 1725 | **0.794** | 0.999 |
| `arrays/sort-heap` | 931 | 846 | **0.909** | 0.848 |
| `arrays/fill-sum` | 1023 | 931 | **0.910** | 0.989 |
| `arrays/struct-soa` | 1220 | 1115 | **0.914** | 1.001 |
| `arrays/matmul` | 1602 | 1487 | **0.928** | 1.008 |
| `arrays/struct-aos` | 1474 | 1394 | 0.946 | 0.908 |
| `arrays/binsearch` | 1292 | 1235 | 0.956 | 1.032 |
| `algorithms/spectralnorm` | 2573 | 2572 | 1.000 (declined) | 0.984 |
| `algorithms/nbody` | 3060 | 3059 | 1.000 (identical bytes) | 1.005 |
| `algorithms/mandelbrot` | 3274 | 3303 | 1.009 | 1.006 |
| `algorithms/binarytrees` | 4342 | 4293 | 0.989 | 1.020 |
| `arrays/push-growth` | 523 | 538 | 1.029 → see below | 0.996 |

`matmul` lands at **−7.2%** against the prototype's 9.9%. The `-O3` column is a
different claim and is stated separately: it is mostly neutral, because `-O3` was
already a wash on this category (P11), and the two rows that do move there
(`sort-heap` 0.848, `struct-aos` 0.908) are the ones whose kernels survive
inlining. Every `-O3` module was asserted byte-different from its `-O0` twin, so
none of that column is the silent `wasm-opt`-missing no-op.

**THE NOISE FLOOR IS PER-BENCHMARK, NOT PER-RIG — and that is what `push-growth`
turned out to be.** Its +2.9% was re-measured min-of-9 and read **+0.77%**; in
that run the same-bytes floor probe was built from `push-growth`'s own bytes and
read **−2.1%**. A floor probe made of `matmul` bytes (0.49%) does not bound the
variance of the most allocation-heavy benchmark in the suite. Two runs giving
+2.9% and +0.77% against a 2.1% floor is **not resolvable**, and it is reported
as unresolved rather than as a regression or as noise. The mechanism that would
make it real does exist — the transform adds a ref local to the frame, and every
GC safepoint scans the stack map — so it is worth re-testing on a quiet box.

### 14.4 The loop-shape gate fired, and this time it was the probe's own function

`tests/selfhost_native_release_test.ts` moved `binsearch-probe`'s `none` row
`6,3,8 → 6,3,6`. Per the gate's own instruction the golden was not touched until
per-function counts were in hand, and they say something different from #1328's
firing:

    $0  bsearch      rot=0   carried 8 -> 6    <- the only row that moved
    $1  (helper)     rot=0   carried 4 -> 4, second loop 2 -> 2
    $3  (helper)     rot=1   carried 2 -> 2
    $4  (helper)     rot=1   carried 1 -> 1 (twice)

**Tightening the counter to the probe's own functions would NOT have suppressed
this one** — the function that moved IS `bsearch`. So the filed tightening stays
filed and is not the fix here. What moved is legitimate and benign: `loops` and
`rotated` are unchanged, the loop that moved is UNROTATED at `none`, and the two
values that left its carried set are the list-index frame slots the bounds guard
used to write per access. FEWER carried is the direction the gate's own model
calls faster, and `bench/arrays/binsearch` agrees (1292 → 1235 ms). `-O` and
`-O3` are identical on both sides at 3,3,6.

### 14.5 Gates

| leg | result |
|---|---|
| freshly fetched `seed-latest` → `refresh-compiler.sh --prove-fixpoint` | rc 0 — **no bootstrap split needed** |
| `native-fixpoint.sh` | rc 0, stage3 == stage4 |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | **3677 passed / 0 failed / 7 ignored** |
| `lint-self.sh` | rc 0 (lint + fmt) |
| `rep-fuzz-check.sh` | rc 0, exact — 0 new, 0 stale |
| corpus A/B, six channels, 1728 files | **22 changed bytes; all 22 differ ONLY on the wasm hash and the byte count in `wrote …`. check rc, check diagnostics, build rc, run rc and run stdout identical on all 1728.** |
| fuzz A/B, seeds 3/11/29/47 | identical finding sets — **but see below** |

**The published `seed-latest` IS HEAD's fixpoint byte-for-byte** (`compile(seed)
== seed`, 1,124,728 bytes), so the A side of every comparison here is exactly
HEAD's compiler rather than an approximation of it. The branch's own fixpoint is
1,135,127 bytes: **+10,399 (+0.92%)**.

**THE FUZZ A/B IS STRUCTURALLY INERT FOR THIS CHANGE, and the identical finding
sets are therefore not evidence for it.** Measured, not assumed: a 400-case ×
depth-5 batch was generated and grepped — **800 cases, 0 containing `while`, 0
containing `for`, 0 containing `.push`**. The generator emits no loops at all, so
`loopHoistOpen` is never called on a fuzz case; 602 of them index a list, all
outside any loop. The load-bearing evidence for P5 is the corpus A/B, the suite,
and the sabotage grid — not the fuzzer.

### 14.6 P4b (BMH for `indexOf`) — measured, and NOT taken. Here is what the numbers say.

P4b was scoped alongside P5 and is deliberately not shipped. The reason is not
effort: it is that **two of the three numbers the filing rests on do not survive
measurement**, and the third changes the gate.

**(a) The table build costs 295 ns, not 88 ns.** Measured on a quiet box (load
0.4), min-of-5, control-subtracted: a 256-entry skip-table fill plus the needle's
own `m-1` overwrites runs **622 ms** over 2,000,000 repetitions against **31 ms**
for the identical program with only the 256-entry fill removed — **295 ns per
build**, 3.4x the filing's figure. That is with the array allocated ONCE outside
the loop, so it is the FILL, which no amount of reuse removes.

**(b) Allocation-free is not the hard part — the fill is.** A module-level global
holding one `array.new_default 256`, initialised in the start function, removes
the allocation entirely and is straightforward. What it does not remove is the
295 ns. The instruction that would is **`array.fill` (`0xfb 0x0f`), and the
emitter has no `fbArrayFill` at all** — `grep` over `emit_bytes.vl`/`wasmEmit.vl`
returns nothing. Adding it is the enabling move for P4b and is a byte emitter
that needs its own gate; it would cut a 1 KB fill to one instruction.

**(c) P4a costs 1.39 ns per position examined**, derived from the real benchmark
rather than a synthetic one: `bench/strings/substr-search` is **673 ms** here
(min-of-5, `taskset -c 2-5`, load 0.46) over ~484M examined positions
(480 absent needles × 1M, 480 present ones near the front). CPython on the same
box is **150 ms**, so VL is **4.49x behind** — the landscape's 666/148 = 4.5x
reproduces exactly, which is what makes the per-position number trustworthy.

> A synthetic sweep over haystacks of 32…2048 read 4.3 ns per position instead,
> because its generated haystack repeats the needle's first character far more
> often than real text and so enters the verify loop far more often. The
> synthetic number would have made BMH look ~3x better than it is. The real
> benchmark is the one used below.

**The derived gate.** With `t_build = 295 ns`, `t_pos = 1.39 ns`, an average shift
`d`, and BMH's per-position cost `k` times P4a's, break-even is at

    P = t_build / (t_pos * (1 - k/d))

| needle | shift `d` | k=1.0 | k=1.5 | k=2.0 |
|---|--:|--:|--:|--:|
| 12 | 9.2 (instrumented) | 238 | 254 | 271 |
| 4 | ~3.5 | 292 | 372 | 495 |
| 2 | ~1.9 | 424 | 1006 | **never wins** |

Two conclusions, and the second contradicts the filing:

- The haystack gate is around **512**, not 64. At 64 the table build alone is
  more than twice the entire search.
- **`len(sub) >= 2` is the wrong needle gate.** At `m = 2` the shift is bounded
  by 2, so BMH can examine at best half the positions while paying 295 ns fixed
  and a strictly higher per-position cost — it breaks even only past ~424
  positions at best, and never at all if a table lookup costs twice a direct
  compare. The needle gate has to be **`>= 4`**. So: **`len(s) >= 512 && len(sub)
  >= 4`**, derived, and it moves once `array.fill` lands.

**And P4b does not clear the CPython red alert anyway.** The filing calls it
"what still stands between `substr-search` and CPython". At the prototype's own
**measured 3.13x**, 673 ms becomes **215 ms against CPython's 150 — still 1.43x
behind**. A model built from the numbers above is more optimistic (shift 9.2 at
k=1.5 projects ~120 ms, which would clear it), but the only end-to-end figure
anyone has actually measured for BMH here is 3.13x, and that one does not clear
it. Clearing `substr-search` needs P12 (UTF-8 bytes in linear memory, 27.7x on
the compare) or P7-style caching, not BMH alone.

**What shipping it would take**, in order: `fbArrayFill`; a start-initialised
global table; the gated second search path in `emitStrIndexOf`; and the
`index-of-grid` extensions BMH specifically needs — a repeated-character haystack
(`aaaa…` with needle `aaab`), a needle whose LAST character repeats internally
(the shift table built naively gets this wrong), the needle at the very last
start, and single-character needles. `indexOf` is on the self-hosted compiler's
own hot path, so none of that is worth doing at less than full gate coverage.

---

## 15. PERF item P7 — and it is NOT the item that was filed

`perf-landscape.md` §5 filed **P7 as "cache a string's hash instead of
recomputing it per probe"**, sized at up to 4.6x on long keys. **What shipped
under that name is a different change**: `__str_hash__`'s FNV-1a walk now hashes
four code points per loop iteration instead of one — the same shape `__str_eq__`
took in P3. It is worth **1.135x**. The landscape splits the two as **P7a**
(this, shipped) and **P7b** (the cache, untouched and still open); read this
section as P7a's record and nothing more.

**Why the smaller change was the one to take.** A cache needs somewhere to put
the hash — a field on every string, a side table, or an interning scheme — plus
an invalidation story. This compiler is **WasmGC-allocation-bound**, so widening
every string in the language to carry a hash slot is an allocation-size change
across the whole program, and `string` is `(array (mut i32))` today: a bare
array with no header to put a slot in. The unroll needs none of that.

### 15.1 What shipped

`emitStrHashFnCode` (`compiler/emit_sections.vl`) emits two loops where it
emitted one: a **wide block** running four chained FNV steps while `i <= lim`,
then a **scalar remainder loop** for the tail. `n` is hoisted into a local. The
locals run goes 3 → 4 (`h`, `i`, `n`, `lim`).

Two properties carry the correctness, and both are structural rather than
asserted:

- **`lim = n - 4` is a SUBTRACTION, deliberately.** `n` is an `array.len`, so the
  natural spelling `i + 4 <= n` could **wrap** on a maximal-length string; the
  subtraction cannot. It also gives the short-string case for free: for `n < 4`
  the limit goes negative, `i > lim` holds at `i = 0`, and every element is
  answered by the remainder loop — a short string skips the wide block instead of
  paying a wasted test.
- **The step is factored into `fbStrHashStep(k)` and SHARED** by the unrolled
  block and the remainder loop, so the two cannot drift into hashing differently.
  That failure mode is a **silently wrong hash, not a crash** — every map and set
  in every VL program would still run, and would still find keys, because the
  same wrong function is used to insert and to probe. It would surface as a
  corpus divergence only where a hash value is observable, which is nowhere. A
  shared emitter removes the failure mode instead of testing for it.

### 15.2 Measured

Hash-dominated insertion — 30k distinct long string keys × 10 rounds —
interleaved min-of-9, every module's stdout asserted identical and non-empty
before timing:

| | min |
|---|--:|
| master | 109 ms |
| this change | **96 ms** |
| | **1.135x** |

**Taken at load 3.86 on a box shared with two other agents, so it is a LOWER
BOUND**, and it is above the suite's 7% noise floor. On a separate 1k-entry /
8M-lookup probe at 46-char keys the walk itself goes **2.13 → 1.10 ns per code
point**.

**Why 1.135x and not more, and why no further unroll can help.** FNV is a
**serial dependency chain** — each `i32.mul` waits on the previous `h` — so
unrolling cannot overlap the arithmetic. What it removes is per-element loop
control, plus the hoist of `n` (a reference local lives in a stack-map-tracked
slot, so `local.get 0; array.len` is a memory **load** on every iteration rather
than a loop invariant the engine can hoist). At ~3 cycles per code point the loop
is now at the `i32.mul` latency floor: **widening to eight is measurably WORSE**
— more code, same chain — and the loop is dependency-bound, not overhead-bound.

**That floor is also the bound on P7b.** At short keys the whole walk is ~11 ns
of a ~63 ns probe, so a perfect cache cannot be worth more than that on
short-key workloads. P7b's filed 4.6x is a **long-key** number taken **before**
this change halved the per-code-point cost; it has not been re-measured and
should be re-priced before the item is taken.

### 15.3 The harness

`scripts/p7-*` is kept. `p7-time.sh` is the piece worth reusing: it reports
**MIN and MEDIAN of (user+sys) CPU milliseconds** rather than wall clock — far
less contention-sensitive on a shared box, which is this repo's normal condition
— interleaves every module once per round, and **asserts every module's stdout is
identical before timing anything**. `p7-gen.sh`/`p7-patch.py` generate WAT
variants from one base; `p7-build.sh`/`p7-probe.sh` build and disassemble.

### 15.4 The loop-shape gate fired, and it was checked rather than bumped

`binsearch-probe`'s `none` row moved **6,3,6 → 7,4,6**. The gate's own message
calls a `none` row that gains a rotated loop *"VL's own emitter regressing"*, so
the move was verified per function:

    $4 rot 1->1   $5 bsearch (the probe itself)  2->2 and BYTE-IDENTICAL
    $6     0->0   $7 __str_hash__                1->2   <- the only row that moved
    $8     2->2   $9                             0->0

`$7` takes one string ref, returns `i32`, and carries the FNV prime `16777619`
**five times** — four unrolled steps plus the remainder. **`binsearch-probe.vl`
contains zero string operations**, so it never calls `$7`: the added loop and the
added rotation are unreachable from that program and cost it nothing. `-O` and
`-O3` are unchanged at 3,3,6, because both rungs already inline the helper away.

**This is the SECOND time the module-wide counter has fired on the wrong axis**
(the first was `__str_eq__`'s 8x unroll in #1328). The tightening filed at
`tests/selfhost_native_release_test.ts` is now twice-evidenced: the counter cannot
distinguish *"the probe's loop rotated"* — the 2.40x defect it exists to catch —
from *"a helper this program never calls gained a loop"*.

### 15.5 Gate

`refresh-compiler.sh` **REFRESH_RC=0** (1,137,079 B) · full suite, serial,
`SELFHOST_NATIVE_ALIGN=1`: **3,711 passed / 0 failed / 7 ignored** ·
`lint-self.sh` rc 0 · release test alone 21/0.

---

## 16. Item F3 — the module merge's rename table, sid-indexed

§9.7 filed `modRenamed` as the unconverted phase-5 row at **1.82% self / 27.1 samples per
run**, noting it is 87% reached from `modRwExpr`. Both halves of that filing re-derive
exactly. What the row does NOT say is that the self figure is **less than half** of what the
function costs, and that a SECOND reader of the same table, not named in the row at all, costs
another 1.96%.

### 16.1 The re-derived profile

Master `9fda2180`, **12 warm guest runs, 17,613 samples (1,467.8 per run)**, `--names` seed,
`$mNN` stripped — §2's recipe.

| | % self | self /run | % incl | incl /run |
| --- | ---: | ---: | ---: | ---: |
| `modRenamed` | 1.80 | 26.4 | **3.94** | **57.8** |
| `modRwTsName` | 1.00 | 14.8 | 1.89 | 27.8 |
| `modRwStmt` — the whole merge rewrite | 0.04 | 0.6 | **6.44** | **94.6** |

**The filed 1.82% is `modRenamed`'s SELF, and `__str_eq__` under it is another 28.4 samples per
run filed on a different row.** Its callers re-derive as filed: `modRwExpr` **86.17%**,
`modRwFunc` 6.05, `modSelfFnTarget` 5.33, `modRwStmt` 2.45. Its leaves split
`__str_eq__` 49.14 / self 45.68 / `capHas` 5.19.

### 16.2 Was the information already banked? No — and the reason is structural

`symbols.vl`'s R4 header already answers it: the merge's three name writers are *"INERT TODAY —
the merge runs before any emit pass and every `sidOfNode` caller is in `emit_*`, so the carrier
is empty"*. **The merge is the FIRST pass over the arena**, so at the moment `modRwExpr` asks
there is nothing banked to read; the sibling item's shape (information produced and thrown
away) does not occur here.

What IS one level out from the row as filed is the **second reader**. `modRwTsName` walks the
SAME `modRenameFrom` with the SAME linear scan, once per type-spelling node, and it is not
mentioned in §9.7. Converting only the filed row would have left it reading ~718 rows per
`TS_NAME`. The object is the merge REWRITE, not the one function.

### 16.3 The DETERMINISTIC counts

A counting build of `modRenamed`, one self-compile of `compiler/entry.vl` (**27 modules, arena
256,912 nodes**):

| | count |
| --- | ---: |
| `modRenamed` calls | **96,432** |
| — of them from `modRwExpr`'s `Ident` arm | 81,438 (84.4%) |
| **rename-table string compares** | **12,281,353** |
| shadow-stack string compares | 561,805 |
| mean `modRenameFrom` length at call time | **718** |
| exits at the shadow (a local) | 62,068 (64.4%) |
| exits at the table (renamed) | 32,618 (33.8%) |
| falls through unrenamed | 1,746 (1.8%) |

**For scale, §9.4's phase-3 conversion moved 2,466,975 string-keyed probes to 479,079.** This
one function pays **five times the whole of that budget** in raw compares — they are cheap
compares (a length check rejects most), which is why the row reads 1.8% rather than 20%, but
the count is the quadratic the conversion removes.

### 16.4 What shipped

`modRenamePush` appends a row and indexes it under `sidOf(from)`. Readers are `sidLookup` plus
one `sidArrGet`. `sidLookup` never mints, which is exact here by R6: every key was interned at
the build point, so a name with no id cannot be one. The parallel `modRenameFrom: string[]`
goes with the scan that was its only reader — the row carries the identity now.

**TWO sid views, not one.** The readers disagree about a duplicate key and the disagreement is
pre-existing: `modRenamed` returns at the FIRST matching row; `modRwTsName` and
`modTypeRenamed` scan on and take the LAST. A duplicate `from` needs two imports binding one
local (a decl colliding with an import is diagnosed by `modCheckDupBindings`), and which row
wins decides the diagnostic text and which import a reference resolves to — so neither reader
is quietly normalized onto the other's answer.

**The corpus pins it, and the pin has a witness.**
`tests/cases/modules/duplicate-import-first-vs-last/` imports one value name and one TYPE name
from each of two modules that both export them, and asserts `1` (the FIRST module's function)
and `beta` (the SECOND module's `string` type). Each collapse was compiled into a real compiler
by the saved good seed and run: `modRenamed` on the LAST view prints **2**, and the type readers
on the FIRST view stop the case checking with `cannot assign string to 't' of type i32`. Without
that case nothing in the corpus notices a "tidy" that merges the two views, and the failure it
would let through is a silently different import binding.

`modRenamed` also consults the map **before** the shadow stack. Same answer either way — a name
absent from the map renames to itself whether or not a local shadows it — and 64.4% of calls
are locals with no row, which now skip the walk entirely.

**The carrier stays untouched, deliberately.** Nothing here calls `sidOfNode`, so `sidNode` is
still empty through the merge and R4 writers 1-3 stay inert — no new miscompile surface in a
class §9.6.1 records the fixpoint ladder as blind to. What DOES change is that the merge now
MINTS: emit's id space no longer starts at 0. R2 forbids depending on an id's numeric value,
and the corpus A/B is that rule's witness here.

### 16.5 Measured

**Guest profile, interleaved A/B/A/B, 12 runs per leg, same input both legs, `$mNN` stripped.**
Absolute samples PER RUN:

| | A /run | B /run | |
| --- | ---: | ---: | ---: |
| `modRwStmt` (the whole merge rewrite) | 97.3 | 18.2 | **−81.3%** |
| `modRenamed` | 58.2 | 8.6 | **−85.2%** |
| `modRwTsName` | 28.4 | 0.7 | **−97.5%** |
| `__str_eq__` | 352.3 | 319.8 | −9.2% |
| `__map_probe__` (the price) | 92.0 | 102.5 | +11.4% |
| `__str_hash__` (the price) | 46.9 | 50.6 | +7.9% |
| **all samples** | **1,452.2** | **1,378.1** | **−5.1%** |

**Self-compile CPU milliseconds** (user+sys, interleaved, `taskset -c 2-5`, emitted bytes
asserted md5-identical before timing). CPU rather than wall because this box swings up to 2.5×
under contention (§15.3) — and this session was the contention, so **both runs are reported
with the load they ran at**:

| reps | load | A min → B min | A med → B med |
| ---: | ---: | --- | --- |
| 13 | 8–14 | **1,421 → 1,344 ms (−5.4%)** | 1,479 → 1,424 ms (−3.7%) |
| 11 | 50–73 | 1,666 → 1,607 ms (−3.5%) | 1,875 → 1,712 ms (−8.7%) |

**Quote the profile's −5.1% and the quiet run's −5.4% min.** The load-70 row is the pair of
numbers that shows why: its two channels straddle the answer by ±3 points because at three
times the core count every rep is measuring a different machine.

**What is left, and why it is the floor.** `modRenamed`'s remaining 8.6 samples per run are
3.4 `__str_hash__` + 2.1 `__str_eq__` + 0.8 `__map_probe__` (the `sidLookup`) + 1.1
`sidArrGet` + 0.8 self + **0.4 `capHas`** — the shadow stack is gone as a cost. Going below the
probe means taking the id from the CARRIER (`sidOfNode(ix)`, which every call site already has
as an arena index) rather than from the name. **Priced and declined**: the merge would fill
96,432 carrier slots and then invalidate 32,618 of them by renaming, so emit re-mints those;
net ≈31 K fewer probes ≈ 3–4 samples per run ≈ 0.25%, bought by making R4 writers 1-3 live.
That is a miscompile-class invariant for a quarter of a point.

### 16.6 Gate

Every rc read BARE.

| gate | result |
| --- | --- |
| `scripts/refresh-compiler.sh` | rc 0, **1,151,180 B** |
| **seed ladder leg 2** (`mv` the seed out, `fetch-seed.sh`, `refresh --prove-fixpoint`) | rc 0 — **fixpoint in 2 compiles**, and its md5 is the artifact the A/B timed |
| `scripts/lint-self.sh` | rc 0 (`vl fmt -w compiler/driver.vl` once) |
| `deno test -A tests/cases_wasm_test.ts` | **1,707 passed / 0 failed / 7 ignored** (1,706 before the duplicate-import case) |
| `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check tests/selfhost_native_align_test.ts` | **1,714 passed / 0 failed / 0 ignored** (1,713 before it; the suite is discovery-based, so the case needs no registration) — and verified BOTH ways: without the env var the same file reads 0 / 0 / **1,713 ignored**, so the count is the suite and not a self-ignore |
| **six-channel A/B** (check rc, check stderr, build rc, emitted BYTES, run rc, run stdout) over the 57 multi-module corpus cases + `compiler/entry.vl` | **58 / 58 same**, one result file per worker, run against the shipped artifact |
| the same six channels over single-module corpus files | **304 of 1,655 same, 0 differing** — a PARTIAL sweep, cut off at a 24-core box sitting at load 90–175 under other agents. It is the module bucket, not this, that is the population the row is about |

**Seed-bootstrap: NO SPLIT.** The change uses only `symbols.vl` exports the published seed
already ships.

---

## 17. Item F4 — `fnStmtsPosOf`, and the index that never had to be built

§3 item 4 filed this as *"an index at the writers"*, with a header in
`emit_classify.vl` arguing that a memo cannot be made safe and that the honest fix is a
per-program node → position index minted where `fnStmts` is written. **The row re-derives
high (2.27% filed, 3.09% measured) and the header's argument is sound — but the fix it
points at is unnecessary, because every call in the profile is asking for a number its own
caller is standing on.** No index was built. Nothing about the writers changed.

### 17.1 The re-derived profile

Master `dfd93627`, **12 warm guest runs, 17,621 samples (1,468.4 per run)**, `--names`
seed, `$mNN` stripped — §2's recipe, and the A leg of the interleaved A/B in §17.5.

| | % self | self /run | % incl | incl /run |
| --- | ---: | ---: | ---: | ---: |
| `fnStmtsPosOf` | **3.09** | **45.4** | 3.09 | 45.4 |

**Self and inclusive are the same number and that is a fact about the function, not a
rounding**: it is a pair of array scans with no calls in it, so no callee is ever sampled
beneath it. Every point it costs is its own.

Its callers are five, and they are 100% of it:

| caller | share of its inclusive | /run |
| --- | ---: | ---: |
| `emitReturnValue` | 43.67% | 19.8 |
| `retWidensAtomToStr` | 16.88% | 7.7 |
| `retCapturedMapShape` | 15.41% | 7.0 |
| `emitFuncCode` | 12.11% | 5.5 |
| `emitTailCallRet` | 11.93% | 5.4 |

### 17.2 The DETERMINISTIC counts

A counting build of `fnStmtsPosOf`, one self-compile of `compiler/entry.vl` (**27 modules,
arena 257,475 nodes, 2,955 `fnStmts` slots**):

| | count |
| --- | ---: |
| `fnStmtsPosOf` calls | **22,612** |
| `fnStmts` scan steps | **32,859,699** (1,453 per call) |
| `monoOrigNode` fall-through steps | **0** |
| resolved in `fnStmts` / fell through / returned -1 | 22,612 / 0 / 0 |
| distinct `fnIx` ever asked | **2,955** — every function, 7.65 times each |
| calls where `fnIx == emitCurFnIx` | **18,164 (80.3%)** |
| duplicate entries in `fnStmts` | **0** |

### 17.3 Both questions, and both answers are yes

**Was the information already banked? Yes, and by the two loops that dominate the row.**

1. `emitCodeSection` walks `fnStmts` and calls `emitFuncCode(codePayload, fnStmts[ci])`.
   Its loop variable `ci` IS the position, and four of the five callers above
   (`emitFuncCode` itself plus the three return-path classifiers it reaches) run inside
   that call. **80.3% of the calls hand the scan a node the caller converted from the very
   number the scan then spends 1,453 steps recovering.**
2. `mapRetExprShape` and `retCapturedMapShape` took an arena index and immediately
   converted it back with `fnStmtsPosOf` — and **all four of their call sites spell the
   argument `fnStmts[fe]`** (`emit_classify` 810 and 10751, `emit_sections` 3409,
   `emit_classify` 2473). Everything past the conversion (`parentBindingOf`,
   `captureNamesOf`, `captureValKind`) is position-keyed anyway.

**Is there a second reader of the same structure?** Not of `fnStmts` — `fnStmtsPosOf` is
the only node → position scan over it (`nestedFnDeclaredInFrame`, `exportSlotOfTarget` and
`monoExportedFe` all key on the NAME). The second reader here is the second CALL FAMILY,
which the row does not mention and which converting only the emit-side cursor would have
left scanning: 4,448 calls, 19.7% of the total.

**And the two reasons the header gives for why an index is hard both evaporate under
measurement.** The `monoOrigNode` fall-through — *"a second reason no index of `fnStmts`
alone can answer"* — is reached **0 times** in a self-compile. The writer set, which the
header is right to call a sources problem, never has to be touched at all.

### 17.4 What shipped

`emitCurFnPos` is written as one pair with `emitCurFnIx`, from `emitCodeSection`'s own loop
index, and `fnStmtsPosOf` returns it when asked about the function being lowered.
`mapRetExprShape`/`retCapturedMapShape` take the `fnStmts` POSITION instead of the arena
index.

**This is not the memo the header rejects, and the difference is the whole argument.** A
memo caches an ANSWER and has to be invalidated; this carries the caller's own INPUT, and
its two exactness clauses are pinned at `emitCurFnPos` in `emit_state.vl`:

- nothing writes `fnStmts` between the pair being set and the body finishing — every
  writer is a collect pass or a monomorphization writer, all complete before
  `emitCodeSection` starts (the same invariant §8.2's hoist already rests on);
- `fnStmts` holds each arena node at most once, so the loop's position IS the first-match
  position a scan returns. `collectFns` appends each top-level `FuncDecl` once, lifting
  appends each lambda once, and every monomorphization writer appends or substitutes a
  FRESH clone with a new arena index. **Measured, not asserted: 0 duplicate slots in the
  self-compile's 2,955, and 0 in each of the 1,487 corpus programs that reach emit** (of
  1,783 files; the other 296 stop at parse/check or emit no code).

Were a duplicate ever to appear, `emitCodeSection` would ALREADY be lowering the second
body against the first's position-keyed metadata (`fRetVoid`, `fnEnvIdx`, `capStartTbl`),
so the pair is the self-consistent reading of a state that is broken either way.

### 17.5 Measured

**Guest profile, interleaved A/B/A/B, 12 runs per leg, same input both legs, `$mNN`
stripped.** Absolute samples PER RUN:

| | A /run | B /run | |
| --- | ---: | ---: | ---: |
| `fnStmtsPosOf` | 45.4 | **0.1** | **−99.8%** |
| all samples | 1,468.4 | 1,463.2 | −0.4% |

**The all-samples row is reported and is NOT the win, and the reason is a trap worth
naming**: the guest profiler samples on a wall-clock timer, so a leg that runs on a busier
slice of the box collects the same number of samples for less work. The per-function row is
a share of that leg's own samples and is robust to it; the total is not. **The timing
channel is CPU milliseconds, not the sample count.**

**Self-compile CPU milliseconds** (user+sys, interleaved, `taskset -c 2-5`, **emitted bytes
asserted md5-identical between the two compilers before timing** — `b8cefca1…`, 1,153,427 B
both). This box was carrying other agents throughout, so both runs are reported with the
load they ran at:

| reps | load | A min → B min | A med → B med |
| ---: | ---: | --- | --- |
| 15 | 13–21 | **1,444 → 1,415 ms (−2.0%)** | **1,484 → 1,434 ms (−3.4%)** |
| 21 | 7–34 | 1,430 → 1,416 ms (−1.0%) | 1,500 → 1,468 ms (−2.1%) |

**The population where the row's own header lives is the frame ladder, and there the
change is half the compile.** `fnStmtsPosOf`'s header measures itself on N functions that
each declare and call their own nested function; the compiler's own source is nearly the
worst case for showing that off (few capturing nested functions), so the ladder is where
the quadratic is visible. CPU-min of 5, interleaved, emitted bytes `cmp`-identical at every
N:

| N | A cpu_min | B cpu_min | |
| ---: | ---: | ---: | ---: |
| 100 | 8 ms | 9 ms | |
| 200 | 16 ms | 14 ms | |
| 400 | 36 ms | 29 ms | |
| 800 | 89 ms | 53 ms | −40% |
| 1,600 | **252 ms** | **123 ms** | **−51%** |

A's step ratio climbs 2.00 → 2.25 → 2.47 → 2.83 as N doubles — that is the quadratic, and
it is not noise. B's is 1.56 → 2.07 → 1.83 → 2.32.

Profiled at N = 1,600 (8 warm runs per leg): **`fnStmtsPosOf` 169.8 → 6.4 samples per run,
48.92% → 3.66% self, total 347.0 → 174.4 per run (−49.8%)**. In that population its top
caller is `capturedKindOf` (85.4%), which this change does not mention and which the cursor
pair catches anyway — the fix is keyed on the QUESTION, not on the call site.

**What is left, and where.** 100% of the ladder's residual 6.4 samples per run is
`capturedStructIndex`, and the reason is exact: the classify passes run before
`emitCodeSection`, so `emitCurFnIx` is -1 there and the cursor cannot answer. On the
compiler itself the residual is 0.1 samples per run — 0.01%, one sample in twelve runs.
Taking that last sliver means giving the classify passes a cursor of their own, which is a
new invariant for a hundredth of a point. **Priced and declined.**

### 17.6 Gate

Every rc read BARE.

| gate | result |
| --- | --- |
| `scripts/refresh-compiler.sh` | rc 0, **1,153,427 B** (from 1,153,473 — the removed scan and its now-unused import) |
| **seed ladder leg 2** (`mv` the seed out, `fetch-seed.sh`, `refresh --prove-fixpoint`) | rc 0 |
| `scripts/lint-self.sh` | rc 0 (one unused-import removal it caught: `emit_sections`' `fnStmtsPosOf`) |
| `deno test -A tests/cases_wasm_test.ts` | **1,713 passed / 0 failed / 7 ignored** |
| `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check tests/selfhost_native_align_test.ts` | **1,720 passed / 0 failed / 0 ignored**, verified BOTH ways — without the env var the same file reads 0 / 0 / **1,720 ignored**, so the count is the suite and not a self-ignore |
| `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check tests/selfhost_native_release_test.ts` | **35 passed / 0 failed / 0 ignored**, with `node_modules/.bin/wasm-opt` present (so the six `-O` tests ran rather than self-ignoring). No SHAPE_TABLE row moved |
| **emitted-BYTES A/B** (build rc, normalized build stderr, emitted sha256) over the WHOLE corpus + `compiler/entry.vl` | **1,784 / 1,784 same, 0 differing, 0 malformed**; **1,488 of the records carry a real sha256** (the other 296 are reject cases that never emit, and their build rc + diagnostic text is the compared field). Each file goes through BOTH compilers in the same worker so the two sides cannot drift apart by scope; one result file per worker, concatenated, record count asserted against the input count and every line asserted well-formed |
| **six-channel A/B** (check rc, check stderr, build rc, build stderr, emitted BYTES, run rc, run stdout) | **28 of a scoped 1,156 same, 0 differing** — a PARTIAL sweep, reported as partial: the box was carrying other agents at load 22–33 throughout and one `vl` invocation cost 3.5 s wall against 0.34 s earlier in the same session. See the note below on which of its channels could have moved |

**Two of the six channels cannot move here, and saying so is worth more than banking a
green from them.** `checkSrc` in `driver.vl` never runs `emitProgram` — its own comment
says *"`check` never emits"* — and no file on the check path imports `emit_classify`, so
the CHECK rc and CHECK stderr channels are structurally unreachable from a change confined
to the emit passes. The RUN channel is not independent either: it compiles and then
executes, and the byte channel already says all 1,784 modules are identical, so an
identical module cannot run differently. **The byte channel is the one that carries the
verdict, and it is the one that was run to completion.**

**Corpus case added: `tests/cases/closures/nested-capture-frame-ladder.vl`** — six frames
that each declare their own nested function capturing a DIFFERENT kind (i32, string, list,
map, the map RETURNED as the closure's result, struct field). This is the population
`fnStmtsPosOf`'s header is measured on and the corpus otherwise reaches thinly, and it is
what separates "the capture resolved against THIS frame" from "against whichever frame
answered last". Nested names are distinct on purpose (capture analysis is name-keyed
module-wide). It emits `cmp`-identical bytes under both compilers.

**Seed-bootstrap: NO SPLIT.** Nothing here is a new language feature; the published seed
compiles the change directly — leg 2 fetched `seed-latest` (1,153,685 B) and reached the
fixpoint in 2 compiles, and its md5 `b8cefca1…` is the same artifact the A/B timed and the
corpus sweep ran against.

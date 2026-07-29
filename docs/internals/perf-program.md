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
| 1 | ~~**Bulk host↔guest staging**~~ — **SHIPPED, §6.** `srcLoad`/`modKeyLoad`/`modSrcLoad`/`cliResultLoad` + the memory the emitter exports; the host's batched path activates itself | predicted −4.6% self (`modSrcPush`); **got** `modSrcPush` 4.74 → 0.00 self, `modSrcLoad` 2.23 self, and the host's staging phase 192 → 135 ms | one host LINE (the memory probe) + 4 compiler-side exports; the fallback was already written | low — old seeds fall back, no seed split (**held**) | profile self-% of `modSrcPush` (target ≈0); the host's own `[profile] stage_program` phase; wall clock is too noisy alone |
| 2 | **Intern identifiers to i32 symbol IDs** | **19.10%** of self-compile time is `__str_eq__` under symbol/identifier consumers | large: touches scope slots, capture tables, module rename tables, field names, the string-keyed maps | medium-high — it is the checker's identity model | re-run §2's consumer split; the target is the SYMBOL row, and the TYPE row (6.08%) must not move |
| 3 | **`nameNamesFunction`: index the arena once** | 4.71% self — it scans every node in `P.nodes` per call | small: a name set built in one arena pass, invalidated on arena growth | medium — it runs BEFORE `buildFnMap`, and emit-time monomorphization appends nodes; the invalidation is the whole correctness question | deterministic CALL + scan-step counts on two builds over the same input (a ~5% change is countable, and wall clock cannot resolve it); then profile self-% |
| 4 | **`fnStmtsPosOf`: an index at the writers** | 4.82% self | medium — the function's own header states the honest fix is an index minted by `emit_mono`'s replacement writer, not a memo at the site | medium — a memo that caches the last answer is a silent miscompile the day a lower position holds a memoized node (the header says so) | same as #3; plus the corpus + fuzz A/B, since it is emit-path |
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
OUTPUT direction is a separate item and is untouched here: `rbyteAt` is still one
host call per emitted byte (0.90–0.96% self, `[profile] readback: 19–30 ms`), and
so are `cliCmdDataAt` / `cliCmdPathAt` / `modPendingAt`. They want the mirror-image
mechanism (guest writes the memory, host reads it) and a separate measurement.

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

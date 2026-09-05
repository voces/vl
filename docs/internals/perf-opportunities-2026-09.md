# Performance opportunities — a measured survey, 2026-09-03

Every number names the script that produced it and the box load at the time. The box is
shared (24 cores, load 2–240 here), so **user CPU, ratios and counts are the honest
columns**; wall time is quoted only where it is the thing being bought. Scripts are in
`scripts/perf/`, each re-runnable and each printing its own load line. Nothing here is
fixed; fixes follow as separate PRs.

## 0 · Ranking

Savings are estimated on GitHub's 4-core runner against the 235 s job of `2026-09-03T07:19Z`.
QUICK = a day, no design question. STRUCT = a design track.

| # | item | saving | eff | risk | proof the fix PR must carry | kind |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ✅ **LANDED (§F1)** — shard `tests/cases_wasm_test.ts`: one file, so one core, 44 s | **−16 s measured** (§F7; −32 s estimated) | S | none | same `2684 passed / 9 ignored`; shards partition the name space; `ci_seed_coverage_test.ts` updated | QUICK |
| 2 | ✅ **LANDED for 2 of 3 (§F2)** — split the heaviest ci-native files (§A3): `--parallel` is one worker per FILE, so the step's wall floor is the slowest file, 39.6 s | **−20…30 s** | S | none | per-file wall (`per-file-time.sh`) drops below the step's CPU/cores floor; case count unchanged | QUICK |
| 3 | ✅ **LANDED (§F3)** — warm BOTH `.cwasm` engine tags in `refresh-compiler.sh`; it carried forward only the one its own `vl run` made | ~~−10 s CI~~ **a wash on the runner (§F7)**; **−330 s CPU** locally, 48% of the step | S | low | `ls build/*.cwasm` = 2 after a refresh; A/B the step's user CPU with `parallel-jit-storm.sh` | QUICK |
| 4 | ✅ **LANDED (§F4)** — content-key the sidecar (`seed-<key>-<tag>.cwasm`, as the EMBEDDED path already does) instead of mtime | folds in #3; CI's seed cache survives a byte-identical rebuild | S | low | a rewritten byte-identical seed keeps `load_compiler` at 5 ms | QUICK |
| 5 | ✅ **LANDED (§F8)** — `variantIndexOf` → `uVariantRowBySid`, maintained at every write (the table is append-only, NOT frozen: mono reaches `registerInlineUnionAt`) | self **0.73% → 0.04%**, incl **1.72% → 0.32%**; the 3.6% quoted here was already stale, see §F8 | M | union member-set ABI (never dedupe) | byte-identical seed; `regress.py`; `rep-fuzz-check.sh`; the unions scaling axis | STRUCT |
| 6 | String `+` in a loop is **O(n²)** (§D): a loop-local builder, with n-ary chain fusion as the down payment. The fusion once shipped in the TS core and was never ported | ×4.80 per doubling; 5.4× at 320 KB; ≥129 in-loop sites | M / L | rep layer | corpus byte-identity where the pattern is absent; a scaling pair "append N" vs "join N", ratio bar 2.5 — **a value fixture cannot pin a cost class** | STRUCT |
| 7 | ✅ **LANDED (§F8)** — `unRowOfName`/`isUName` → `unRowBySid`, extended at all three pushes; `unionMemberSetOf` and `unionRowOf`'s first leg route through it | self **0.70% → 0.01%**, incl **1.33% → 0.26%** | M | index must extend at all 3 pushes | byte-identical seed; `regress.py`; the unions axis | STRUCT |
| 8 | ✅ **LANDED in part (§B6)** — the shape is module-level BINDINGS, not call sites, and the definite-assignment set was 91% of it. Sid-keyed, the 8,000-rung falls 2.54 s → 1.07 s and `checkProgram` goes 57.5% → 1.8% inclusive; the residual is not the checker | **−58% at 8k, −66% at 16k** | M | — | a 4-rung absolute ladder with an exponent bar (`scripts/perf/check-scaling.sh`) | STRUCT |
| 9 | LSP re-checks the WHOLE module graph per keystroke — 30 modules. **Measured (§C2a): 72% is `checkProgram` over the MERGED program**, so the per-module cache §C2 named has a 28% ceiling; its staging half is **LANDED (§C2c)**, −14.5%, and the whole keystroke burst is **LANDED (§C2d)**, 3 graph checks → 1. What is left is the merged half (§C2b), a track | editor latency, not CI | M / L | — | a keystroke ladder at 1 / 4 / 30 modules; the cross-file invalidation in both directions; graph checks per request | STRUCT |
| 10 | `declaredSlotOf` → per-function side index built in `buildLocals` | **1.1%** self time | M | reset per function, 5 sites | byte-identical seed; `regress.py` | STRUCT |
| 11 | `fnStmtsPosOf` → reverse index `nodeIx → fe` after mono: 19,106 calls, **25.9 M scan steps** | closures axis 2.22 → ~1 | M | 1 in-place write, `emit_mono.vl:6353` | byte-identical seed; the closures axis under its 3.2 bar | STRUCT |
| 12 | Destringify type names — `tyTopIndexOf` is a per-CHARACTER walk over a type-name string, **4.94% self** | 4.9% plus most of `__str_eq__`'s tail | L | canon / rep | `docs/internals/registry-by-type-id.md` steps 4–6; byte-identity | STRUCT |

Two corrections are load-bearing: **`vl check std/json.vl` is 40 ms, not 6.5 s** (§B1), and
**`tyTopIndexOf` is not a name-keyed registry; `collectA` never calls it** (§B4).

## A · Where ci-native's four minutes go

### A1 · The job today, and the trend

`ci-history.sh`, `ci-steps.sh` — GitHub's own runners, so no local load applies. Median of
the last 40 successful master pushes: **250 s**. Per step, and how each grew:

| step | 07-30 | 08-20 | 08-27 | 09-02 | 09-03 | share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Native binary suites | 20 s | 54 s | 74 s | 133 s | **134 s** | 57% |
| Corpus oracle (1 file, 1 core) | 3 s | 5 s | 6 s | 35 s | **44 s** | 19% |
| Refresh seed + fixpoint | 14 s | 13 s | 26 s | 69 s | **23 s** | 10% |
| checkout | 4 s | 5 s | 7 s | 11 s | 9 s | 4% |
| Editor features | 3 s | 3 s | 4 s | 8 s | 8 s | 3% |
| setup / cache / post | ~9 s | ~11 s | ~12 s | ~13 s | ~17 s | 7% |
| **job total** | **53 s** | **92 s** | **132 s** | **269 s** | **235 s** | |

"It used to be a lot less" is **53 s on 2026-07-30 → 250 s today: 4.7× in 34 days.** The
refresh step's 69 → 23 s between 09-02 and 09-03 is #2419 landing.

### A2 · The inputs grew ~2×, the job 4.7× — so the growth is super-linear

`corpus-growth.sh` (reads the git tree; no build, no load sensitivity):

| date | corpus cases | ci-native files | `Deno.test` | test LOC | compiler LOC | std LOC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-07-30 | 1,707 | 27 | 151 | 6,597 | 101,126 | 1,071 |
| 2026-08-20 | 2,024 | 32 | 168 | 8,781 | 116,450 | 1,092 |
| 2026-08-27 | 2,304 | 36 | 196 | 10,739 | 137,487 | 4,532 |
| 2026-09-03 | 2,786 | 52 | 294 | 18,358 | 171,493 | 7,888 |
| growth | ×1.63 | ×1.93 | ×1.95 | ×2.78 | ×1.70 | ×7.36 |

The corpus oracle grew **14.7×** on ×1.63 the cases. That gap is §A4.

### A3 · Four files hold 87% of the native step's CPU

`per-file-time.sh` — 53 files, one `deno test` process each, SERIAL on purpose: under
`--parallel` on a shared box a 200 ms case reports 25 s of wall, so the parallel log
cannot attribute anything. Load 24.4 → 43.8. **53 files: 151.3 s wall, 288.5 s user.**

| file | wall | user | share |
| --- | ---: | ---: | ---: |
| `selfhost_native_align_test.ts` (2,691 cases) | 15.0 s | **129.6 s** | 44.9% |
| `vl_buffer_view_bounds_shape_test.ts` (19) | **39.6 s** | 51.3 s | 17.8% |
| `selfhost_native_release_test.ts` (36) | 33.4 s | 39.8 s | 13.8% |
| `vl_check_codegen_test.ts` (11) | 32.0 s | 31.7 s | 11.0% |
| the other 49 files (≤4.6 s each) | | 36.1 s | 12.5% |

`align` is internally parallel (`vl run --batch` waves): 129.6 s CPU in 15.0 s wall. The
other three are near-serial, and **`--parallel` gives one worker per FILE** — so
`buffer_view`'s 39.6 s is a hard wall floor for the step however many cores the runner
has. That is item #2.

### A4 · The corpus oracle: 6 s of compiler inside a 21 s file, single-threaded

`oracle-abi-probe.ts` — one process, the seed instantiated once, every cost centre timed
over all 2,786 single-file cases. Load 67–96.

| centre | ms | % | note |
| --- | ---: | ---: | --- |
| `compileSrc` | 3,701 | 62.4% | 1,976 emitted modules, 5.38 MB — 1.9 ms each |
| `runWasm` | 823 | 13.9% | V8 instantiate + execute each emitted module |
| `checkSrc` | 595 | 10.0% | all 2,786 cases |
| `lintSrc` | 304 | 5.1% | a SECOND parse of every clean case |
| `new WebAssembly.Module(bytes)` | 294 | 5.0% | |
| `srcLoad` bulk / `srcPush` per code point / `rbyteAt` per byte | 138 / 42 / 34 | 3.6% | `srcPush` is 5.29 M calls |
| **total in-process** | **5,931** | | against the file's 21.5 s wall |

Three hypotheses tested and **refuted**. *The per-code-point ABI is the cost*: it is 42 ms
for 5.29 M calls, and the bulk `srcLoad` the Rust host uses is **slower** here (138 ms)
because JS has to build the `Int32Array` — leave `cases_wasm_test.ts` on `srcPush`. *State
accumulates on the one shared instance*: mean ms/case by fifth is `2.88 1.88 2.21 1.04
2.52`, no drift. *Deno's per-test cost*: `deno-test-overhead.sh` runs 2,786 registered
tests in **0.6 s wall / 0.2 s user**.

What is left is that it is **one file, so one process on one core**. `oracle-shard-spike.sh`
(load 13.7 → 8.5): whole file **21.48 s wall / 23.78 s user**; a crude 4-way split by
first letter finishes in **14.24 s**, bounded by the unbalanced `^[s-z]` shard (948 cases)
against `^[a-c]`'s 1.63 s. A balanced split lands near 6 s locally, ~12 s on a 4-core
runner — a **~32 s** job saving. Price: 4× the seed load and corpus walk, 29.9 s user
against 23.8 s (+25% CPU).

### A5 · The per-process floor, and the cold-JIT storm

`count-vl-spawns.sh` swaps the WORKTREE's `scripts/vl-host/target` symlink for a logging
wrapper (the shared binary is never written) and restores it: **3,567 `vl` subprocesses
per native step** — `check` 2,886 (190.1 s summed child wall), `run` 339 (497.1 s), `build`
211 (161.6 s), `fmt` 97, `test` 18, `seed` 2, and 14 argv-only calls (`--help`, `-V`, bad args).

`vl-fixed-cost.sh` / `seed-jit-cost.sh`, load 25 → 20. Same program in both arms, so the
difference is the seed:

| arm | wall | user |
| --- | ---: | ---: |
| `vl --help` (never loads the seed) | 0.00 s | 0.00 s |
| `vl check tiny.vl` / `std/json.vl`, warm sidecar | 0.00 / 0.04 s | 0.00 / 0.04 s |
| `vl check tiny.vl` / `std/json.vl`, **no sidecar** | **4.43 / 4.65 s** | **9.88 / 10.11 s** |

`VL_PROFILE=1` warm reads `load_compiler: 5 ms`, so the warm floor is ~18 s of CPU across
3,567 spawns — not a lever. **The cold arm is.** `refresh-compiler.sh:157-171` moves
forward only the sidecars its own sanity `vl run` created, and the host keys a sidecar by
**mtime** (`scripts/vl-host/src/main.rs:1129-1137`) — so after a refresh the
`vl check`/`fmt`/`test` engine tag has none, and every worker that starts before the first
JIT publishes compiles the 1.8 MB seed itself. `parallel-jit-storm.sh`, alternating, load
76–112:

| arm | wall | user CPU |
| --- | ---: | ---: |
| post-refresh (one tag cold) | 58.45 / 54.59 s | **635.1 / 608.7 s** |
| warm (both tags) | 43.77 / 77.25 s | 321.8 / 364.8 s |

Median **622 → 343 s user: ~280 s of CPU, 45% of the step, is redundant concurrent seed
JIT** — 24 workers each paying the ~10 s above. On a 4-core runner that is 4 workers ×
~10 s CPU ≈ **10 s of wall**: items #3 and #4.

### A6 · The seed's size is not a Deno cost

`seed-sections.sh`: 1,826,627 bytes — code 85.4%, **global 12.1%**, type 1.8%, function
0.5%, export 0.2%; 4,564 functions; no name section (correct). The 221 KB global section is
**3,434 `struct.new` globals**, the interned string-literal pool, 64 bytes each.
`host-load-costs.sh`: in Deno, `new WebAssembly.Module(seed)` is **4 ms** and `Instance`
**2 ms** (V8 compiles lazily), and every seed-driven suite loads it once at module scope.
**Shrinking the seed buys the Rust host's cold path and nothing else** — which item #3
removes anyway.

---

## B · The compiler's per-program cost

### B1 · The "20× per line" premise was the cold JIT, not the program

`per-program-cost.sh`, `module-graph-check.sh`; warm sidecar, best of 3, load 24 → 19:

| program | lines | modules | best | ms/line |
| --- | ---: | ---: | ---: | ---: |
| `print(1)` | 1 | 1 | 0.009 s | — (process floor) |
| 4 lines importing `std:json` + `std:fmt` | 4 | 4 | 0.031 s | — |
| `std/json.vl` | 1,251 | 3 | **0.040 s** | **0.032** |
| `std/fmt.vl` | 1,399 | 2 | 0.027 s | 0.019 |
| `std/array.vl` | 1,867 | 1 | 0.016 s | 0.009 |
| `compiler/entry.vl` | 174,077 | 26 | **4.427 s** | **0.026** |

`vl check std/json.vl` is **40 ms**, and its per-line rate matches the compiler's own. The
6.5 s figure is §A5's 4.4–4.7 s cold `.cwasm` JIT charged to whichever program ran first.
**There is no std-specific per-line penalty** — run the same program twice before believing
one. What IS true: a 4-line program importing `std:json` costs 31 ms while `std/json.vl`
alone costs 40 ms, so **std is re-checked from scratch for every program that imports it**.
A cross-program checked-form cache takes that 31 ms toward the 9 ms floor; the bigger prize
is the LSP (§C2).

### B2 · The self-compile profile after #2419

`guest-profile.sh <dir> build compiler/entry.vl`, 10,433 samples, `--names` seed, load 48.7:

| self% | incl% | function | | self% | incl% | function |
| ---: | ---: | --- | --- | ---: | ---: | --- |
| **17.25** | 17.25 | `__str_eq__` | | 1.49 | 1.49 | `isValueUnionBox` |
| 4.94 | 4.94 | `tyTopIndexOf` | | 1.38 | 1.38 | `nodeTyIxOf` |
| 3.45 | 7.06 | `variantIndexOf` | | 1.27 | 3.10 | `__map_probe__` |
| 3.35 | 6.23 | `unRowOfName` | | 1.12 | **18.72** | `annRepKindOf` |
| 2.18 | 3.00 | `repSlotOfTy` | | 0.97 | **14.09** | `mapReadMvSlot` |
| 2.10 | 5.73 | `nodeTyIsUnionAlias` | | 0.80 | 0.80 | `__str_concat__` |

### B3 · `__str_eq__` is a symptom — whose loop it is

`profile-parents.py <profile> __str_eq__` ranks the immediate CALLER of every sample whose
leaf is `__str_eq__` (1,800 of 10,433). As a share of the whole run / of `__str_eq__`:
`variantIndexOf` 3.61% / 20.9%, `unRowOfName` 2.89% / 16.7%, `__map_probe__` 1.82% / 10.6%,
`declaredSlotOf` 1.14% / 6.6%, `litUnionAliasOfLitTexts` 0.73% / 4.2%,
`nodeTyIsUnionAlias` 0.62% / 3.6%, `scopeSlotOf` 0.54% / 3.1%, `exportSlotOfTarget` 0.42%,
`capHas` 0.22%.

### B4 · The super-linear registries, priced

Axes and ratios are #2429's (`tests/vl_scaling_shape_test.ts`); the data-structure column
is this survey's, verified line by line.

| registry | table (decl) | key / eq | call sites | frozen? | O(1) fix |
| --- | --- | --- | ---: | --- | --- |
| `variantIndexOf` `emit_classify.vl:28618` | `uVariants: string[]` `emit_state.vl:1815` | string, `__str_eq__`; bound is the whole-program variant band | **76** (47 `emit_classify`, 13 `wasmEmit` — all per-expression, 13 `emit_collect`, 2 `emit_mono`) | **NO** — 2 push sites and 0 in-place writes, but `monoRegisterPinUnion` reaches the inline one during monomorphize, which is why it re-ranks tags when the length moves | index maintained at both pushes (§F8) |
| `unRowOfName` `:28732` (`isUName` `:28741`) | `unNames: string[]` `emit_state.vl:1716`, 2,389–2,441 rows | string, `__str_eq__` | 16 + 4 | append-only but **NOT frozen** — a 3rd push at `emit_classify.vl:26992` fires during mono/emit | `sidArr*` extended at all 3 pushes |
| `declaredSlotOf` `:9560` | `localNames: string[]` `emit_state.vl:522`, per FUNCTION | string, `__str_eq__` | 17 | rebuilt per function, 5 reset sites | index in `buildLocals`; cost is reach count, not table size |
| `fnStmtsPosOf` `:16931` | `fnStmts: i32[]` `emit_state.vl:231` + `monoOrigNode` | **i32**, integer `==` | 24, of which 14 in per-node loops | append + 1 write `emit_mono.vl:6353`, all before `emitCodeSection` | reverse index after mono. Already short-circuits 80.3%; residue **19,106 calls / 25,953,420 scan steps** (`perf-program.md:1192`) |
| `modIndexOfKey` `driver.vl:2846` | `modKeys: string[]` `driver.vl:421`, tens of rows | string, `__str_eq__` | 8; `:2859` sits inside `while i < impKey.length` → **O(imports × modules)** | **YES**, strictly append-only | trivial, but smallest N and lowest payoff |
| `capHas` `emit_base.vl:199` | **a `string[]` PARAMETER**, not a registry | string, `__str_eq__` | 22 | 12 sites grow-while-scanning locals; 10 are driver globals | per-site only; no shared index possible |

**`tyTopIndexOf` is not in this family.** `compiler/tyname.vl:439` is a per-CHARACTER
bracket-depth walk over a type-name *string*: the key is an i32 char code compared with
`==`, there is no table, and `grep -c tyTopIndexOf compiler/emit_collect.vl` is **0**, so
`collectA` never calls it. The `generic pins` axis was reading `collectA`'s 68% inclusive as
this family's; profiled at 200/400/800 pins it is `monoRebuild` re-running four whole-program
passes per minted instance, with no registry under it at all
(`profiling-the-compiler.md` §"Measured 2026-09-05"). Its 4.94% is **type names being re-parsed as text**, and the fix
is the destringify / `canonUnionKey` track, not a hash map. Parent-frame rank:
`nullablePartOf` 59.4%, `splitUnionAtoms` 12.0%, `nameIsFuncTypeAtom` 11.1%.

**The O(1) facility already exists**, three of them, all used by compiler code today:
`Map()` (`compiler/symbols.vl:43`; 104 `= Map()` sites in `compiler/*.vl`), the interner
`sidOf`/`sidText` (`symbols.vl:55-93`), and dense sid-keyed side arrays `sidArrGet`/`sidArrPut`
(`symbols.vl:218-235`, backing `fnIndexBySid`, `globalIndexBySid`, `modRenameFirstBySid`).
The precedent is measured at `perf-program.md:1320-1335`: string-keyed probes **2,466,975 →
479,079 (5.15×)** with **0 disagreements of 2,371,115 compared**. So every fix above is
*use the facility*, not *build a map* — subject to `symbols.vl:216`'s caveat that the side
array must be extended wherever the table is written, not only where it is built.

### B5 · The population of the pattern

`while <i> < (P.nodes|fnStmts|sNames|unNames|uVariants|globalStmts).length` — **193 loops**:
`emit_collect.vl` 81, `emit_classify.vl` 43, `emit_sections.vl` 21, `typecheck.vl` 17,
`emit_mono.vl` 10, `emit_rewrite.vl` 8, and 13 across eight more files. By table: `P.nodes`
107, `fnStmts` 32, `sNames` 15, `unNames` 14, `uVariants` 14, `globalStmts` 13. A further
18 scan `localNames`/`unMemberSet`/`modKeys`/`unTyIx`/`uVarTyIx`/`monoOrigNode`. #2429's
`arena-scan-outside-pass` lint already flags **132** of these; that lint plus the
`scan-budget.py` ratchet is the standing guard, and this is the queue behind it.

### B6 · `vl check` scaling in program shape

`check-scaling.sh`, best of 3, load 84.5 → 62.6. A doubling should cost 2×.

| shape | 1,000 | 2,000 | 4,000 | 8,000 | 1k→8k | exponent |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| top-level functions | 0.086 s | 0.152 s | 0.476 s | 0.958 s | ×11.1 | **1.16** |
| call sites of one fn | 0.120 s | 0.509 s | 1.058 s | 2.753 s | **×22.9** | **1.51** |
| type declarations | 0.033 s | 0.061 s | 0.109 s | 0.208 s | ×6.3 | 0.89 |

An idle-box run (load 1.9) gave ×11.6 / ×23.3 / ×3.1 — absolute times moved, the exponents
did not, which is why the ratio is the column. Types are linear. **Call sites are
≈O(n^1.5)** — a shape no axis in `vl_scaling_shape_test.ts` covers, because that suite
grades RESHAPE ratios at fixed total work rather than absolute scale.

**The middle row is mis-named, and the attribution is the checker's definite-assignment set
(landed 2026-09-05).** The generated shape is `const v$i = g($i, $i)` at MODULE SCOPE, so what
the ladder varied was the count of module-level *bindings*, not of call sites — the same
8,000 bindings moved inside one function body scale for an entirely different reason
(`declaredSlotOf` and friends, item #10). `daUnassigned` was a name-keyed `string[]` that pass 1
filled with every top-level binding for the TDZ and that `daMarkAssigned` rebuilt in full on
every write, so N declarations cost N rebuilds of an N-element array of strings. Re-keyed to a
sid-indexed position column (`daLive` plus its inverse `daPos`, membership and mark one array
read each), interleaved min-of-5 on one box:

| N at module scope | 1,000 | 2,000 | 4,000 | 8,000 | 16,000 | 4k → 16k |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before | 0.12 s | 0.19 s | 0.77 s | 2.54 s | 8.22 s | ×10.7 (exp 1.71) |
| after | 0.03 s | 0.07 s | 0.38 s | 1.07 s | 2.76 s | ×7.3 (exp 1.43) |

Guest profile of `vl build` over the 8,000-binding program, same seed both arms bar the change:
`checkProgram` **57.51% → 1.80% inclusive**, `typecheck.vl` self **33.47% → 1.29%**, guest samples
**1,751 → 777**, and no `da*` frame reaches 0.3% after (`daMarkAssigned` alone was 23.87% self,
with `__str_eq__` under the three helpers another 23.2% of the whole run). **The residual
super-linearity is real and is not the checker**: at 16,000 bindings the whole of `checkProgram`
is 0.52% of a 5.26 s build, so the 2.76 s `vl check` still costs is spent outside it, and a
240 KB file with zero module-level bindings checks in 0.74 s against 2.96 s for a 479 KB file
with 16,000. That is the part of item #8 still open, and it needs its own attribution rather
than this one's.

The survey's fix note suggested dropping the pass-1 enrolment for module-level `const`, on the
grounds that a `const` is assigned by construction. **Refuted by witness** — `const a = b + 1`
followed by `const b = 2` is a temporal dead-zone error, and `tests/cases/scope/tdz-module-const.vl`
now pins it; having an initializer says nothing about whether the initializer has RUN. The
enrolment stays, and with O(1) membership it is a linear fill, not a cost.

**And the `unions` axis of `tests/vl_scaling_shape_test.ts` was BLIND because of this.** Both of
its arms declare 801 module-level bindings, so both paid the same quadratic, and the quotient
divided it away: on master at 2,400 bindings the arms read 41.68 s and 37.82 s, ratio 1.10, an
axis grading nothing. With the constant gone they read 8.50 s and 1.02 s, ratio 8.35, and at the
committed 800 the ratio is 3.0 – 3.7 across box load 79 to 227. The axis's bar moved 2.5 → 5.5 and
it takes its own 0.25 s denominator floor, because its cheap arm now costs less than the shared
0.4 s one and a clamped denominator turns a ratio into an absolute budget. What it grades now is
the union registry's own per-entity cost — items #5 and #7 — which nothing had measured.

### B7 · `collectA`'s three phases, and which one a suffix can extend

`monoRebuild`'s stamp (#2594) removed the DUPLICATE rebuild after each minted instance;
minting moves the arena for real, so `collectA` still runs once per instance over the whole
arena. Re-profiled on 964b5050b (`--names` seed, `genPins(N, true)`), it is **52.4% inclusive
at 400 pins and 63.8% at 800**, and its children are annotation TEXT spread thin — no
registry, no single frame: at 800, self 35.8% of its own inclusive, `forceNestedCloSigReps`
13.1%, `nulScalarListKindOfNode` 10.3%, `__str_eq__` 9.5%, `nameIsRefArray` 6.2%. The cost is
the walk, not a lookup inside it.

The pass has three phases, and only the middle one is a function of an arena PREFIX:

| phase | input | what it writes |
| --- | --- | --- |
| **M** — the union member re-marks | `unMemberSet`, in row order | `markValueUnionAtoms` sets value-box flags only; `markRefArrayArms` interns ref-list rows; `markMapUnionArms` interns map-value rows |
| **W** — the arena walk | `P.nodes`, in index order | the `ArrayLit` / `StrLit` / `Call` / `TypeRef` arms: the rep flags, ref-list and map-value rows, the `annRlSlot`/`annRlNul` node sidecar, `rElemKind` |
| **F** — the field-table re-derivation | `uFieldTypes`, `sFieldTypes`, in row order | the same flags and rows, plus `internInlineShapeTy` into the struct table and the code-15 re-key of `uFieldElemName` |

Table by table, is the state a pure function of the arena prefix?

| state | key / dedup | extensible by a suffix walk? |
| --- | --- | --- |
| `rlElemName` + its 7 parallel columns | `repElemKey`, first-match scan | **yes for W** — rows only append, and the walk is a forward scan, so prefix-then-suffix mints exactly what one full walk mints, in the same order |
| `mvValName` + its 8 columns | `(key, value)` pair | same |
| `annRlSlot` / `annRlNul` | ARENA NODE index, `-1` padded | **yes** — each node is written by the walk that covers it, and no site outside the pass records for a node below the mark |
| `rElemKind` | none; last writer wins | **yes** — the last setter over `[0, N1) ++ [N1, N2)` is the last setter over `[0, N2)` |
| `aUsed` … `ba8Used`, `vb*Used`, `fnValUsed` | none; monotone `= true` | **yes** |
| `rlWrSlots` / `rlWrAns` | slot number | **no, and it does not need to be** — a pure memo, cleared on every call by both paths |
| `rlTwin` / `mvTwin` | slot | built by `mAssignTypeIndices` after every `collectA`; empty for the whole pass table |

**What is NOT extensible is F, and the reason is row ORDER.** Rows are slots, slots become
heap-type indices, and a union's box tags are positional — so a resumed walk whose new row
landed after F's tail would emit a different module, not merely a differently-spelled one. F
runs last, so its rows are exactly the tail: the resume pops back to the length recorded
right after W, extends W, and re-derives F. That reproduces a full re-mint's order for every
program, whether or not F minted and whether or not the suffix did.

M needs no such treatment — it runs FIRST, so its rows are at the head, and with
`unMemberSet` unchanged the re-mark is a no-op on flags that are already true and rows that
are still there.

**The invalidation rule is #2594's stamp, plus the registries W classifies against.** The
walk reads more than `P.nodes`: `refArrElemKind` consults `unNames` and `uVariants`,
`nameIsRefArray` the struct table, `genTyParamArr` the type-parameter set — and B4 records
that `unNames` and `uVariants` both take a push DURING monomorphization. A row added to any
of them can re-classify a node the prefix already walked, so the resume requires
`unMemberSet`, `unNames`, `uVariants`, `sNames`, `sFieldTypes`, `uFieldTypes` and
`genTyParamNames` all unmoved; any growth retires the prefix and the next call re-mints in
full.

That leaves the IN-PLACE writes `monoArenaTick` counts. Read against what W actually reads,
nine of the ten write `fnStmts`, `fnParent` or a `Param`'s type slot — none of which the walk
looks at, and the `TypeRef` the tenth mints is appended, so the suffix covers it. The four
that matter are the callee renames (`cal.identName = …`), because the `Call` arm classifies
that name. They retire the prefix only when the OLD name is one the arm tests, and
`collectACallIntrinsic` is the one home of that vocabulary, read by the arm and by
`collectANoteIdentRename` alike.

**And the resume is ARMED, not inferred — the first candidate was wrong and the fixtures said
so.** Only `emit_mono.vl`'s arena writes are enumerated; between the pass table's two
`collectA` rows sit `dispatchRewrite`, `captureBoxRewrite`, the three annotation syntheses and
`scanArrLitCommit`, which edit nodes in place and write `arrLitCommitName` — a table the walk
READS. A version that resumed whenever the registry lengths held moved two of the 2,975
`tests/cases` modules: `arrays/array-new-ref-fill-inferred.vl` went from building to
`emitProgram: __array_new__ fill type not yet supported natively`, and
`generics/type-param-shadows-alias-through-constructors.vl` emitted different bytes. So
`monoRebuild` arms the resume around its own call and nothing else does, and only an armed run
banks a prefix — which is why `collectA` and `collectA#2` still re-mint whole.

**Measured on 964b5050b**, `--names` seed both arms, `genPins(N, true)`:

| | 200 pins | 400 pins | 800 pins |
| --- | ---: | ---: | ---: |
| master, many arm (min of 3) | 0.28 s | 0.86 s | 3.57 s |
| after | **0.17 s** | **0.41 s** | **1.18 s** |
| ratio | 0.61× | 0.48× | **0.33×** |

At 800 pins the guest sample count falls 3,528 → 1,839 and `collectA` goes **63.78% inclusive
→ 1.96%**; `monoRebuild` as a whole goes 71.4% (the post-#2599 reading) → **21.37%**. The
`generic pins` axis reads 0.95–0.99 idle against master's 2.06–2.27, and 0.95–1.34 at box load
68–101 against master's 3.61–3.69, so its bar comes off the super-linear ladder: **6.0 → 2.5**.
Re-measured on the merged base 8afdffb2 (which carries #2602's `monoModuleLetOf` index, the
other big term of the same arm) the pair reads **0.94 – 0.99 against master's 2.16 – 2.39**,
and 8 of 8 green at the new bar with a fanned-out `gate.sh` beside it.

What is left inside `monoRebuild` is `buildFnMap` at **18.71% of the whole compile** (87.5% of
`monoRebuild`), with `retAnnKindChain` 38.3% of it, `retVoidAnnFlag` 16.5% and
`refArrElemNameIf` 12.5% — the same per-instance whole-program pass one row over, and it does
not have `collectA`'s prefix shape: it rebuilds a per-function return-kind table. Outside it,
`monoModuleLetOf` is 14.14% self and `recordRedundantAnnot` 7.01%. `collectA`'s own residue is
0.76%, and all of it is the field-table phase this design deliberately re-runs.

### B8 · `buildFnMap`'s ten columns, and why six need a row cache

Re-measured on 4b0af3a47, `--names` seed, `genPins(N, true)`, `VL_PROFILE_GUEST` +
`profile-rank.py`: `buildFnMap` is **10.61% inclusive at 400 pins and 18.58 – 20.38% at 800**
over three interleaved pairs, and **89.9 – 95.1%** of what is left of `monoRebuild`. B7's
estimate of 18.71% was one merge behind and reads high or low depending on which of the six
landings since is in the denominator; the SHAPE it named is the shape measured. Its children at
800 pins:

| immediate child of `buildFnMap` | % of it | % of compile |
| --- | ---: | ---: |
| `retAnnKindChain` | 48.71 | 9.57 |
| `refArrElemNameIf` | 15.52 | 3.05 |
| `sidOfNode` | 9.91 | 1.95 |
| `retVoidAnnFlag` | 8.62 | 1.69 |
| `sidArrPut` | 6.47 | 1.27 |
| (self) | 5.17 | 1.02 |
| `retStructIndex` | 2.59 | 0.51 |

There is no walk here — the pass is one loop over `fnStmts`, and every row is a pure function
of that function's own `FuncDecl` node plus the registries the return classifiers consult. So
it is not a resume, it is an INDEX with an append, which is what B7 predicted.

**What the pass writes, and what a suffix can extend.** Ten columns, and the split is not by
shape but by who else writes them.

| column | seeded from | written after `buildFnMap`? | prefix treatment |
| --- | --- | --- | --- |
| `fnNames`, `fnIndices` | `s.fnName`, `i` | no | **keep** — the live prefix already is the answer |
| `fnIndexBySid` | `sidOfNode`, first-occurrence | no (only the per-program reset) | **keep** — first-wins over prefix then suffix is first-wins over the whole |
| `nestedNameBySid` | `fnParent[i] >= 0` | no | **keep** — monotone set-to-1 |
| `fRetVoid` | `retVoidAnnFlag` | `computeVoidFns`, `emit_rewrite` | **re-seed from the cache** |
| `fRetStructIdx` | `retStructIndex` | `computeRetInference` | re-seed |
| `fRetRArrElem` | `retRefArrElemName` | `computeRetInference` | re-seed |
| `fRetBool` | `retBoolFlag` | `computeRetInference` | re-seed |
| `fRetKind` | `retAnnKindChain` | `computeRetInference` | re-seed |
| `fRetLitAtom` | the constant 0 | `computeVoidFns`'s literal-atom arm | re-seed (write 0) |
| `fnChildHead` / `fnChildNext` | — | lazily rebuilt on demand | cleared every call, as before |

**The refinement is why a cache is needed at all.** `computeVoidFns` and `computeRetInference`
run straight after `buildFnMap` and write into those six columns in place, so what stands in
them at the next call is a REFINED value where a full re-mint would put the annotation's own.
Keeping them would hand round k+1 round k's fixpoint as its seed — and that fixpoint is a
function of the whole arena, not of one function, so it is not stable under a callee rename.
The cache banks the seed row by row as each function is classified, and the resume writes it
back. That makes the resumed pass produce exactly what a full re-mint produces, for every
program, whether or not anything was minted.

**The invalidation rule** is `collectA`'s seven registry lengths — `retStructIndex` reads the
struct table and the variant rows, `retAnnKindChain` the union names, `refArrElemNameIf` the
struct table — plus one signal `collectA` does not need. The walk `collectA` resumes reads
`P.nodes`; `buildFnMap` reads `P.nodes[fnStmts[i]]` and `fnParent[i]`, and the monomorphizer
re-points BOTH in place: `fnStmts[tSlot] = clone`, `fnStmts[origFe] = nfn`, `fnStmts[gp] =
mkFunc(…)`, `fnParent[s] = parentSlot`, `fnParent[msl] = instFe`. Five sites, all in
`emit_mono.vl`, each of which would re-classify a function the prefix already covers — so each
calls `buildFnMapNoteFnSlotWrite()` and `tests/vl_mono_arena_tick_test.ts` gained a third rule
that requires it, validated against its own control and against a live one (deleting the note
at `emit_mono.vl:3554` makes the suite name that line). The rule also covers `.fnRet =` and
`.fnName =`, which have no site in `emit_mono.vl` today — the fifteen `fn.fnRet =` writes are
`synthRetAnnots`' in `emit_rewrite.vl`, outside the armed window, and the two `.fnName =` are
the module merge and `collectFns`' lambda naming, both earlier. That arm is forward-guarding,
and it is there because a `monoArenaTouch()` is NOT a substitute for the note: the bump makes
`monoRebuild` RUN, and a run whose prefix is still armed re-seeds the stale row.

The `Param` writes and the four callee renames are the ones this pass does NOT care about: it
reads no parameter and no call node. Nor does it need `T.tys` or `nodeTyIx` in the predicate:
the tree has **zero** in-place `T.tys[…] =` writes, and the only in-place `nodeTyIx` write
during emit is `nodeTyCarry`, called twice from `emit_rewrite.vl` and never from the armed
window. The resume is armed by `monoRebuild` alone, for B7's reason, and unarmed everywhere
else — so only a run inside that window banks a prefix.

**Measured on 4b0af3a47**, `--names` seed both arms, min of five interleaved, box load 24–38:

| | 200 pins | 400 pins | 800 pins |
| --- | ---: | ---: | ---: |
| master, CPU seconds | 0.170 s | 0.380 s | 1.150 s |
| after, CPU seconds | 0.170 s | 0.330 s | **0.890 s** |
| master, wall clock | — | — | 0.844 s |
| after, wall clock | — | — | **0.661 s** |

At 800 pins `buildFnMap` goes **18.58 – 20.38% inclusive → 0.25 – 1.58%** and `monoRebuild`
**20.65 – 22.61% → 2.75 – 3.44%**, of which `buildFnMap` is 1.45, `collectA` 1.05,
`computeVoidFns` 0.39 and `computeRetInference` 0.13 — the pass table's four rows now cost
about the same as each other. Guest samples at 800 pins fall 1,011 – 1,181 to 760 – 801.
The `generic pins` axis reads **0.80 – 1.06 against master's 0.88 – 1.20** over five
interleaved rounds; both arms clamp on the harness's 0.4 s floor at 400 pins, so the bar STAYS
at 2.5 — below the family default would be a bar on noise, not on a shape.

**The self-compile is a wash, and the reason is worth recording**: `monoRebuild` is **0.00% of
the compiler compiling itself** — the compiler's own generics mint few enough instances that
the pass never repeats. So the L2 CPU reads 4.97 – 6.38 s against 4.93 – 6.26 s over five
interleaved rounds, which is load, not signal, and the fixpoint proves nothing about the
resume. What DOES exercise it is `tests/cases`: an `emitFail` probe on the resume branch
(validated both ways — it fires on the many arm, is silent on the one arm and on the compiler)
says **167 of the 2,983 modules take the resume**, across generics 59, functions 24, std 16,
soundness 12, closures 11, inference 9 and six more directories. All 167 are byte-identical
under both seeds.

What is left at 800 pins: `__str_eq__` 15.36% self, `recordRedundantAnnot` 11.61% self (11.86%
inclusive), `numLexIsFloat` 2.75%, `sidOfNode` 2.25%. `recordRedundantAnnot` is now the largest
named frame and it is not in `monoRebuild` at all.

---

## C · The host and the LSP

| question | answer | source |
| --- | --- | --- |
| wasmtime startup, warm sidecar | `load_compiler: 5 ms`; whole `vl run print(1)` 0.00 s wall | `host-load-costs.sh` |
| wasmtime startup, cold | **4.43 s wall / 9.88 s user**, independent of the input | `seed-jit-cost.sh` |
| sidecar freshness key | **mtime**, not content (`main.rs:1129-1137`) — a byte-identical rebuild invalidates every sidecar | source |
| Deno/V8 seed load | `WebAssembly.Module` **4 ms** + `Instance` **2 ms** | `host-load-costs.sh` |
| deep-`is` second pass (#2406) | gated on `jwSiteNode.length == 0` (`driver.vl:661`); when it fires it re-tokenizes a generated fragment and runs `checkProgram` a SECOND time over the whole program | source |
| its measured cost | **none detectable** — 400 scenery lines 0.116 s without / 0.110 s with; 1,200 lines 0.161 / 0.160 s. The gate demonstrably fires (witness runs, rc 0) | `deep-is-second-pass.sh` |

### C2 · The LSP re-checks the whole graph on every keystroke

`lsp/src/server.ts:321-388`: every change runs `wasmChecker.check(text, entryKey,
workspaceReader)` over the whole module graph, then `wasmChecker.lint(text)` — a **second
full parse** — then `unusedExportHints`. Only the workspace unused-export crawl is
debounced (3 s idle / on save). Graph check alone (`module-graph-check.sh`, load 24 → 19):
no imports **9 ms**, `std:json`+`std:fmt` **31 ms**, `compiler/entry.vl` (26 modules)
**4.427 s**. Editing a `compiler/*.vl` file costs ~4.4 s of checking per keystroke — and
the modules axis is itself the super-linear one (`modIndexOfKey`, ~N^2.5 in file count,
#2429). The two fixes that matter are the cross-program std cache (§B1) and a per-module
checked-form cache keyed on unchanged source.

### C2a · Where a keystroke goes — the MERGED check, not the per-module half

Two instruments. `scripts/perf/lsp-keystroke.ts` drives the driver exports the way
`prepare` + `ensurePrepared` do and times the halves the host can see;
`scripts/perf/guest-profile.sh` with `scripts/perf/profile-phases.py` splits the guest half
by PIPELINE STAGE rather than by function. Read the second-edit row — the first pays for a
cold scan cache, the second is the steady state.

`lsp-keystroke.ts` RAW, seed `7a733ea6b`, median of 3, load 8.9 → 4.4:

| case | mods | src KB | edit | reader | push | commit | STAGE | `checkSrcSym` |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 module | 1 | 0 | 2nd | 0.0 | 0.0 | 0.0 | 0.0 | 0.1 |
| 4 modules (std) | 4 | 52 | 2nd | 0.2 | 0.7 | 0.2 | 1.4 | 12.3 |
| `compiler/entry.vl` | **30** | 5,686 | 2nd | 9.5 | 60.7 | 23.3 | **93.2** | **1,260.3** |

The graph is 30 modules, not the 26 the paragraph above says: `std:fmt` and its own
dependencies arrive through the template-hole injection (`TPL_RENDER_MODULE`).

Phase split of the guest half — `vl build compiler/entry.vl` under `VL_PROFILE_GUEST`, 7,270
samples at load ~110, with a second run of 5,613 samples moving `checkProgram`'s share only
76.9% → 75.3%. `vl check` cannot be profiled at all (the guest profiler hooks `compile_vl`,
which `check` does not take), so this is a BUILD with the emit column held out; every other
phase is shared with a check.

| phase | samples | % of the check side |
| --- | ---: | ---: |
| staging: `modCommit` / `modScan` / `modSrcLoad` | 266 | 18.9% |
| 1 order + validate (`modVisit`) | 49 | 3.5% |
| 2 lex per module (`vcLoadToksMod`, a cache replay) | 28 | 2.0% |
| 2 parse per module (`parseProgram`) | 84 | 6.0% |
| 2b duplicate-binding / builtin-decl screens | 14 | 1.0% |
| 3+4 rename + rewrite per module | 85 | 6.0% |
| 5 `csPreMintLocs` (merged) | 3 | 0.2% |
| **5 `checkProgram` (MERGED)** | **876** | **62.2%** |
| 6 `emitProgram` (merged, build only) | 5,862 | — |

Folding the two — the phases inside `checkSrcSym` are everything but staging, 1,139 of the
1,408 check-side samples — one keystroke on `compiler/entry.vl` is:

| | ms | share |
| --- | ---: | ---: |
| `checkProgram` + `csPreMintLocs` over the MERGED program | ~972 | **72%** |
| the per-module pipeline (visit, lex replay, parse, screens, rename + rewrite) | ~287 | 21% |
| staging (the host→guest source push and the scan cache) | 93 | 7% |

**So §C2's own prescription — "a per-module checked-form cache keyed on unchanged source" —
saves the small half.** Its ceiling is 28%, and most of the 21% is not cacheable as written:
`parseProgram` and `modRwStmt` write into the SHARED node arena at absolute indices, so
replaying an unchanged module's parse means relocating every child index in its slice, which
is an arena pass and not a cache. The 62% is ONE `checkNode` walk (96.8% of `checkProgram`)
over `mkProgram(allStmts)` — every module's statements concatenated into one program.

### C2b · What the merged half would take, and why it is not one PR

The merge is dependency-first (`modVisit` is a DFS whose post-order puts the ENTRY LAST), so
the unchanged dependencies are a stable PREFIX of `allStmts` and the edited file is the
suffix. What a keystroke wants is therefore a CHECKPOINT, not a cache: walk the prefix once,
snapshot the checker after it, and resume from the snapshot on every later keystroke that
changed only the entry. The snapshot has to hold the whole of the checker's program-scoped
state — the `T.tys` type arena, the scope stack, `nodeTyIx` and its siblings, the sid-keyed
tables, `daLive`/`daPos`, `topUnannotFns`, the inferred-return records — and a column left
out of it is a silently wrong hover rather than a failure. That is a track, and it sits
behind `docs/internals/registry-by-type-id.md`: a snapshot is only as cheap as the identities
in it, and the type arena is still keyed on rendered names.

Two smaller findings from the same measurement, named here rather than lost:

* **An edit followed by a hover was TWO whole-graph checks** — closed in §C2d.
* **`checkSrcSym` records occurrences for all 30 modules** and the editor asks about one.

### C2c · The staging half, and the cache that was already there

`modScanCached` / `vcLoadToksMod` (`compiler/driver.vl`) already cache a module's
import/export scan and its whole token stream, per **(key, source text)** — that is why the
4-module std graph re-stages in 1.4 ms. Two defects the keystroke workload finds and a
directory check does not:

**It grew without bound.** Every keystroke commits the edited file under the same key with
new text, which is a MISS, which appends a slot — and nothing can ever hit that slot again,
since the only source that would is the one the user just replaced. Staging
`compiler/typecheck.vl` (26k lines, a 9-module graph) 100 times, RSS:

| | edit 0 | 20 | 40 | 60 | 80 | 99 | peak |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| master `8afdffb2f` | 141 MB | 679 | 1,084 | 1,986 | 1,478 | 2,724 | **2,724 MB** |
| one slot per key | 147 MB | 341 | 323 | 439 | 342 | 273 | **450 MB** |

~26 MB a keystroke, held for the life of the server. The CONTROL is the same run with the
text held FIXED, which stays at 142–325 MB on master — the growth is the cache, not the
harness. The fix: at most one slot per key, a source change DROPS the key's slot before
banking the new one, and the dropped rows come straight back when they are the trailing ones
(they are, from the second edit on, and the seed's own counters read 10 slots / 377,600 rows
flat from edit 1 to edit 99). What a non-trailing drop strands — its rows AND its slot — is
counted, and the whole cache clears once either outgrows its live half. **The bound is
applied after the re-bank, not inside the drop** — checked between the two, one module's rows
read as half the cache and the clear fired on every keystroke, re-scanning the whole graph.

The clear is the fallback for the pattern that strands a slot every time, and it is measured
rather than assumed: ALTERNATING between two compiler files as the entry, 30 stagings, fires
**7 clears** and holds the store at 782k rows / 606 MB peak, against master's same run
reaching **927 MB** and still climbing.

**And the host re-pushed 5.68 MB of unchanged source per keystroke**, code point by code
point, for 29 modules the seed already held. `modCommitCached(srcBytes)` commits a module
from the cache's own copy of its source, so only the edited file crosses;
`lsp/src/wasmChecker.ts` keeps a per-instance memo of what it last pushed under each key and
uses it when the reader hands back the identical text. The seed is the authority — it answers
0 when its slot is gone or disagrees about the length, and the host pushes — so a stale memo
costs a push and never an answer.

`lsp-keystroke.ts` CHECKER, three interleaved rounds per arm, load 6.5 → 4.4, second and
later edits (the ones the cache serves):

| graph | before | after | modules pushed |
| --- | ---: | ---: | --- |
| 1 module | 0.1 ms | 0.1 ms | 0 → 0 (no module table) |
| 4 modules (std) | 4.7 ms | 3.9 ms | 4 → **1**, 3 from the cache |
| `compiler/entry.vl` (30) | 614.4 ms | **525.1 ms** | 30 → **1**, 29 from the cache |

−14.5% of a keystroke, which is the staging half of the 28% ceiling above. The 89 ms is more
than the 60 ms `push` column because a skipped commit also skips the guest's own
`fromCodePoints` over that module's accumulator. The merged 72% is untouched and stays item
#9's real content.

**THE PUSH COUNT IS THE ROBUST HALF OF THAT TABLE.** Re-run over the same pair at load 43 →
105, five interleaved rounds read 892 / 656 / 1,303 / 834 / 1,947 ms against 820 / 1,569 /
698 / 541 / 1,046 — the timing is buried, while `30 → 1 pushed, 29 cached` reproduces on
every round. Quote the counts wherever the box is not quiet.

### C2d · The edit and the hover after it, on one check

A keystroke makes four requests and they were paying three whole-graph checks. They now pay
one, at every graph size:

| case | arm | change | +hover | +tokens | +inlay | burst |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| any of 1 / 4 / 30 modules | before | 1 | **1** | 0 | **1** | **3** |
| any of 1 / 4 / 30 modules | after | 1 | **0** | 0 | **0** | **1** |

THREE things were in the way, and none of them is the memo.

**The entries disagreed about diagnostics.** `checkSrc` ran the deep-`is` second pass on the
single-source path and `checkSrcSym` did not, so the diagnostics pass could not ride the
symbol-aware check — a program whose only error is a walker the rewrite cannot route would
have published clean. The module pipeline always ran the pass for both, so this was a
single-source-only split; `checkSrcSym` now runs it there too. Over `tests/cases`, master's
two entries disagree on **1 of 2,786** programs and this branch's on **0** — the corpus
already carried the witness (`unions/error-deep-is-arm-rebinds-receiver.vl`). The host gates
on a `checkSymDiagsComplete` probe, because diagnostics is the one surface that may not
degrade against an older seed.

**And the check ran FIRST of the three.** `onDidChangeContent` also runs `lint` (a parse-only
pass over the same instance) and the unused-export hints' `moduleSurface` (which resets the
module table); each discards a checked graph, so whatever the check left was gone before the
hover asked. `server.ts` runs the check LAST.

`scripts/perf/lsp-keystroke.ts`'s PAIR section times both orders. Both arms in one process,
rounds interleaved, medians of 5 at load 96 → 68:

| case | before | after | speedup | checks |
| --- | ---: | ---: | ---: | --- |
| 1 module | 0.7 ms | 0.8 ms | 0.97x | 2 → **1** |
| 4 modules (std) | 39.6 ms | 21.6 ms | 1.83x | 2 → **1** |
| `compiler/entry.vl` (30) | **3,372 ms** | **2,005 ms** | **1.68x** | 2 → **1** |

The speedup is under 2x because a symbol-aware check is not free: staged identically,
`checkSrcSym` is **1.8–2.0x** `checkSrc` on the 30-module graph, which is §C2b's other finding
(occurrences recorded for all 30 modules) priced. Before was one of each, after is one
symbol-aware check. Two earlier runs of the same ladder read 1.21x at load 15 → 81 and 1.43x
at load 89 → 62; the count is the robust half.

**The second pass leaked its generated code into every query family, and had since the module
pipeline shipped.** It splices walkers onto the token stream and re-checks with the symbol
table on, so an 8-line file reported **29 semantic tokens and 10 inlay hints past its own end**
and offered `__vlJsonIs_0` and friends as completions. An occurrence at a generated token is
now never recorded — the rule the style tier already applied through `jwTokIsGenerated`.

**The third was the LEXICAL slice, which is not one of the destructive passes.** The semantic
tokens handler ends with `lexicalTokensAt`, and that shared the "a pass that pushes the entry
source again owes a check" downgrade with `lint`, `formatSrc` and `declExtentsAt` — which
really do re-lex into `P.toks` and re-parse the shared arena. `lexScan` does not: it writes
only its own four span tables and calls `tokenize`, whose state is the lexer's own scanner
globals. So over the text already staged it keeps the check, and the inlay request behind it
is free. The DIFFERENT-source arm still drops the staging, because the instance then holds a
program the memo does not describe.

`scripts/perf/lsp-keystroke.ts`'s BURST section, both arms in one process, rounds interleaved,
medians of 3 at load 17 → 13 and again at load 10:

| case | before | after | speedup | burst checks |
| --- | ---: | ---: | ---: | --- |
| 1 module | 0.4 / 0.3 ms | 0.3 / 0.3 ms | — | 2 → **1** |
| 4 modules (std) | 21.2 / 19.5 ms | 9.1 / 10.7 ms | 2.33x / 1.82x | 2 → **1** |
| `compiler/entry.vl` (30) | **2,782 / 2,791 ms** | **1,698 / 1,611 ms** | **1.64x / 1.73x** | 2 → **1** |

Raw reps at 30 modules, second reading: before `2807 / 2791 / 2790`, after `1611 / 1610 / 1616`.
This one is host-only — the seed is the same file in both arms.

---

## D · String building is O(n²)

### D1 · The rep: no slack, no rope, no small-string case

A `string` is a 4-field slice header `{backing: (ref (array (mut i8))), start, len, hash}`
over packed UTF-8 (`emit_state.vl:1170-1226`, emitted at `emit_sections.vl:4882-4909`);
`slice` allocates a header only. Distinct string LITERALS are interned as immutable module
globals (`collectStrPool`, `emit_sections.vl:3357-3374`) — 3,434 in the seed — but
**nothing interns a computed string**.

`__str_concat__` (`emit_sections.vl:2341-2390`) is: read both lengths, `array.new_default`
a backing of **exactly** `lenA + lenB`, two `array.copy`s, one `struct.new`. **No capacity
slack, no small-string case, no rope node.** `a + b + c + d` is **three** such calls
(`emitStrConcat`, `wasmEmit.vl:11697-11713` is strictly binary; dispatched at `:23936`) —
there is no chain flattening anywhere. Interpolation is desugared **in the parser** into a
left-nested `+` chain (`parseTemplate`, `parser.vl:1177-1186`), so a template with `h`
holes is `2h` concat calls, each copying the whole accumulated prefix.

### D2 · Measured

`string-build-bench.sh`, best of 3. Both programs build the same string from 20-byte
pieces; rungs 2k–16k at load 20 → 13, rungs 32k–64k at load 15.6 → 13.5.

| N pieces | built | `s = s + piece` in a loop | `str.join` (std's builder) |
| ---: | ---: | ---: | ---: |
| 2,000 | 40 KB | 0.013 s | 0.018 s |
| 4,000 | 80 KB | 0.018 s (×1.33) | 0.019 s (×1.05) |
| 8,000 | 160 KB | 0.035 s (×2.04) | 0.020 s (×1.05) |
| 16,000 | 320 KB | 0.120 s (**×3.38**) | 0.022 s (×1.08) |
| 32,000 | 640 KB | 0.489 s (**×4.08**) | — |
| 64,000 | 1.28 MB | 2.351 s (**×4.80**) | — |

A re-run of the whole ladder at load **243** gave ×4.26 and ×5.30 on the top two rungs
while `join` stayed flat at 0.03–0.04 s across every N — the absolute times move with the
box, the shape does not, which is the whole argument.
`docs/guide/strings-design.md:797-816` measures the same shape independently (20,000
appends 0.31 s, 40,000 1.44 s, 80,000 9.47 s) and records the history that matters: **the
fix once existed.** "B7b string-accumulation fusion … shipped in `compiler/toWasm.ts` and
**died with the TS core — it was never ported to `compiler/*.vl`**." Nothing caught it
because `tests/cases/strings/accum-*.vl` assert the RESULT, which per-append concat
produces just as correctly — **a fixture that pins a value cannot pin a cost class.**

### D3 · std pays the workaround by hand; the compiler does not

`std/*.vl` has **zero** in-loop string accumulators. `std/str.vl:246` says why: every
builder there (`join`, `replaceAll`, `repeat`, `padFill`, `mapAsciiCase`) fills an `i32[]`
and calls `fromCodePoints` once — **28 ms against 12,475 ms** for a 40,000-piece `join`
(`std/str.vl:406-425`). `compiler/fmt_util.vl:216-243` records the same lesson the hard
way: the accumulator "was O(n²) and blew the compiler's NON-FREEING null-GC heap on a large
file". `string-concat-sites.py` counts what has not had that treatment: **165 `x = x +
<string>` sites, 129 inside a loop, 13 at depth ≥ 2**, and **451 chains of 3+ string
operands, 131 inside a loop**. Both are LOWER BOUNDS — the detector credits a binding as a
string only from an explicit `: string` or `= ""`, so an inferred accumulator is missed (a
richer type resolution over the same tree finds 221 and 663). In-loop by file:
`typecheck.vl` 44, `parser.vl` 13, `emit_classify.vl` 11, `emit_rep.vl` 11, `lexer.vl` 10,
`format.vl` 8, `json_walk.vl` 8, then nine more files.

The five on the per-program hot path:

| site | why |
| --- | --- |
| `lexer.vl:673,682,818` `scanQuoted` | per string-literal TOKEN of every file, one prefix copy per escape run |
| `typecheck.vl:11137` `tyToStrGo`, `:12269` `tyToEmitNameGo`, `:12907` `tyToNominalNameGo` | the three **unmemoized** type-name renderers — Θ(fields²) per type, re-run per name-minting site |
| `parser.vl:936-937` `parseTypeAtom`, `:2030-2031` `parseTypeDecl` | type annotations ARE concatenated strings here, so every object/union annotation pays per field at parse time |
| `format.vl:1714,1727` `binaryChain` | `vl fmt` visits every node; fires on every binary expression *and* every template literal, which the parser turned into a `+` chain |
| `tyname.vl:349` `nameStripSpaces` | `out = out + fromCodePoint(name[j])` **per character**; its header measures 18,666 of 89,166 names taking it |

The longest chains (15 operands: `typecheck.vl:19162`, `:23439`, `:23748`;
`wasmEmit.vl:3316`) are diagnostic messages, cold on a clean build. The accumulators are
where the per-program cost lives.

### D4 · What it costs the COMPILER today

`__str_concat__` is **0.80% self** of the self-compile (83 of 10,433 samples), and its
callers are key construction, not text building: `memberPathKeyOf` 34.9%, `i32ToStr` 16.9%,
`variantSig` 12.0%, `retireNarrowForIndexCells` 7.2%, `placeKeyOf` 3.6%, `rtInternKeyOf`
3.6%. The compiler's concat cost and its `__str_eq__` cost are the same defect seen twice —
**string keys for name-keyed registries** — and §B4's fix removes both. The 129 in-loop
accumulators are small today because their inputs are; they are the shape that fails on a
large input, which is exactly what `fmt_util.vl:216` records happening once already.

### D5 · The three fix shapes, priced

| | mechanism | saving | eff | risk | proof |
| --- | --- | --- | --- | --- | --- |
| **A** n-ary fusion | `a + b + c + d` compiles to ONE sized allocation instead of 3 pairwise copies | ~2× on a 4-term chain; **nothing** on the loop shape, which is the quadratic one | S–M | low, emitter-local | corpus byte-identity for every program with no 3+ chain; a chain-length ladder |
| **B** loop-local builder | a string local only ever appended to inside a loop and read after it lowers to a growable buffer with capacity doubling, materialised at first non-append use | **O(n²) → O(n)** — the whole D2 table | M–L | needs an escape/alias check; a missed alias is a wrong program | corpus byte-identity where the pattern is absent; the D2 ladder with a ratio bar of 2.5; `regress.py`; `rep-fuzz-check.sh` |
| **C** ropes | `+` yields a concat node flattened lazily on first byte access | O(n²) → O(n), and catches chains the analysis cannot see | L | **rep layer** — every string op in the emitter and std pays a flatten check | full rep-fuzz; byte-identity is impossible (the rep changes), so the proof is behavioural equality over the corpus plus a flatten-cost ladder on read-heavy programs |

**B is the recommendation, A the cheap down payment.** A alone does not touch the loop,
which is the shape that hurts; C changes the rep for every program to fix a pattern a
static analysis can see in most of them.

### D6 · Measured after A and B (2026-09-03)

D2's ladder re-run, 20-byte pieces, best of 3, ratio per doubling. **fn** is D2's loop
inside a function; **plus** is D2's module-SCOPE spelling, still quadratic (item 7's rest).

| N | fn before | fn after | plus before | plus after | `join` after |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 32,000 | 0.819 s | 0.017 s | 0.707 s | 0.598 s | 0.027 s |
| 64,000 | 5.052 s | **0.024 s** | 5.932 s | 3.055 s | 0.037 s |
| ratio | 6.16 | **~1.0** | 8.38 | 5.10 | 1.37 |

In the compiler's own emitted module, `call $__str_concat__` sites **2,649 -> 399** and
inline `array.copy` **2,366 -> 5,420**; `__str_concat__` self% of a self-compile **0.66% ->
0.26%**; L2 self-compile CPU **10.04 s -> 7.69 s** interleaved at load ~110, on a seed that
grew 1,833,871 -> 1,992,504 bytes. `tests/cases` byte-identity: 2,792 modules, 2,184
identical, 107 differ (each carries a 3+ chain or an accumulator), 501 refuse under both.

### D7 · Inline unroll or a runtime helper? INLINE STAYS (measured 2026-09-03)

A's fuse is UNROLLED at every site, which is a large part of why the seed has grown. The
alternative was BUILT and measured rather than argued: a FIXED-ARITY family `__str_cat3__`
… `__str_cat8__`, one function per arity, minted under `aUsed` beside the string trio, its
body the SAME emitter the inline unroll uses. That is the helper's BEST case — a site's
parts are already on the wasm stack in left-to-right order, which is a call's operand
order, so a site is `n` evaluations plus a `call`, with no parts array to allocate, no new
heap type and no pool. A THIRD arm brackets the crossover: the same family over arities
**5..8 only**, leaving 3 and 4 inline. All three reached their own self-compilation
fixpoint at `a94037b0` and move **0 of 7,564** distilled-corpus cells.

ARITY HISTOGRAM of the compiler's own fused chains — an `i32.const 1000000+n` marker
emitted per site by a throwaway instrumented compiler, counted in the disassembly of the
module it produced. **652 chains, 2,751 parts, mean 4.22:**

| arity | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sites | **331** | 113 | 110 | 36 | 28 | 9 | 10 | 5 | 3 | 1 | 1 | 1 | 4 |

50.8% at arity 3, 68.1% at <= 4, 85.0% at <= 5, 94.8% at <= 7; only **5.2% at >= 8**.

| | inline (shipped) | hybrid [5,8] | helper [3,8] |
| --- | ---: | ---: | ---: |
| fixpoint seed | 2,043,139 B | 1,994,687 (−2.37%) | **1,922,054 (−5.93%)** |
| `vl check --codegen tests/cases` (2,792 programs), min user CPU of 4 | **51.43 s** | 51.62 | 51.70 |
| … per-round ratio against inline, 4 rounds | 1.000 | 1.006 / 1.017 / 1.005 / 1.004 | 1.008 / 1.016 / 1.011 / 1.005 |
| L2 self-compile, same source, min / med user CPU of 6 | 7.86 / 12.04 s | 7.88 / 11.93 | 7.84 / 12.12 |
| 100M × arity-3 chain, min / med user of 8 | **1.780 / 2.200 s** | *1.750 / 2.230* | 1.970 / 2.300 |
| 100M × arity-5 | **2.400 / 3.045 s** | 2.570 / 3.275 | 2.550 / 3.265 |
| 100M × arity-8 | **3.800 / 4.385 s** | 3.830 / 4.420 | 3.890 / 4.515 |
| 100M × arity-15 — CONTROL, all three inline | 7.430 / 9.520 s | *7.330 / 9.380* | *7.300 / 9.565* |
| seed COLD Cranelift (`vl check tiny.vl`, no sidecar), min user of 5 | 11.14 s | — | **10.66 s** |
| seed WARM (`.cwasm` sidecar), wall | 0.01 s | — | 0.01 s |
| Deno `new Module` + `Instance`, min of 15 | 3.1 + 1.3 ms | 3.1 + 1.3 | **2.9 + 1.3** |
| a string module with NO 3+ chain — default / `-O` / `-O3` | **1,902** / 275 / 196 B | — | 3,571 / 275 / 196 B |
| `std/json.vl` — default / `-O` / `-O3` | **34,589** / 22,176 / 22,392 | — | 35,483 / **21,841** / **22,164** |
| `std/fmt.vl` — default / `-O` / `-O3` | **19,175** / 11,810 / 11,318 | — | 20,385 / **11,741** / **11,272** |

Every timing runs ALL THREE ARMS SIMULTANEOUSLY, one pinned core each, cores rotated per
round, so whatever else the box is doing is common-mode. Corpus loads 6–43, runtime 13–45,
self-compile 8–40. Base: `a94037b0`.

**THE ITALIC CELLS ARE CONTROLS, AND THEY SET THE RESOLUTION.** At arity 15 no arm's window
applies and at arity 3 the hybrid is inline, so those cells duplicate the inline arm's own
code — they read **0.983 / 0.987 / 0.983** on the minimum, so the runtime floor is **±2%**.
Every treated cell sits outside it and the two treated arms AGREE where both fire: arity 5
reads 1.071 / 1.062, arity 8 reads 1.008 / 1.024.

**THE HELPER'S PRICE IS A FIXED CALL, AND IT DECAYS EXACTLY LIKE ONE:** **+10.7% at arity 3,
+6.2% at arity 5, +2.4% at arity 8**, against a ±2% control. **85.0% of the compiler's own
652 chains are arity 5 or below**, which is where the call is worth the most.

**AND THE COMPILE SIDE NEVER FAVOURS IT.** The 2,792-program `--codegen` sweep puts inline
first in ALL FOUR rounds (+0.5% to +1.6% for the helper, +0.4% to +1.7% for the hybrid), and
the one-big-program L2 self-compile is a dead heat (0.997 min / 1.007 med). So the rule's
FIRST term already decides, and the seed-size tie-breaker never applies.

**WHAT THE 121 KB WOULD HAVE BOUGHT, NOW THAT #2451 HAS LANDED.** The warm `.cwasm` path —
what every `vl` in a native step pays since both engine tags are warmed — reads **0.01 s in
both arms**, so seed size is not a cost there at all. The one seed-size-sensitive path is
the cold Cranelift compile, **11.14 → 10.66 s user (−4.3%)**, tracking the −5.93% size, and
#2451 removed ~33 of those per step. In Deno, `new WebAssembly.Module` + `Instance` moves
**4.4 → 4.2 ms**. §A6's "shrinking the seed buys the Rust host's cold path and nothing else"
is unchanged; the cold path is now gone.

**AND THE FAMILY IS A COMPILER-SCALE WIN ONLY.** Its six functions are ~1,669 bytes every
string-using module pays whether or not it holds a 3+ chain — **+88%** on a two-part-concat
module, **+2.6%** on `std/json.vl`, **+6.3%** on `std/fmt.vl` at the DEFAULT rung. Only a
module with hundreds of chain sites earns them back, and the compiler is the only one here.

**AND BINARYEN DOES NOT FOLD THE INLINE COPIES**, so "`-O3` erases the difference" is false:
at `-O3` the helper arm stays 0.2–1.0% smaller. What `wasm-opt` DOES do is delete an unused
family entirely (the chainless module is 196 B in both arms), so the fixed cost above is a
default-rung cost only.

**THE RULE, AS A NUMBER.** A helper window pays only where the fixed call is smaller than
the noise it hides in — measured, that is **arity 8 and above (+2.4%, against a ±2%
control)**, and **only 5.2% of the compiler's chains are there**, worth ~15 KB of a 2.04 MB
seed against ~5.9 KB added to every string-using module without such a chain. Below arity 8
the call costs 6–11% of the chain's own time and the compile-side sweep 1%. So no window
pays, and the unroll stays. The variant that could change this is named and NOT built: mint
the family PER ARITY and only where a chain of that arity exists, from a syntactic pre-scan
in `collectA`. That restores byte-identity for a chainless module and keeps the seed win, at
the cost of a whole-arena pass and a `scan-budget` entry — for a seed saving now worth
≈1 s of CPU a native step.

---

## E · What this survey could NOT measure

* **The 15 s gap in the corpus oracle.** §A4 accounts for 5.9 s of the file's 21.5 s; the
  rest is harness JS the probe does not replicate (module-graph cases, `readDiags`,
  directive assertion). It does not change the conclusion — the file is single-threaded
  either way — but the split is incomplete.
* **The heavy files' internal breakdown.** §A3 gives per-file CPU, not which of
  `vl_buffer_view_bounds_shape`'s 19 cases hold its 51 s, so item #2's estimate is
  "split into 4" arithmetic rather than a measured shard.
* **GitHub's runner directly.** Every CI number comes from the API; the JIT-storm saving
  there is *inferred* from the local 10 s-per-cold-JIT figure times a 4-worker runner.
* **`vl check` under `VL_PROFILE_GUEST`, and any RUNNING program.** The guest profiler
  hooks `compile_vl` only (`main.rs:1629`), so the check path cannot be sampled (§B2
  profiles `vl build`) and D2 is a wall-clock ladder rather than a profile.
* **Whether std's checked form is cacheable at all.** §B1 shows the cost is paid per
  program; it does not establish that a cache is sound across programs (the module table,
  the interner and the arena are per-program state).
* **The exact count of §D3's accumulators.** 129/451 are floors from a regex detector; the
  true figures need the checker's own answer. The per-file *shape* is stable across both
  detectors, which is what the ranking rests on.

---

## F · Landed: items 1–4, 5 and 7, each A/B'd

Every A/B ALTERNATES its arms inside one load window on this shared box (24 cores; the
load is quoted per row because it moved 20 → 160 while these ran), and every row states
its test COUNT — a suite that self-ignores exits 0, and the release split did exactly
that once, before its `import.meta.url` paths were rebased. The BEFORE arm is a pristine
`git archive origin/master` tree beside this one, so both grade the same compiler source
with the same seed. The runner is measured in **§F7** — it was not, when this section was first
written — and it REFUTES item 3's CI estimate while confirming item 1's.

### F1 · Item 1 — the corpus oracle is four files

`tests/cases_wasm_test.ts` → `tests/support/casesWasmOracle.ts` + four
`tests/cases_wasm_<k>_test.ts`, and the ci.yml step gains `--parallel`. Three alternating
pairs, each arm the step as its own job runs it:

| arm | wall | user | load | count |
| --- | ---: | ---: | ---: | --- |
| one file | 46.55 / 25.65 / 25.13 s | 44.97 / 26.68 / 25.73 s | 94 / 55 / 32 | 2688 · 0 · 9 |
| four shards | **17.86 / 11.22 / 10.81** s | 35.92 / 25.95 / **25.05** s | 75 / 44 / 28 | 2688 · 0 · 9 |

**Median wall 25.65 → 11.22 s**, counts identical. The survey predicted +25% user for four
seed loads; at low load it does not appear (25.73 → 25.05 s, within noise), and the +40%
seen on the first pair tracks the load, not the split. Residue: the shards run 6.6 / 5.9 /
1.9 / 1.0 s of summed test time, because `tests/cases/std` is 7.75 s of the corpus's 17.1 s
in 67 of 2,786 cases and is CONTIGUOUS, so no contiguous cut can spread it. A cost-weighted
cut is the next ~5 s. Four and not eight: the per-shard fixed cost is real, and on a 4-core
runner more shards than workers only adds seed loads.

### F2 · Item 2 — two of the three heavy files split, the third measured and left

Per-file A/B, alternating, median of three (load 16 → 111):

| file | before wall / user | after wall / user | tests |
| --- | ---: | ---: | ---: |
| `selfhost_native_release_test.ts` → 4 files | 64.73 s / 63.84 s | **20.92 s** / 51.77 s | 36 = 36 |
| `vl_buffer_view_bounds_shape_test.ts` → 2 files | 18.81 s / 32.93 s | **14.02 s** / 36.34 s | 19 = 19 |

`per-file-time.sh` over both trees back to back (load 156 → 115, so read the RANKING, not
the absolutes): `selfhost_native_release_test.ts` was the #2 file at 63.8 s wall / 59.4 s
user and its four successors are 22.2 / 23.3 / 20.9 / 2.5 s; `vl_buffer_view_bounds_shape`
was #3 at 31.0 s / 51.5 s and is now 16.3 s + 5.2 s. Neither is in the top three any more.

**`vl_check_codegen_test.ts` is NOT split, and the survey's §E gap is why.** 19.00 s of its
19.08 s is ONE test, whose two `vl check --codegen <dir>` sweeps split **45.9 s**
(`tests/cases/std`, 67 files) against **0.79 s** (`tests/cases/soundness`, 194) — so
neither a file split nor concurrent directories moves it (measured: concurrent 34.3 s
against serial 31.8 s). The cost is `vl check` re-checking the std graph once per importing
file, which is §B1's cross-program checked-form cache: a STRUCT item, not this one.

### F3 · Item 3 — both engine tags warmed by the refresh

`parallel-jit-storm.sh`, alternating, load 75 → 89. The `post-refresh` arm is what
`refresh-compiler.sh` left behind before this change — verified, `ls build/*.cwasm` = **1**:

| arm | wall | user CPU |
| --- | ---: | ---: |
| post-refresh (the `vl check` tag cold) | 58.45 / 95.08 s | 647.0 / 715.4 s |
| both tags warm | 42.31 / 46.14 s | **342.7 / 358.5 s** |

Median **681 → 351 s of user CPU per native step, −48%**. `count-vl-spawns.sh` puts the
population at **3,573 `vl` subprocesses** a step (2,880 `check`, 339 `run`, 223 `build`,
97 `fmt`, 18 `test`, 2 `seed`, 14 argv-only) — the survey's 3,567 plus master's new tests —
and at ~10 s of CPU per cold seed compile the saved 330 s is **≈33 redundant Cranelift
compiles of the 1.8 MB seed**, one per worker that started before the first publish. The
refresh now warms both tags concurrently and prints the count it left; `ls build/*.cwasm`
is **2** after it.

### F4 · Item 4 — the sidecar is content-keyed

`build/vl-compiler.wasm.<seed key>.<engine tag>.cwasm`. Behaviour proof: `vl run`,
`vl check` and `vl build` output unchanged and the emitted module byte-identical under the
old and new binaries; only the file NAME moves. The point, measured:
`touch build/vl-compiler.wasm` (identical bytes, new mtime) cost a full **4.43 s** re-JIT
and now costs **0.02 s**. A different seed at the same path retires the old key's files and
the mtime-era name, so `build/` stays at two sidecars.

Price, and it is not zero: the key is read and hashed on EVERY invocation. Byte-at-a-time
FNV-1a — `build.rs`'s spelling — cost **+2 ms** of `load_compiler` (best of 15, 6 → 8 ms),
which over 3,573 spawns is ~7 s of CPU a step and would also land on `regress.py`, whose
grader spawns `vl` per cell. Four-lane word FNV instead: **+0.85 ms** an invocation (200
spawns, user 12.05 → 12.90 ms each; `load_compiler` best of 5 reads 5 → 6 ms). The zero-cost alternative — keep the mtime fast path
and fall back to a content compare — was not taken: it needs a second on-disk file and a
new trust, for the same hit rate.

### F5 · What this PR found and did not fix

`unions/paren-narrowed-receiver-read.vl` fails with `emitProgram: object literal is missing
a union-variant field` when `unions/nullable-variant-positions.vl` runs IMMEDIATELY BEFORE
it on one shared `WebAssembly.Instance`. Both pass alone and in the corpus order; that
two-case sequence is the whole repro. It is a per-instance emitter state leak of D986's and
D1003's class, which `tests/vl_instance_state_leak_test.ts` misses because its ~30 curated
programs do not include the pair — and which the corpus oracle was passing only by ORDER
LUCK, some case between the two happening to reset it. Found by trying `i % n` sharding,
which is why the landed partition is a CONTIGUOUS block: it keeps every case's predecessor
but the `shards - 1` block-first ones.

### F6 · The gate, before and after

`scripts/gate.sh` on each tree, both starting from an idle box and both self-contending
(the gate fans 18 rows out at once, and takes the box to load ~110 by itself). Read the
LAST row: `gate.sh` waits on its rows in order, so every row after the slowest reports the
running maximum, not its own time.

| | seed build | `deno task test` | `ci-native` | slowest row | verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| before (origin/master) | 1833871 bytes | 80.4 s · 3181·0·2977 | 124.1 s · 3059·0·3 | 149.9 s | ALL GATES PASS |
| after (this branch) | 1833871 bytes, 2 sidecars warm | **66.0 s** · 3181·0·2977 | **78.7 s** · 3059·0·3 | **88.8 s** | ALL GATES PASS |

The counts are the test-count equality proof at gate scale: `deno task test`
**3181 passed · 0 failed · 2977 ignored** and `ci-native` **3059 · 0 · 3** on BOTH arms.

Re-run on the MERGED tree after a rebase, where the arms differ only in the HOST binary
and so isolate items 3 + 4: master's `vl` and master's refresh give **148.8 s** (load
119 → 154), this branch's give **86.2 s** (load 95 → 77) — counts **3185 · 0 · 2980** and
**3063 · 0 · 3** on both, and `ls build/*.cwasm` shows the content-keyed pair with the
mtime-era names pruned. Loads differ, so read that pair as corroboration of §F3, not as
its measurement.

### F7 · GitHub's runner, MEASURED — and item 3's CI estimate does not survive it

§E said the runner was never measured and the JIT-storm saving there was *inferred*. It is
measured now, from this PR's own `ci-native` job against six master runs (`ci-steps.sh`):

| step | master, 6 runs (median) | this PR, 3 runs (median) | delta |
| --- | ---: | ---: | ---: |
| corpus oracle | 39·39·40·41·44·44 (40.5) | 18·24·28 (**24**) | **−16 s** |
| native suites | 121·125·129·142·143·147 (135.5) | 103·131·131 (131) | −4 s, inside the spread |
| refresh seed | 9·9·9·15·24·30 (12) | 32·38·39 (**38**) | **+26 s** |
| job total | 197–243 (224.5) | 179·237·244 (237) | +12 s |

**Item 1 lands: the corpus oracle is 40.5 → 24 s median on the real runner** — less than
the −32 s estimate, because four shards on four cores are bounded by the biggest shard
(§F1's 6.6 s of summed test time) plus four seed loads, not by total/4.

**Item 3's "−10 s CI" does NOT reproduce, and on the runner it is net NEGATIVE.** The
native step does not move (131 against 135.5, inside master's own 121–147) while the
refresh pays the seed JIT up front, +26 s. On four cores the storm is ~4 workers deep and
the first publisher serves the rest, so there is little to save; the −330 s of user CPU in
§F3 is a 24-WORKER effect and does not transfer. It is kept because the local win is large
and the cost is now deterministic, but **the follow-up is to background the `check`-tag
warm** so CI stops paying it on the critical path. Two of the three PR runs also paid a
one-off ~21 s of `Build vl-host` (the host source changed); the third, which hit the binary
cache, is the 179 s total — below master's whole range.

### F8 · Items 5 and 7 — both registries answer by sid

`variantIndexOf` over `uVariants` and `unRowOfName`/`isUName` over `unNames` now read a
dense sid-keyed side array (`uVariantRowBySid`, `unRowBySid`), maintained at every write
rather than built at one point: `uVariantsPush` and `unNamesPush` are the only writers, the
indexes are emptied with their tables in `collectU`, and they are dropped in
`sidKeyedTablesReset` because the sid space is re-keyed there. Both tables can hold a
duplicate name, so each index records the FIRST row and the lookups still answer first match
by name. `unionMemberSetOf` and `unionRowOf`'s first leg route through `unRowOfName`.

**The survey's own shares were stale by ~5x, and this section states the measurement rather
than the estimate.** §B2 read `variantIndexOf` 3.45% self / 7.06% incl and `unRowOfName`
3.35% / 6.23%; re-run on master b9ed79e3 (the profile and the CPU rows below are that base;
identity was re-proved at c8a99305b after the last rebase) with the same instrument
(`scripts/profile-rank.py`, a `--names` seed, six aggregated runs of
`vl build compiler/entry.vl` over one source tree, 32–34k samples per arm) they are a fifth
of that BEFORE the change:

| function | master self / incl | after self / incl |
| --- | ---: | ---: |
| `variantIndexOf` | 0.73% / 1.72% | **0.04% / 0.32%** |
| `unRowOfName` | 0.70% / 1.33% | **0.01% / 0.26%** |
| `isUName` | 0.02% / 1.36% | 0.02% / 0.31% |
| `unionMemberSetOf` | 0.01% / 0.10% | 0.01% / 0.09% |
| `__str_eq__` | 21.36% / 21.36% | 19.95% / 19.95% |
| `sidArrGet` + `sidLookup` + `__map_probe__` + `__str_hash__`, the work bought back | 3.12% self | 3.60% self |

So the two scans were **1.43% of self time and shed 1.38 of it**, paying ~0.48 points of
hashing and probing for it. The L2 self-compile, both seeds compiling the SAME master source,
interleaved A-then-B, 11 reps at load 6–10: **min 5.23 s → 5.09 s of CPU (−2.8%)**, median
5.31 → 5.17 (−2.6%) — min and median agreeing is the tell that it is the effect and not the
box. Runs taken while the load swung past 100 cannot separate the arms at all, which is what a
3% effect looks like here. Either way it is **smaller than the survey's 3.6% + 2.9% estimate,
and the estimate is what was wrong** — the compiler's own source declares few unions.

Where the change is large is the axis it was priced on. `unions` in
`tests/vl_scaling_shape_test.ts` (800 unions against 40), five interleaved rounds on
c8a99305b at load 27–32:

| arm | many | one | graded ratio |
| --- | --- | --- | --- |
| master | 0.60 / 0.59 / 0.58 / 0.59 / 0.60 s | 0.17 s | 2.39 2.36 2.34 2.36 2.41 |
| after | 0.46 / 0.46 / 0.45 / 0.45 / 0.45 s | 0.17 s | **1.84 1.84 1.80 1.78 1.78** |

The many arm falls **24%** (0.59 → 0.45 s) and the one arm does not move at all, which is the
per-union cost being what left. At load 83–97 the same pair reads master 2.39–2.87 against
after 1.76–2.18, and at load 143–152 master 3.48–3.93 against after 2.47–2.83: the fall holds
and the SPREAD is what load buys. The `one` arm sits under the pair's 0.25 s floor at these
loads, so the graded quotient is `many / 0.25`; at #2584's load 79–227 the denominator clears
the floor and the raw ratio grades. Both readings fall by about a quarter.

**The bar goes 5.5 → 4.0, and the flake risk was measured rather than argued.** 4.0 is 2.22x
the after-median of 1.80 — the ~2x over the idle ratio the other three super-linear axes
carry, and the clearance `callback slots` keeps over its own 1.92. Run eight times at the new
bar with a `gate.sh` fanned out beside it (load 103–115) the pair reads 2.17–2.83 and passes
8 of 8; master reads 3.07–3.54 at load 86–92 and passes 6 of 6, so a revert would sit close to
the bar, which is what a ratchet is for. The one reading above 4.0 seen anywhere was a single
5.25 at load 70 with `many` at 1.31 s — above the new bar, so the pair's own per-side
re-measure absorbs it, which is exactly the case a bar set AT the measurement would not have.

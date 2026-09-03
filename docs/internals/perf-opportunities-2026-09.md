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
| 1 | Shard `tests/cases_wasm_test.ts` — one file, so one core, 44 s | **−32 s** | S | none | same `2684 passed / 9 ignored`; shards partition the name space; `ci_seed_coverage_test.ts` updated | QUICK |
| 2 | Split the 3 heaviest ci-native files (§A3): `--parallel` is one worker per FILE, so the step's wall floor is the slowest file, 39.6 s | **−20…30 s** | S | none | per-file wall (`per-file-time.sh`) drops below the step's CPU/cores floor; case count unchanged | QUICK |
| 3 | Warm BOTH `.cwasm` engine tags in `refresh-compiler.sh` — it carries forward only the one its own `vl run` made | **−10 s** CI; **−280 s CPU** locally, 45% of the step | S | low | `ls build/*.cwasm` = 2 after a refresh; A/B the step's user CPU with `parallel-jit-storm.sh` | QUICK |
| 4 | Content-key the sidecar (`seed-<key>-<tag>.cwasm`, as the EMBEDDED path already does) instead of mtime | folds in #3; CI's seed cache survives a byte-identical rebuild | S | low | a rewritten byte-identical seed keeps `load_compiler` at 5 ms | QUICK |
| 5 | `variantIndexOf` → sid-keyed index: 76 call sites, 13/13 in `wasmEmit.vl` per-expression, table FROZEN after `collectU` | **3.6%** of self-compile self time, 7.1% incl | M | union member-set ABI (never dedupe) | byte-identical seed; `regress.py`; `rep-fuzz-check.sh`; the unions scaling axis | STRUCT |
| 6 | String `+` in a loop is **O(n²)** (§D): a loop-local builder, with n-ary chain fusion as the down payment. The fusion once shipped in the TS core and was never ported | ×4.80 per doubling; 5.4× at 320 KB; ≥129 in-loop sites | M / L | rep layer | corpus byte-identity where the pattern is absent; a scaling pair "append N" vs "join N", ratio bar 2.5 — **a value fixture cannot pin a cost class** | STRUCT |
| 7 | `unRowOfName`/`isUName` → incrementally maintained sid index (3 push sites, one POST-collect) | **2.9%** self time; 824,867 reaches/corpus | M | index must extend at all 3 pushes | byte-identical seed; `regress.py`; the unions axis | STRUCT |
| 8 | `vl check` is super-linear in CALL SITES: 8× the sites costs **22.9×**, exponent 1.51 | user-visible on big files and in the LSP | M | — | a 4-rung absolute ladder with an exponent bar (`check-scaling.sh`) | STRUCT |
| 9 | LSP re-checks the WHOLE module graph per keystroke — 26 modules = **4.43 s** | editor latency, not CI | M | — | a keystroke ladder at 1 / 4 / 26 modules | STRUCT |
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
| `variantIndexOf` `emit_classify.vl:28618` | `uVariants: string[]` `emit_state.vl:1815` | string, `__str_eq__`; bound is the whole-program variant band | **76** (47 `emit_classify`, 13 `wasmEmit` — all per-expression, 13 `emit_collect`, 2 `emit_mono`) | **YES** — 2 pushes, both in `collectU`, 0 in-place writes | index built once at `emit_collect.vl:13449`. **Best payoff/risk in the tree.** |
| `unRowOfName` `:28732` (`isUName` `:28741`) | `unNames: string[]` `emit_state.vl:1716`, 2,389–2,441 rows | string, `__str_eq__` | 16 + 4 | append-only but **NOT frozen** — a 3rd push at `emit_classify.vl:26992` fires during mono/emit | `sidArr*` extended at all 3 pushes |
| `declaredSlotOf` `:9560` | `localNames: string[]` `emit_state.vl:522`, per FUNCTION | string, `__str_eq__` | 17 | rebuilt per function, 5 reset sites | index in `buildLocals`; cost is reach count, not table size |
| `fnStmtsPosOf` `:16931` | `fnStmts: i32[]` `emit_state.vl:231` + `monoOrigNode` | **i32**, integer `==` | 24, of which 14 in per-node loops | append + 1 write `emit_mono.vl:6353`, all before `emitCodeSection` | reverse index after mono. Already short-circuits 80.3%; residue **19,106 calls / 25,953,420 scan steps** (`perf-program.md:1192`) |
| `modIndexOfKey` `driver.vl:2846` | `modKeys: string[]` `driver.vl:421`, tens of rows | string, `__str_eq__` | 8; `:2859` sits inside `while i < impKey.length` → **O(imports × modules)** | **YES**, strictly append-only | trivial, but smallest N and lowest payoff |
| `capHas` `emit_base.vl:199` | **a `string[]` PARAMETER**, not a registry | string, `__str_eq__` | 22 | 12 sites grow-while-scanning locals; 10 are driver globals | per-site only; no shared index possible |

**`tyTopIndexOf` is not in this family.** `compiler/tyname.vl:439` is a per-CHARACTER
bracket-depth walk over a type-name *string*: the key is an i32 char code compared with
`==`, there is no table, and `grep -c tyTopIndexOf compiler/emit_collect.vl` is **0**, so
`collectA` never calls it. Its 4.94% is **type names being re-parsed as text**, and the fix
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

### D6 · Measured after A (n-ary concat, 2026-09-03)

| | before | after |
| --- | ---: | ---: |
| `call $__str_concat__` sites in the emitted compiler | 2,643 | 529 |
| inline `array.copy` sites in it | 2,366 | 5,145 |
| `__str_concat__` self% of a self-compile (`VL_PROFILE_GUEST`) | 0.69% | 0.48% |
| seed bytes | 1,832,652 | 1,968,294 |

665 chains fused (the two deltas solve for chain count and mean arity 4.18), so **2,114
pairwise concat calls are gone** and with them their allocations: a k-part chain allocated
k-1 exact-fit backings and copied its prefix k-1 times, and now allocates once. D3's
regex floor (451 explicit 3+ chains) undercounts because interpolation is desugared in the
parser and never reads as a `+` chain in source. `tests/cases` byte-identity: 2,191 of
2,790 identical, 98 differ (every one carries a chain), 501 refuse under both seeds.

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

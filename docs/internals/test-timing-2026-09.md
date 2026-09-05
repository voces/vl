# Per-test timing — a measured survey, 2026-09-05

Pinned to `ca9645cc1` (this branch's merge base) and to CI runs
[33978534356](https://github.com/voces/vl/actions/runs/33978534356) (run A),
[33978167889](https://github.com/voces/vl/actions/runs/33978167889) (run B) and
[33977496283](https://github.com/voces/vl/actions/runs/33977496283) (run C), all
successful master pushes. Local numbers are from a 24-core box shared with other agents;
every one names the load it was taken at, and **a local wall-clock figure is a minimum of
several runs** — see "One pass is not a reading".

The question this answers: *"There are still quite a few individual tests that take >100 ms
… 100 ms seems long for headless language testing. Can tests be improved?"*

**The short answer is that the 100 ms threshold, applied to CI's per-test output, does not
select improvable tests.** It selects tests that were running while the runner was busy.
The suite's real cost is concentrated somewhere else, and one genuine compiler-side finding
falls out of the same data (§6).

---

## 1 · What CI actually reports

Deno prints a wall time per test. `--parallel` gives one worker per FILE, so in a step that
saturates the box that wall is the SCHEDULE, not the test. Two quantisation notes before any
number below is read: Deno **rounds at one second** (`(1s)`, `(30s)`), so everything at or
above 1000 ms is whole seconds and spreads inside that band are unreadable; and `ignored`
tests report `(0ms)` and are excluded throughout.

Run A, all three jobs, `ok` tests only — 6,716 tests, 301.4 s of summed per-test time:

| band (ms) | tests | sum (ms) | share of per-test time |
| --- | ---: | ---: | ---: |
| [0, 100) | 6,435 | 62,304 | 20.7% |
| [100, 500) | 178 | 35,963 | 11.9% |
| [500, 2000) | 75 | 60,110 | 19.9% |
| [2000, ∞) | 28 | 143,000 | 47.4% |

**281 of 6,716 tests (4.2%) are ≥ 100 ms, and they hold 239 s — 79.3% of the summed
per-test time.** By step:

| job | step | wall | tests | per-test sum | ≥100 ms | their sum |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ci | Test (.vl corpus) | 5.1 s | 278 | 4.6 s | 7 | 4.3 s |
| ci-native | **Native binary suites** | **91.7 s** | 3,277 | 273.1 s | 261 | 229.3 s |
| ci-native | Corpus oracle (4 shards) | 7.0 s | 2,870 | 17.3 s | 10 | 2.5 s |
| ci-native | Editor features (serial) | 8.9 s | 291 | 6.4 s | 3 | 2.9 s |

Everything that matters is the **Native binary suites** step: 91.7 s of a 155.9 s job, and
the job is CI's critical path.

### Variance

Runs A/B/C are three consecutive master pushes. Per-test spreads across them run from 0% to
over 400% for sub-second tests; the step wall moved 91.7 s → 68.5 s between A and B, **a 25%
swing with no code change between them that touches the suites**. Anything below ~2× on a
single CI reading is noise.

---

## 2 · One pass is not a reading

Before any of the numbers below were trusted, this bit twice.

A single timing pass over the corpus on this shared box reported
`tests/cases/arrays/leading-comma-illegal.vl` at **1,732 ms for a 10-line program** — a
150× outlier, and three such at the top of the list. Re-timed as a **minimum of five**, the
same case is **11 ms**. All three phantoms evaporated. Every local wall figure in this
document is a minimum over repeats, and the corpus sweeps are minimum-of-3.

The same rule applies to the sizes: `tests/cases/literals/long-literal-chunked.vl` is 30
LINES and 53 KB. **Lines are the wrong denominator for a compile rate**; bytes are used
throughout §6.

---

## 3 · Conditions — where a per-test number means something

The ci-native file set was run in four conditions on 2026-09-05. `alone` is one file at a
time, serially; the others are the CI command verbatim.

| condition | what it is | step wall | median per-test ratio to `alone` |
| --- | --- | ---: | ---: |
| `alone` | one file, serial, 24 cores | 187 s (sum) | 1.00 |
| `local-parallel` | `--parallel`, 24 cores, load 74–123 | 30.3 s | 1.53 |
| `local-4core` | `--parallel`, **pinned to 4 CPUs** | 98.9 s | 1.41 |
| `ci` | GitHub `ubuntu-latest` | 91.7 s | 3.64 |

**`local-4core` reproduces CI to within 8%** (98.9 s against 91.7 s), which is what
identifies the runner as a 4-core box and lets a local A/B stand in for a CI one.

And this is the load-bearing result:

| file | `alone` | `local-4core` | `ci` | ci ÷ alone |
| --- | ---: | ---: | ---: | ---: |
| `selfhost_native_diag_code_test.ts`, ≥100 ms subset | — | 2,785 ms | 7,997 ms | — |
| its 16 tests, each | 11–38 ms | 107–339 ms | 171–938 ms | up to **43×** |
| **its whole-file cost** | **0.58 CPU-s** | — | — | — |

Pinned to 4 CPUs the ratio collapses from 16× to 2.9×, in line with every other file. **The
"CI-specific" cost was core count and contention, not any mechanism inside the test.** A
plausible mechanism was tested and refuted on the way: `new WebAssembly.Module` over the
2.1 MB seed costs 5.0–5.6 ms at 24 cores and only 7.1–9.9 ms pinned to 2, so V8's parallel
wasm compilation is not what collapses on a small runner.

In the reference condition the picture is much smaller: **149 of 3,350 tests (4.4%) are
≥ 100 ms**, p90 is 21 ms and p95 is 73 ms.

---

## 4 · Where the work actually is

Wall time in a saturated step is a schedule. CPU seconds are not. Each file run alone,
whole process tree (`deno` plus every `vl`, `python3` and `wasm-opt` it spawns):

| file | CPU s | share |
| --- | ---: | ---: |
| `selfhost_native_align_test.ts` | **150.6** | 38.1% |
| `vl_buffer_view_bounds_shape_test.ts` | 45.4 | 11.5% |
| `selfhost_native_release_shape_test.ts` | 44.2 | 11.2% |
| `selfhost_native_release_melt_test.ts` | 18.4 | 4.7% |
| `vl_buffer_view_bounds_contract_test.ts` | 18.4 | 4.6% |
| `selfhost_native_release_loops_test.ts` | 15.8 | 4.0% |
| `vl_scaling_shape_test.ts` | 13.0 | 3.3% |
| `selfhost_native_opt_test.ts` | 6.8 | 1.7% |
| everything else (107 files) | 83.0 | 21.0% |
| **total** | **395.6** | |

**396 CPU-seconds on a 4-core runner is a 99 s floor, and the step takes 91.7 s.** The step
is CPU-bound and already running at essentially perfect 4-way efficiency. There is no
scheduling slack to reclaim — the only lever is doing less work.

### 4a · 153 CPU-seconds of that runs in no CI job at all

`selfhost_native_opt`, the four `selfhost_native_release_*` files and the two
`vl_buffer_view_bounds_*` files gate on `wasm-opt`/`wasm-dis`, which live in
`node_modules/.bin`. The `ci` job installs node deps but has no seed; `ci-native` has the
seed but deliberately runs no `npm ci`. So both gates fail and both jobs skip them. From
run A's log, in the ci-native step:

```
[native-opt] skipped — missing wasm-opt (run npm ci). Build:
[native-release] skipped — missing wasm-opt/wasm-dis (run npm ci). Build:
```

That is **~153 CPU-seconds of local test work, and the whole `vl build -O3` release
profile, gated by nothing in CI.** Checked against all five workflows, not just `ci.yml`:
`publish-seed.yml` runs the same two suite commands on every master push and also declares
no `setup-node` and no `npm ci`, so it skips them for the same reason; `fuzz-nightly.yml`,
`release.yml` and `pages.yml` do not run the suites at all. It is a coverage hole, not a
timing win, and closing it would ADD ~38 s to the runner rather than save any — which is why
this document reports it and changes nothing. See "Unsure / called out" in the PR.

---

## 5 · The ≥ 100 ms population, classified by cause

Read from each test's code. Causes as briefed: (a) spawns the native binary per case;
(b) instantiates/compiles the seed per test; (c) compiles or checks a large program;
(d) a deliberate instrument; (e) a serial loop that could share one setup; (f) waits;
(g) other.

| file | ci ≥100 ms | cause | note |
| --- | ---: | --- | --- |
| `vl_scaling_shape_test.ts` | 40.3 s | **(d)** | grades a TIME RATIO; exempt, now tagged |
| `selfhost_native_align_test.ts` | 36.1 s | **(a)+(c)** | one `vl check` per case, ~2,989 spawns; §5a |
| `selfhost_native_diag_pos_test.ts` | 16.7 s | (a) | multi-module fixtures, one spawn each |
| `vl_test_runner_test.ts` | 14.8 s | (a)+(d) | its parallel-SCHEDULE test is an instrument |
| `vl_capability_matrix_test.ts` | 12.3 s | (d) | runs `matrix.py` over 26 positions × 2 faces |
| `selfhost_native_gc_test.ts` | 11.0 s | (a) | one spawn per collector per case |
| `vl_check_codegen_test.ts` | 9.2 s | (c) | one test sweeps the whole corpus |
| `selfhost_native_diag_code_test.ts` | 8.0 s | **(b)** | fixed here; §5b |
| `vl_std_json_test.ts` | 8.0 s | (a)+(c) | generates a VL program, `vl run`s it |
| `vl_comment_budget_test.ts` | 7.2 s | (g) | re-runs a ratchet CI runs as its own step |
| `vl_kind_ladder_test.ts` | 5.0 s | (g) | same |
| `vl_sentinel_index_test.ts` | 5.0 s | (g) | same |
| `vl_fmt_test.ts` | 3.2 s | (a) | 21 tests, one `vl fmt` spawn each |
| `vl_print_color_test.ts` | 1.5 s | (a) | each tty row spawns `script -qec` + `vl` |
| `vl_std_fs_*_test.ts` | 5.3 s | (c) | 4 MiB fixture is only 11 ms; the rest is the compile |
| the `-O3` suites | 0 s on CI | (a) | see §4a — they do not run there |

Two classifications were tested and came out **negative**, which is why they are not fixes:

* **(e) is not present at the `vl_std_fs_*` files.** The 4 MiB fixture each test builds
  costs `fill=3.8–7.8 ms, write=3.3–6.9 ms` — about 11 ms. Their 200–266 ms per test is the
  compiler compiling and running the generated program. Sharing the fixture would buy ~55 ms
  across six tests and is not worth the churn.
* **(f) does not occur.** No test in the suite sleeps or polls.

### 5a · `align`'s spawn floor, and why it was not batched

The measured floor of a `vl` invocation with a warm `.cwasm` sidecar:

| invocation | min of 9 |
| --- | ---: |
| `vl --help` (host only, no seed) | 1 ms |
| `vl check` / `vl fmt --check`, 1-line program | 11 ms |
| `vl run`, 1-line program | 13 ms |
| `vl run`, program importing `std:fmt` | 39 ms |

Over the whole corpus that floor dominates. Min-of-3 `vl build` over all 2,989 cases is
42.7 s, of which **32.9 s (77%) is the floor** and 10.1 s is compilation. The run/trap tiers
already avoid it — `vl run --batch` waves were built for exactly this — but the `vl check`
leg is one spawn per case.

Batching it is worth **13.3×**, measured on `tests/cases/maps`: 236 files cost 4,477 ms as
236 spawns and **337 ms as one `vl check <dir> --json`** (18 ms/file against 1 ms/file).

**It was not done, for two reasons that are assertion-preserving blockers, not effort.**
`align` classifies each refusal by STAGE, parsed from stderr's `(parse|type|emit) error` —
and `vl check --json` carries `file`, `severity`, `code`, `line`, `col`, `message` and **no
stage**. And a directory walk checks every `.vl` under it as its own entry, including the
module PARTS that `tiersOf` deliberately excludes. Batching today would weaken the suite.
The prerequisite is a stage field in the JSON diagnostic; filed as such in the PR.

(The comment in `selfhost_native_align_test.ts` saying "`vl check` takes one path" is now
inaccurate — a directory is accepted. The per-case verdict is the real reason.)

### 5b · The one mechanical fix applied: one compiled Module per file

Six files compiled the 2.1 MB seed into a fresh `WebAssembly.Module` **per test**. Compiling
is the expensive half and a `Module` is immutable, so it is hoisted to module scope while
each test keeps its own fresh `Instance` — the split `tests/support/sharedInstance.ts`
already documents. Minimum of 5 runs, each file alone:

| file | seed compiles removed | CPU before | CPU after | wall before | wall after |
| --- | ---: | ---: | ---: | ---: | ---: |
| `selfhost_native_diag_code_test.ts` | 15 | 0.61 s | **0.23 s** | 488 ms | 189 ms |
| `playground_lsp_wasm_test.ts` | 15 | 0.67 s | **0.27 s** | 617 ms | 253 ms |
| `playground_completion_test.ts` | 6 | 0.31 s | **0.16 s** | 279 ms | 144 ms |
| `vl_checker_program_isolation_test.ts` | 2 | 0.33 s | **0.24 s** | 276 ms | 159 ms |
| `lsp_prepared_memo_wasm_test.ts` | 2 | 0.70 s | **0.57 s** | 540 ms | 373 ms |
| **total** | **40** | **2.62 s** | **1.47 s** | 2,200 ms | 1,118 ms |

**1.78× on those files, −1.15 CPU-seconds.** `lsp_module_cache_wasm_test.ts` has one such
site inside a single test, so it repeats nothing and was left alone.

Re-read from CI's own logs — run A against this branch's run
[33982630182](https://github.com/voces/vl/actions/runs/33982630182), ci-native job only
(the `ci` job has no seed), same test counts throughout:

| file | before | after | ratio | tests |
| --- | ---: | ---: | ---: | ---: |
| `selfhost_native_diag_code_test.ts` | 7,998 ms | 237 ms | 33.7× | 20 → 20 |
| `playground_lsp_wasm_test.ts` | 285 ms | 74 ms | 3.9× | 19 → 19 |
| `playground_completion_test.ts` | 106 ms | 25 ms | 4.2× | 7 → 7 |
| `vl_checker_program_isolation_test.ts` | 342 ms | 197 ms | 1.7× | 1 → 1 |
| `lsp_prepared_memo_wasm_test.ts` | 237 ms | 163 ms | 1.5× | 11 → 11 |
| **total** | **8,969 ms** | **696 ms** | **12.9×** | |

**Believe the 1.78×, not the 12.9×.** The CI figure is two different runners on two
different days, and diag_code's "before" is exactly the contention-inflated reading this
whole document is about — which is why the ratio there reads 33.7× against a local CPU
measurement of 2.65×. The CI table is included because the brief asked for after-numbers
from CI, and it is worth reading as one more instance of §3 rather than as the size of the
win.

**The freshness control is DEAD, and that is worth recording.** Sharing the INSTANCE too —
one instance for the whole of `selfhost_native_diag_code_test.ts` — leaves all 20 tests
passing, because isolation there comes from the `modReset()`/`srcReset()` each `check()`
does, not from a new store. The fresh instance is kept anyway: it costs 2–3 ms, and it is
the cheap standing guard against the leak class `tests/vl_instance_state_leak_test.ts`
exists for. What the change is graded on instead is that each file's own assertions still
bite — one assertion broken per file, all five failing, listed in the PR body.

---

## 6 · What the timings say about the COMPILER

The owner's addendum: these may point at vl perf issues. They do, and the instrument is the
corpus rather than the test files, because the corpus is 2,989 programs with sizes attached.

Baseline rate, from `scripts/self-compile-baseline.json` over `compiler/*.vl`:
**6.3 CPU-seconds for 5,902,133 bytes = 1.067 µs/byte.**

Over the whole corpus at `vl build` (min of 3), the work left after subtracting the 11 ms
floor is 10.5 s over 5.65 MB = **1.87 µs/byte, 1.7× baseline** — that is, the corpus as a
whole compiles at about the rate the compiler compiles itself. Restricted to cases ≥ 1 KB
(so the rate is not dominated by per-program fixed costs) three stand clear of the rest:

| case | ms (min of 3) | bytes | µs/byte | × baseline |
| --- | ---: | ---: | ---: | ---: |
| `unions/arm-list-elem-pin-at-depth.vl` | 290 | 2,981 | 93.6 | **88×** |
| `globals/global-reference-chain-cost.vl` | 166 | 2,130 | 72.8 | 68× |
| `std/json-deep-is-parse-result.vl` | 135 | 1,816 | 68.3 | 64× |
| — gap — | | | | |
| `literal-unions/litunion-order-cross-module-alias.vl` | 69 | 1,575 | 36.8 | 35× |

`global-reference-chain-cost.vl` is a **deliberate cost fixture** for D1513 and says so in
its own header, so it is not a new finding. `json-deep-is-parse-result.vl` pulls `std:json`,
which is a fixed cost. That leaves one.

### The finding: `nameIsArray` asks for a COUNT when it needs a PREDICATE

Profiled with `VL_PROFILE_GUEST` against a `--names` seed, ranked by SELF time
(`scripts/profile-rank.py`):

| frame | `arm-list-elem-pin-at-depth` (330 samples) | `global-reference-chain-cost` (166) | control: `deep-is-json-shape-walk` (198) |
| --- | ---: | ---: | ---: |
| `tyTopIndexOf` self | **61.52%** | **28.31%** | 11.11% |
| `unionMemberCount` incl | 55.45% | 27.11% | — |
| `nameIsArray` incl | 56.36% | — | — |
| `__str_eq__` self | 6.06% | 7.83% | 12.12% |

The same term tops both outliers and sits well below that in the control, so it is a
family and not one case's quirk. (Re-taken after #2630 landed an emitter index: the
outlier's share ROSE 59.2 → 61.5% as a competing scan left, and the control's fell
18.0 → 11.1%, which sharpens the contrast rather than moving the finding.) The mechanism, in `compiler/tyname.vl`:

```
export function nameIsArray(name: string) {
  ...                                  // a two-character suffix test, O(1)
  unionMemberCount(name) < 2           // then a WHOLE-STRING walk, to learn "< 2"
}
```

`unionMemberCount` loops `tyTopIndexOf` — a per-character bracket walk — to the end of the
string counting every top-level `|`, when `nameIsArray` only needs to know whether there is
one. For a name with k top-level members that is k+1 walks of the remainder. `nameIsArray`
then gets called once per element and per nesting level from `arrElemIsArrayOf`,
`arrElemNameRaw` and `nameIsClosureArray`, so a deeply nested `{r: i32}[][][][]` re-walks
the same string at every level.

**Surface: 79 `nameIsArray` call sites across 8 modules, and 10 of the 23 `unionMemberCount`
call sites compare the count only against 1 or 2** (`> 1`, `< 2`, `>= 2`) — every one of
those wants a predicate. The shape is the one the addendum names: a per-entity re-derivation
of a whole-value fact.

This is filed as a QUICK item in `perf-opportunities-2026-09.md` §0 row 13. It is
deliberately NOT fixed here. Note that §0 row 12 already carries `tyTopIndexOf` at 4.94%
self on a self-compile as part of the destringify track (kind STRUCT, risk L); the finding
here is that on type-heavy programs the same frame is 28–62%, and that an early-out
predicate reaches most of it without the destringify design question.

---

## 7 · Thresholds, and the script that grades them

`scripts/test-timing.py` parses a CI log (`gh run view <id> --log`) or a local
`deno test` capture, applies a per-purpose budget, and prints the distribution and the
offenders. Purposes are declared by the test FILE in a `// @test-timing` line:

```
// @test-timing native
// @test-timing sweep n=2328 name~"native-align setup"
```

A tag with no `name~` sets the file's purpose; one WITH `name~"substring"` applies to
matching test names only — so a file that is ordinary except for one instrument test says
exactly that instead of exempting itself wholesale. **70 files carry a tag** — and note that
`grep -l` finds only 69 of them, because `tests/vl_std_base64_test.ts` holds four NUL bytes
as a decode test vector, so `grep` and `git diff` both treat that file as BINARY. That is
pre-existing on master and has nothing to do with timing, but it does mean a reviewer cannot
see that file's diff.

| purpose | budget | derived from |
| --- | ---: | --- |
| `unit` | 50 ms | in-process on a seed instance the file holds. p90 of the whole suite is 21 ms, p95 73 ms |
| `native` | 300 ms | one `vl` spawn is 11 ms (39 ms with std); 300 ms allows a handful plus a real program |
| `opt` | 1200 ms | a `-O3` arm is 40 ms build + 155 ms `wasm-dis`; a shape test compares three arms |
| `sweep` | exempt per test | one test adjudicates N items; must declare `n=`, graded on ms-per-item (30 ms/item) |
| `instrument` | exempt | the runtime IS the measurement |

**A budget is meaningless without its condition**, so `--condition` names one and divides by
the measured factor from §3 (`alone` 1.0, `local-parallel` 1.5, `local-4core` 1.4, `ci` 3.6
— medians, not aggregates: one 30 s fixture skews the aggregate by 13%). CI logs are
detected automatically; local logs default to `local-parallel`, the cheaper mistake, because
under-dividing reports a test rather than hiding it.

At `--condition alone` on the reference log, 70 files declare a purpose and the script
reports **38 offenders** and three `sweep` files over the per-item bar
(`vl_sentinel_index` 47.7, `vl_kind_ladder` 46.8, `vl_comment_budget` 40.9 ms/item over
30 compiler modules — all three re-run a whole-tree ratchet that CI also runs as its own
step).

**Should it be a ratchet?** Not yet, and the reason is in §1 and §3: the input a ratchet
would read is a CI log whose step wall moved 25% between two consecutive green master
pushes with no relevant change. A per-file ratchet on that signal would flap. The repo's
five ratchets (`scripts/ratchet.py`) all read a FILE SCAN, which is deterministic. The
honest baseline this could ratchet on is the §4 table — per-file CPU seconds, measured
alone — and producing it costs 187 s, far outside the ~90 s gate budget. The recommendation
is to keep this a reporting tool run when the job's wall clock moves, and if a ratchet is
ever wanted, to ratchet **per-file CPU seconds** rather than per-test wall.

---

## 8 · Reproducing

```sh
gh run view 33978534356 --log > /tmp/ci.log
python3 scripts/test-timing.py /tmp/ci.log                   # CI, auto-detected
python3 scripts/test-timing.py --dist /tmp/ci.log            # distribution only

# the reference condition: each file alone, serially
for f in tests/selfhost_native_*_test.ts tests/vl_*_test.ts; do
  SELFHOST_NATIVE_ALIGN=1 VL_STD=$PWD/std deno test -A --no-check "$f"
done > /tmp/alone.log 2>&1
python3 scripts/test-timing.py --condition alone /tmp/alone.log

# the CI runner, reproduced to within 8%
taskset -c 0-3 deno test -A --no-check --parallel \
  tests/selfhost_native_*_test.ts tests/vl_*_test.ts
```

`VL_STD` is not optional from a worktree (CLAUDE.md, "`vl` resolves `std:` from the EXE's
checkout"), and `python3` must be `/usr/bin/python3` on this box.

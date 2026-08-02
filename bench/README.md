# VL cross-runtime benchmark suite

Places VL in the performance landscape against three runtimes chosen to **bracket** it, and
finds every place VL is slower than it should be.

| runtime | role | what a gap means |
|---|---|---|
| **Rust** (rustc 1.96, `-O`) | the native ceiling | the ratio is VL's **headroom**, not a loss. 2-3x off native is respectable for WasmGC; **10x+ is a finding** |
| **deno / V8** (2.9) | the closest peer — a JIT'd *dynamic* language | VL is statically typed and AOT-compiled. **VL losing to JS is a defect** |
| **Python 3.11** | the interpreter floor | VL should win by a wide margin. **Under 5x faster is a RED ALERT** |
| **VL** | the subject | idiomatic spelling first; a hand-optimized variant only where the idiom measured slow |

> The project's explicit goal is that **users must not need hacks to get good performance.**
> A gap between the idiomatic VL spelling (`main.vl`) and a contorted fast one (`opt.vl`,
> `toplevel.vl`, `globals.vl`, ...) is a **DEFECT to file, never a tip to recommend.**
> The harness surfaces those as `IDIOM-GAP-<n>x` flags and a dedicated table.

---

## Layout

```
bench/
  run.sh                     the harness (this is the only executable; owns results/)
  README.md                  this file
  results/
    results.json             one record per benchmark per configuration
    summary.md               the human table
    raw.ndjson               every individual measurement, unaggregated
  <category>/<name>/
    main.vl main.rs main.js main.py    the four idiomatic versions
    opt.vl | toplevel.vl | globals.vl | ...   OPTIONAL extra VL spellings
    meta.json                {"name","category","axis","n","nPython","expect",...}
```

`meta.json` keys the harness reads:

| key | meaning |
|---|---|
| `expect` | exact stdout every full-N runtime must produce |
| `expectPython` | exact stdout for the reduced-N Python run (falls back to `expect`) |
| `expect<Variant>` | exact stdout for `<variant>.vl`, e.g. `expectOpt` for `opt.vl` (falls back to `expect`) |
| `void` | a non-empty string **excludes** the benchmark from the sweep; the string is the reason and is reproduced verbatim in `summary.md` |
| `axis` | one-line description of what is being measured |

## Running it

```sh
bench/run.sh                          # full sweep, 5 reps
BENCH_REPS=7 bench/run.sh             # more reps
BENCH_FILTER='arith/' bench/run.sh    # ERE over "<category>/<name>"
BENCH_QUICK=1 bench/run.sh            # 1 rep smoke test
BENCH_PIN=none bench/run.sh           # disable taskset pinning
BENCH_REPORT_ONLY=1 bench/run.sh      # rebuild results.json/summary.md from raw.ndjson,
                                      #   measuring nothing (for report changes)
```

| env | default | meaning |
|---|---|---|
| `BENCH_REPS` | 5 | timed runs per configuration |
| `BENCH_PIN` | `2-5` | `taskset -c` cpu list, or `none` |
| `BENCH_FILTER` | *(all)* | ERE matched against `<category>/<name>` |
| `BENCH_SKIP` | *(none)* | space-separated `<category>/<name>` list to skip |
| `BENCH_WORK` | `/tmp/vl-bench-work` | build artifacts (kept out of the repo) |
| `BENCH_OUT` | `bench/results` | output dir |
| `BENCH_TIMEOUT` | 300 | per-run wall clock cap, seconds |
| `BENCH_NOISE` | `arith/i32-accum` | benchmark used for the noise-floor repeat probe |
| `BENCH_REPORT_ONLY` | 0 | regenerate the report from an existing `raw.ndjson`, measure nothing |

The harness is **idempotent and cleanly re-runnable**: it rebuilds everything from source into
`BENCH_WORK` and rewrites `bench/results/` in place. Nothing outside `bench/run.sh`,
`bench/README.md` and `bench/results/` is written.

---

## Measurement protocol

**1. VL execution never contains compile time.** `vl run <file.vl>` compiles *and* runs in one
process (measured at 10-390ms of compile). Every VL execution number here comes from
`vl run <prebuilt.wasm>`; `vl build` time is a **separate column** in `summary.md`.

**2. `-O3` is verified to be real.** `vl build -O3` shells out to `wasm-opt`; when it cannot find
one it prints a note to stderr and **writes the unoptimized module anyway**. The harness exports
`VL_WASM_OPT=node_modules/binaryen/bin/wasm-opt`, and additionally `cmp`s the `-O3` module against
the `-O0` module — a byte-identical pair raises an `O3-NOOP` flag so the column can never silently
measure `-O0`. (This was a live bug in the first draft of the harness: without `VL_WASM_OPT`
every `-O3` number was an `-O0` number.)

**3. Medians of N ≥ 5 runs**, with min and max recorded for every configuration. `summary.md`
reports the median; `results.json` carries the full vector.

**4. Startup is measured and subtracted.** Every runtime is timed on an empty program
(`fn main(){}` / `function main(){} main()` / empty `.js` / empty `.py`). All ratios in
`summary.md` are computed on **startup-subtracted (net)** times, so a 40ms benchmark compares
languages rather than process launchers. Raw times are kept in `results.json`. Any benchmark where
a runtime's startup exceeds 10% of its measured time is flagged `STARTUP><n>%(<runtime>)` — treat
that column as unreliable and re-size the benchmark.

**5. CPU pinning.** Default `taskset -c 2-5`. The box is a 24-thread i9-12900KF; under WSL2 the
kernel presents 12 uniform SMT cores, so there is no P/E asymmetry to defend against here, but
pinning still removes scheduler-migration noise. **Pinning to a single cpu was rejected**: deno's
background optimizing-compiler and GC threads and wasmtime's helper threads would be squeezed onto
the same cpu as the mutator, which penalises exactly the runtimes VL is being compared against.
Four sibling hw threads (2 physical cores) is the compromise, and the choice is recorded in
`results.json` under `method.taskset`.

**6. stdout is verified on every single run.** Each timed run's stdout is `cmp`'d against
`expect` (or `expectPython` / `expect<Variant>`). A mismatch aborts that configuration, records
`MISMATCH` with the offending output, and **no timing from it ever reaches the results table**.

**7. Failures are results.** A benchmark that will not build or run in a language gets a
`BUILD-FAIL` / `RUN-FAIL` row with the captured stderr rather than being skipped. A benchmark VL
cannot run is the most important row in the table.

**8. Python's reduced N is normalized explicitly, never silently.** Python is given a smaller N so
it does not force the other three to be too short to measure. `meta.json` states the reduction in
prose, so the scalar factor is transcribed into a table at the top of the report generator inside
`run.sh` (`PYSCALE`), each entry carrying its own justification. `summary.md` prints **both**
`py(raw)` and `py(norm) = raw × factor`. Three benchmarks (`recursion/deeprec`,
`recursion/tailcall`, `recursion/treewalk`) have `None`: their own adversarial audits establish
that no single scalar factor is valid — `deeprec`/`tailcall` change *both* depth and repeat count
so Python is running a different workload, and `treewalk`'s Python time is dominated by the
one-time tree build. Those print `-` and are flagged `PY-UNNORMALISABLE`. **A reduced-N Python
number is never compared against a full-N number.**

**9. Dead-code elimination and folded loops** are the responsibility of each benchmark (every one
consumes and prints its accumulator, and each `meta.json` records an N-vs-2N or exact-work-ratio
scale check). Benchmarks that could not be made honest are marked `void` in their `meta.json` and
excluded here with the reason printed.

---

## Noise floor

Two independent reads, both in `summary.md`:

- **repeat probe** — after the sweep, one identical configuration (`BENCH_NOISE`, default
  `arith/i32-accum`) is re-run from scratch for VL, Rust and deno; the report prints
  `|median₂ − median₁| / median₁`.
- **within-configuration spread** — `(max − min) / median` across every measured configuration in
  the sweep, at p50 / p90 / p99.

The reported **noise floor** is the larger of the two. **Differences smaller than the noise floor
are not differences** and must not be read as findings.

A third read guards against the specific failure mode of a shared box. Every sample >1.5x its own
configuration's median is counted as an **outlier**; the report prints how many samples and how
many configurations were affected. The distinguishing question is *broad noise or isolated
interference?* — if the affected configurations have exactly ONE bad sample each (the observed
pattern: 49 outlier samples across 49 of 253 configurations, one apiece), an unrelated process ran
on the box and the median of N absorbs it. Broad noise would instead show many outliers
concentrated in a few configurations, and would mean the medians are soft.

Because of that, `summary.md` carries a **`vl/deno(min)`** column beside `vl/deno`: the same ratio
computed on min-of-N instead of median-of-N. Min-of-N cannot be inflated by a noisy neighbour at
all. **The two columns agreeing is what makes a row trustworthy**; where they disagree by more
than the noise floor, believe neither and re-run. (In the recorded sweep they agree to within 3%
on every row, including all nine PRIORITY-LOSSes.)

This is not a hypothetical guard. A 1-rep smoke sweep taken minutes before the real one reported
`arith/intdivmod` VL at 2744ms and `strings/str-eq` VL at 4215ms; the 7-rep sweep puts them at
484ms and 1894ms. **Single-run numbers on this box are worthless** — the 1-rep read was 5.7x wrong.

---

## Verdict thresholds

Computed on startup-subtracted times.

### versus deno — the peer that decides whether something is a defect

| ratio `vl / deno` | verdict | reading |
|---|---|---|
| < 0.80 | **WIN** | VL is meaningfully ahead of a JIT'd dynamic language |
| 0.80 – 1.25 | **PAR** | inside the band where wasmtime-vs-TurboFan codegen noise lives |
| 1.25 – 2.00 | **LOSS** | a real gap; file it |
| > 2.00 | **PRIORITY LOSS** | a statically-typed AOT-compiled language should not be twice the cost of a JIT'd dynamic one |

*Why 1.25 for PAR:* it is comfortably above the measured within-configuration noise floor
(single-digit %) while still being tight enough that a genuine one-instruction defect — the
missing `return_call` in `recursion/tailcall`, worth ~2x — cannot hide inside it. Why 2.00 for
PRIORITY: at 2x the cause is never scheduling or a JIT warmup artifact; it is always a structural
one (a missing instruction, an unhoisted load, an unspecialized call, a boxing).

### versus Rust — headroom, not a loss

The `vl/rust` column is reported as **HEADROOM**. VL will not beat `rustc -O`; the question is how
far below it sits. Anything past **10x** is flagged `RUST-GAP-<n>x` as a finding. Note that
several `main.rs` files are **auto-vectorized** by LLVM (documented per-benchmark in
`meta.json:audit`) — on those the ratio is largely SIMD width, not scalar codegen quality, because
VL emits no SIMD. Read those with the audit note in hand.

### versus Python — the floor

`py(norm) / vl` is how many times faster VL is than CPython. Under **5x** is flagged
`PYTHON-RED-ALERT-<n>x`. Under **1x** means the interpreter is beating the compiled language,
which is only ever explicable when Python's builtin is a C routine (e.g. `str.find` in
`strings/substr-search`) — and even then it is a finding about VL's builtin.

### VL-internal flags

| flag | meaning |
|---|---|
| `IDIOM-GAP-<n>x(<variant>)` | `main.vl` is n× slower than a hand-spelled variant. **A defect, not a tip.** |
| `O3-GAP-<n>x` | `vl build -O3` is n× faster than the default build — the default is leaving that on the table |
| `O3-REGRESSION-<n>x` | `-O3` made it n× **slower** |
| `O3-NOOP` | the `-O3` module is byte-identical to `-O0` |
| `STARTUP><n>%(<rt>)` | that runtime's empty-program time is >10% of its measurement |
| `PY-UNNORMALISABLE` | no valid scalar factor for Python's reduced N |

---

## Known limits of these numbers

- **The sweep is PRELIMINARY.** It was taken on a shared box (loadavg ~3.8 from unrelated work).
  Prior audits recorded this machine swinging up to **2.5x under contention even with taskset**.
  Read the **ratios**, not the absolutes, and re-run on an idle box before publishing anything.
- Ratios use the *median* of N runs, not the min. A min-of-N is less contaminated by a noisy
  neighbour but also hides a runtime's own variance (GC pauses, JIT tiering); the full vector is in
  `results.json` if a min-of-N read is wanted instead.
- Compile times are measured with 3 runs, not `BENCH_REPS`, since they are never part of an
  execution number.
- `rustc -O` is `opt-level=3` for the *default* target (baseline x86-64 / SSE2), not
  `-C target-cpu=native`. Several audits record the native figure separately.

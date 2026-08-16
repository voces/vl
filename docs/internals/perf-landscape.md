# The performance landscape — VL against Rust, V8 and CPython

Measured 2026-08-02 on master `1dd3d6a2` with `bench/run.sh` (46 benchmarks, 45 measured, one
VOID). The suite exists to answer one question — **where does VL actually sit, and what is making
it slower than it should be** — and it is written to be adversarial about its own numbers: every
benchmark was independently audited for dead-code elimination, auto-vectorisation, startup
domination and stdout equivalence before any ratio here was quoted.

Raw data: `bench/results/{results.json,summary.md,raw.ndjson}`. Deep dives on the five worst
rows: `bench/findings/*.md`.

> ## THE 08-02 TABLES ARE SUPERSEDED — read this before quoting a number from §3 or §4
>
> Eight PRs have landed against this suite since the 08-02 sweep: **P1** `return_call`
> (#1324), **P2** closure dispatch (#1326), **P3** `__str_eq__` 8x unroll + **P4a** `indexOf`
> first-char skip (#1328), **P5** list-header hoist (#1333), the union return-path box sinks
> (#1322, #1337), the top-level-`let` storage class (#1321), and **P7a's unroll** (#1342).
> **§3's landscape, §4's loss ranking, §6's idiom gaps and §7's headroom tail were all written
> before any of them.** (§5's item table had the P3/P4a/P5 rows but still listed **P1 and P2 as
> open with their prototyped numbers**; those are closed with their measured figures now.)
>
> The current sweep is `bench/results/summary.md` / `results.json`, generated
> **2026-08-03T01:21:48 at repo `1d3a8559`** — a different run with a different protocol
> (5 reps, not 7; 254 configurations, 1,270 samples; noise floor 6.3%). Every §3/§4 number
> below is kept as the 08-02 record, with the rows the shipped work moved called out
> underneath their table and in each §4 heading. **Where the two disagree, the 08-03 figure
> is the live one.**
>
> **The 08-03 sweep labels itself PRELIMINARY for the same reason this document does**
> ("other work may have been on the machine"). It re-ranks the landscape; it does not settle
> it. An authoritative pass still needs exclusive use of the box (§9), and neither sweep has
> had one.

---

## 1. The verdict

**VL is at parity with V8 in the median and roughly 2.3x off native — but the median hides the
shape of the distribution, and the shape is the finding.** Across 45 benchmarks the median
`vl/deno` is **1.00** (geomean 1.04) and the median `vl/rust` is **2.29x** (geomean 2.65x). VL
**beats deno on 16 benchmarks, ties on 15, and loses on 14** — but its losses are still heavier
than its wins: the worst loss is **6.9x** (`strings/str-eq`) and the best win is 2.8x
(`recursion/tailcall` at 0.35). So VL is not broadly behind V8; it is *episodically* behind V8, on
a small number of axes that a real program hits constantly — string equality, substring search,
and indexing an array. Against the interpreter floor VL wins by a geomean of **17.5x**, which is
where it should be, except that **it loses outright to CPython on three benchmarks**
(`strings/substr-search` py/vl 0.2, `strings/str-eq` 0.7, `collections/set-ops` 0.98) and is under
2x on three more (`map-string` 1.1, `map-i32` 1.2, `word-freq` 1.7) — all six are string-hashing or
string-comparison paths, and that clustering is not a coincidence. Against Rust, after correcting
for the auto-vectorisation the audit found in 9 of 46 `main.rs` files, VL's *scalar* codegen is
close (on `arith/i32-accum` the raw multiple is 5.4x but the scalar-vs-scalar multiple is ~1.4x);
the genuine native headroom is concentrated in WasmGC array access and in the absence of any
inlining or SIMD story. **The single most important structural finding is that `vl build -O3`
recovers 3.0x on `algorithms/lambda-hot` and 2.9x on `collections/struct-field` — meaning the
default build, which is what every user and the self-hosted compiler actually run, is leaving
multiples on the floor that a downstream tool can already find.**

### 1.1 What the 08-02 verdict said, and what the shipped work did to it

Every figure in §1 above is the **08-03 sweep** (`bench/results/summary.md`, repo `1d3a8559`,
PRELIMINARY). The 08-02 sweep this document was written from — and which §3 and §4 still carry —
read:

| | 08-02 (`1dd3d6a2`) | 08-03 (`1d3a8559`) |
|---|--:|--:|
| median `vl/deno` | 1.04 | **1.00** |
| geomean `vl/deno` | 1.19 | **1.04** |
| median `vl/rust` | 2.49x | **2.29x** |
| geomean `vl/rust` | 3.04x | **2.65x** |
| geomean `py/vl` (42 normalisable) | 15.2x | **17.5x** |
| WIN / PAR / LOSS / PRIORITY-LOSS | 15 / 16 / 5 / 9 | **16 / 15 / 7 / 7** |
| worst loss | `str-eq` **14.02x** | `str-eq` **6.88x** |
| best win | `push-growth` 0.38 (2.6x) | `tailcall` 0.35 (2.8x) |
| `-O3` gap on `lambda-hot` | 11.81x | **3.01x** |

**The loss COUNT did not move — it is 14 on both sweeps.** What moved is the tier and the
membership: the PRIORITY tier went 9 → 7, `algorithms/dispatch-table` (3.34 → 1.00) and
`recursion/mutual` (2.37 → 1.22) left the loss list outright, and `collections/map-i32` (1.25 →
1.33) and `algorithms/nbody` (1.21 → 1.30) slid in across the 1.25 threshold to replace them. The
`-O3` gap on `lambda-hot` collapsed from 11.81x to 3.01x for the reason §4.2 predicted — P2 made
the *default* build fast, so there is far less for the optimiser to recover.

**The prediction in the original verdict was that fixing four compiler-fixable defects "would flip
six benchmarks and clear every Python red alert except one". Five items shipped (P1, P2, P3, P4a,
P5) and it half-held.** Two benchmarks left the loss list and two more crossed from PAR to WIN
(`algorithms/map-filter-reduce` 1.01 → 0.66, `recursion/treewalk` 0.86 → 0.77) — but **not one
Python red alert cleared**: six rows carried `PYTHON-RED-ALERT` on 08-02 and the same six carry it
on 08-03. `str-eq` more than doubled its py/vl (0.35 → 0.74) and still loses to CPython. The
string-layer red alerts do not close with loop-shape work; §4.6 and P12 are where they close.

---

## 2. Methodology, and what it does not support

### 2.1 The protocol

| | |
|---|---|
| harness | `bench/run.sh`, 7 reps per configuration, **median** reported (min/max in `results.json`) |
| statistic | median-of-7; a `vl/deno(min)` cross-check computed on min-of-7 is printed alongside |
| cpu pinning | `taskset -c 2-5` (2 physical cores / 4 hw threads) |
| toolchains | rustc 1.96.0 (`ac68faa20`, `-O`) · deno 2.9.0 · Python 3.11.2 · wasmtime via `scripts/vl-host` |
| VL execution | **always a prebuilt module** (`vl build` then `vl run x.wasm`); compile time is a separate column |
| ratios | computed on **startup-subtracted** times |
| configurations | 253 across 45 benchmarks; 1,771 individual timed samples |

**Startup was measured, not assumed.** Empty-program medians this run: rust 2.22 ms, `vl run
<prebuilt.wasm>` 4.90 ms, `vl run <src.vl>` 12.19 ms, deno 12.20 ms, python3 9.51 ms. Every ratio
in this document subtracts these. This matters: 16 of 184 (benchmark, language) columns sit under a
200 ms floor where the launcher is a visible fraction — 11 of them Rust columns, because Rust is
5–40x faster than VL on those axes and no single N puts both inside a 1–5 s window.

**`vl run <src>` was never used for a timing.** It carries 10–390 ms of compile time
(`collections/map-string`: 1.47 s prebuilt vs 1.86 s from source = 27% inflation).

**Warmup.** deno's JIT is given the work inside the amortising loop rather than a separate warmup
pass; every benchmark runs long enough (≥ 350 ms on deno except the three sub-floor columns) that
TurboFan has tiered up. Python pays interpreter startup, subtracted as above.

**Python's reduced N.** Most benchmarks run Python at a reduced N with the scale factor recorded in
`meta.json`; `run.sh` carries a `PYSCALE` table with a per-benchmark justification and prints
**both** `py(raw)` and `py(norm)`. Three benchmarks are marked **PY-UNNORMALISABLE** and print `-`:
`recursion/deeprec` and `recursion/tailcall` move *two* knobs (depth 5000→900 and repeats
120000→10000), so at reduced N Python is no longer exercising the deep-stack axis at all; and
`recursion/treewalk` is dominated by a one-time 1M-node tree build, where a naive 7.5x multiply
overstates Python by 2.5x (measured: the honest extrapolation is build ≈ 2.0 s + 0.043 s/walk ≈
8.4 s, not 21.4 s). **Do not quote a normalised Python number for those three.**

### 2.2 Noise floor: 7.0%

Taken as the larger of (a) an explicit repeat probe — one identical configuration re-run from
scratch at the end of the sweep: vl 7.0%, rust 1.0%, deno 3.7%; and (b) the p50 within-configuration
spread, 6.6%. **Differences under 7% are not differences.** Outlier accounting: 49 of 1,771 samples
exceeded 1.5x their own configuration's median, spread across 49 of 253 configurations — exactly one
apiece, i.e. isolated interference rather than broad noise, which the median absorbs. The
min-of-7 cross-check agrees with the median-based ratio to within 3% on every row including all
nine priority losses.

### 2.3 These numbers are PRELIMINARY

**The machine was not quiet.** Load average ran ~3.8 from unrelated work during the sweep, and the
per-benchmark audits independently measured this box swinging **2.5–4x on identical binaries** when
a second timing job ran, *even with `taskset` pinning* (hyperthread sibling contention:
`recursion/flatcall`'s Rust binary read 2.53 s in a sequential sweep vs 0.996 s as min-of-5 alone).
A 1-rep smoke sweep taken minutes before the recorded one read `arith/intdivmod` at 2744 ms where
the 7-rep sweep reads 484 ms — **5.7x wrong on one row**. Consequently:

> **Read the RATIOS, not the absolutes.** Two independent interleaved passes agreed to within ~10%
> on every cross-runtime ratio; absolute levels drifted much more. An authoritative pass needs
> exclusive use of the box (§9).

Single-CPU pinning was deliberately rejected: it would squeeze deno's background optimising-compiler
and GC threads and wasmtime's helper threads onto the mutator's cpu, systematically penalising the
runtimes VL is being compared against. Under WSL2 this box presents 12 uniform SMT cores with no
P/E asymmetry (`lscpu -e`), so single-core pinning bought nothing to offset that risk.

### 2.4 The `-O3` column is real (it very nearly was not)

`vl build -O3` shells out to `wasm-opt`, and **when it cannot find one it prints a note to stderr,
writes the UNOPTIMISED module, and exits 0.** `wasm-opt` is not on `PATH` here — it lives at
`node_modules/binaryen/bin/wasm-opt`. Two independent authors reported `-O3` numbers that were
re-runs of the unoptimised module (byte-identical, md5 verified) before catching it. `run.sh` now
exports `VL_WASM_OPT` *and* `cmp`s the `-O3` module against the `-O0` module, raising an `O3-NOOP`
flag if they are byte-identical. **Zero benchmarks raised `O3-NOOP` in the recorded sweep.**

### 2.4a THE HARNESS HAS NEVER BUILT `-O`, AND THAT BLINDS EVERY `-O3` VERDICT IN THIS FILE

`run.sh` builds two rungs: the default and `-O3`. **The middle rung, plain `wasm-opt -O`, has never
been measured.** So every statement of the form "`-O3` recovers 11.8x" in this document is a
comparison against the *unoptimised* build — true as written, and not the question a release profile
needs answered, which is "is `-O3` the best rung available". (That particular figure is 3.01x on the
08-03 sweep: P2 made the *unoptimised* build fast, which is the point.)

A three-rung sweep over all 46 benchmarks (interleaved min-of-3, all three rungs required to agree on
non-empty stdout; the interesting rows re-taken at min-of-9) says it is not, and splits the failures
into **two mechanisms the two-rung harness reports identically**:

**(a) `wasm-opt` ITSELF loses — both optimised rungs are worse than no optimisation.** This class is
**already ruled upstream by #1325** (see §P11): bare `wasm-opt -O` carries the regression identically,
so no flag in the release profile is responsible — binaryen rotates the loop and Cranelift spills.
What the third rung adds is the POPULATION. The existing `O3-REGRESSION` flag sees two rows; there
are seven:

| benchmark | default | `-O` | `-O3` | best optimised vs default |
|---|---:|---:|---:|---|
| `arith/mixed-width` | **212** | 479 | 472 | **2.23x SLOWER** |
| `arrays/binsearch` | **1371** | 1785 | 1859 | 1.30x slower |
| `algorithms/nbody` | **3081** | 3504 | 3331 | 1.08x slower |
| `strings/token-count` | **1464** | 1584 | 1631 | 1.08x slower |
| `strings/substr-search` | **633** | 676 | 709 | 1.07x slower |
| `arrays/reverse-inplace` | **1682** | 1780 | 1807 | 1.06x slower |
| `arith/bitcount` | **176** | 186 | 184 | 1.05x slower |

`mixed-width` is the one to look at: VL's *unoptimised* build is 212 ms against Rust's 188 ms —
near parity on a three-accumulator mixed-width loop — and running the optimiser at either rung
throws that away. Both optimised rungs land within 1.5% of each other, which is the same signature
#1325 measured with explicit flag ablation, now reproduced independently by rung.

**(b) `-O3` SPECIFICALLY loses, and `-O` is the best rung.** The two-rung harness cannot see this
class at all, because it reports the same "`-O3` ≈ default" as class (a):

| benchmark | default | `-O` | `-O3` |
|---|---:|---:|---:|
| `arrays/sort-heap` | 854 | **648** | 837 |

`-O` is a 1.32x win here that this document has never recorded, and `-O3` gives all of it back —
landing in a dead heat with the unoptimised build. **The mechanism is understood.** `-O` compiles
the sift-down loop condition branchlessly, computing `root*2+1` once into a local:

    ... i32.shl / i32.const 1 / i32.add / local.tee 3 / local.get 2 / i32.le_s / i32.and

`-O3` turns that `i32.and` into an `if`/`else` control-flow diamond **and rematerialises the
arithmetic** instead of reusing the stashed local. Heapsort's sift-down branch is data-dependent and
essentially unpredictable, so this converts a branchless test into a mispredicting branch in the
hottest loop in the program. Both rungs emit the same function count and locals within one (9/16 vs
9/15), so it is neither an inlining nor a register-allocation difference — it is one heuristic
firing the wrong way. See `p9-inlining-notes.md`.

**What this changes.** `-O3` remains the right default where it wins, and it wins big (`lambda-hot`
2.2x better than `-O`, `dispatch-table` 1.43x, `mandelbrot` 1.28x). But "`-O3` is the release
profile" is a claim this suite has never actually tested, and on the evidence the honest position is
that **the best rung is per-program and the toolchain currently offers no way to discover that
except measuring all three.** Adding the `-O` column to `run.sh` is the cheap fix and it should
precede any further `-O3`-based recommendation. Until then, treat every `-O3` multiple in §3 and §4
as "versus unoptimised", never as "versus the best we can do".

### 2.5 What was verified, so it is not re-litigated

The adversarial audit ran over all 46 benchmarks × 4 languages and established:

- **Equivalence** — all 184 programs built and ran; all 184 outputs byte-identical to
  `meta.expect` / `expectPython`. (This required fixing a schema split where 32 of 46 `meta.json`
  files omitted the trailing newline their programs actually emit and 14 included it.)
- **Nothing is optimised away** — the driving knob was independently halved for all 46 × 4 and
  everything re-timed. Every ratio lands 1.45–2.3x, with sub-2.0 readings fully explained by fixed
  setup cost, plus the intentionally non-linear ones (`binarytrees` exponential in depth,
  `mandelbrot`/`spectralnorm` quadratic, `fib` exponential).
- **No numpy** — the only Python imports across the suite are `sys`, `math` and `functools.reduce`.
- **Builtin vs hand-written is matched** — `sort-heap`, `reverse-inplace` and `binsearch` are
  hand-written in *all four*; `substr-search`, `int-format` and the map/set benchmarks use each
  language's own builtin on all four sides; `set-ops` deliberately forgoes Rust/Python/ES2025 set
  algebra because VL has none.
- **No VL hack smell** — every `main.vl` is the plain idiomatic spelling; the fast variants are
  isolated in `opt.vl` and labelled as defect witnesses, never as advice.

### 2.6 The one thing the audit could NOT see, and corrected afterwards

**Undisclosed rustc auto-vectorisation, hitting 9 of 46 benchmarks.** Every author ran the
prescribed N-vs-2N scale test and every one PASSED — because LLVM did not *delete* the loop, it
*widened* it. The scale test is structurally blind to vectorisation; only disassembly sees it.
Confirmed by counting packed SSE2 ops inside `main::main` against the std-library baseline:
`fill-sum` 54, `struct-soa` 42, `matmul` 24, `reverse-inplace` 18, `char-scan` 12, `struct-aos` 12,
plus `i32-accum` (`paddd`/`pand`, 4-wide, 4 accumulator chains, 16x unrolled), `i64-accum`
(`paddq`, 2-wide, 8x unrolled) and `struct-field`'s nested phase (`paddd`/`pshufd`/`shufps` with a
horizontal reduction — which also makes that benchmark's own `notes` field factually wrong; corrected
in its `meta.audit`).

> **On those nine rows a chunk of every "VL is Nx slower than Rust" headline is SIMD width, not
> codegen quality.** Concretely, on `arith/i32-accum` the raw multiple is 5.4x but
> `rustc -O -C target-cpu=native` reads 27.7 ms against rustc-`-O`'s 57.4 ms, so the *scalar*
> multiple is ~1.4x. Each affected `meta.json` carries the evidence under `meta.audit.rustVectorised`.

The same correction runs the other way once: **`arith/bitcount` is the one benchmark where the
unfairness favours VL.** VL reads 172.8 ms vs `rustc -O` 224.8 ms — "VL beats native Rust" — because
rustc's default target is baseline x86-64 (SWAR popcount) while wasmtime compiles for the *host*
(real `POPCNT`/`LZCNT`). Measured: `rustc -O -C target-cpu=native` = 151.2 ms, so host-tuned Rust
beats VL 1.15x and **the win evaporates. Do not publish that win without the `target-cpu=native`
column.**

---

## 3. The landscape

Times are medians in **ms**, startup-subtracted. `vl/rust` is **headroom**, not a loss. `vl/deno`
is the competitive number: **> 1.00 means VL, statically typed and AOT-compiled, lost to a JIT'd
dynamic language.** `py(norm)` is Python's reduced-N time × its scale factor; `-` = no valid scalar
factor (§2.1).

> **These five tables are the 08-02 sweep and are NOT re-measured.** They are kept because they
> carry the `-O3` column and the audit context the 08-03 sweep does not restate. Under each one is
> a **`Moved since (08-03)`** line naming every row whose `vl/deno` shifted by more than the 6.3–7%
> noise floor **or** changed verdict tier; a row not named there did not move. Verdict thresholds
> (`bench/run.sh`): WIN `< 0.80`, PAR `0.80–1.25`, LOSS `> 1.25`, PRIORITY-LOSS `≥ 2.00`.

### arith

| benchmark | rust | **vl** | vl -O3 | deno | py(norm) | vl/rust | **vl/deno** | verdict |
| --- | --: | --: | --: | --: | --: | --: | --: | --- |
| `floatops` | 482.8 | **381.7** | 385.2 | 350.7 | 36293.3 | 0.79 | **1.09** | PAR |
| `bitops` | 295.4 | **324.0** | 318.3 | 311.4 | 36262.9 | 1.10 | **1.04** | PAR |
| `intdivmod` | 238.9 | **483.6** | 476.3 | 479.3 | 9075.0 | 2.02 | **1.01** | PAR |
| `f64-accum` | 551.9 | **535.9** | 539.5 | 546.7 | 6466.7 | 0.97 | **0.98** | PAR |
| `i32-accum` | 56.1 | **320.0** | 289.5 | 343.7 | 20434.7 | 5.70 | **0.93** | PAR |
| `mixed-width` | 172.3 | **195.4** | 474.3 | 257.9 | 17659.3 | 1.13 | **0.76** | WIN |
| `convert` | 304.9 | **277.2** | 279.6 | 423.1 | 23028.6 | 0.91 | **0.66** | WIN |
| `bitcount` | 224.8 | **172.8** | 181.9 | 321.8 | 12360.5 | 0.77 | **0.54** | WIN |
| `i64-accum` | 112.1 | **295.9** | 300.7 | 592.1 | 20609.7 | 2.64 | **0.50** | WIN |

Scalar arithmetic is **healthy**. VL never loses to deno here and beats it on four of nine. The
`i32-accum` / `i64-accum` / `bitcount` Rust columns are SIMD- or host-ISA-inflated (§2.6). Note
`mixed-width`'s `-O3` column: 195 → 474 ms, the **worst `-O3` regression in the suite**.

**Moved since (08-03):** `i64-accum` 0.50 → **0.57** (still WIN, still the category's best);
`mixed-width` 0.76 → **0.80**, which is under the noise floor but lands exactly ON the WIN/PAR
boundary and so is scored **PAR** now — a threshold straddle, not a regression. The category's
character is unchanged: still zero losses, still four wins.

### arrays

| benchmark | rust | **vl** | vl -O3 | deno | py(norm) | vl/rust | **vl/deno** | verdict |
| --- | --: | --: | --: | --: | --: | --: | --: | --- |
| `matmul` | 106.9 | **1585.0** | 1567.7 | 582.8 | 31440.4 | 14.83 | **2.72** | PRIORITY-LOSS |
| `struct-soa` | 104.1 | **1250.4** | 1130.1 | 500.8 | 16764.5 | 12.01 | **2.50** | PRIORITY-LOSS |
| `reverse-inplace` | 261.8 | **2099.1** | 1810.9 | 958.2 | 27469.8 | 8.02 | **2.19** | PRIORITY-LOSS |
| `sort-heap` | 316.4 | **936.2** | 1020.9 | 563.1 | 15226.0 | 2.96 | **1.66** | LOSS |
| `binsearch` | 1066.3 | **1464.3** | 1802.1 | 1999.5 | 19743.3 | 1.37 | **0.73** | WIN |
| `fill-sum` | 93.1 | **1037.0** | 930.9 | 1479.7 | 16397.4 | 11.14 | **0.70** | WIN |
| `struct-aos` | 330.0 | **1583.3** | 1557.4 | 2650.6 | 20251.4 | 4.80 | **0.60** | WIN |
| `push-growth` | 102.4 | **522.1** | 459.4 | 1382.7 | 7145.8 | 5.10 | **0.38** | WIN |

The **array-indexing family**. Every row here is dominated by the same per-element cost (§4.5); the
ones VL wins are the ones where the *other* runtime pays more elsewhere (V8 bounds-checks and
megamorphic-loads too), not the ones where VL is fast. `push-growth` (0.38) is the suite's biggest
win — geometric list growth is genuinely good. `binsearch` carries an `-O3` **regression** (1464 →
1802 ms).

**Moved since (08-03) — this is P5's category, and P5 (#1333) landed:** `reverse-inplace` 2.19 →
**1.51**, out of the PRIORITY tier into plain LOSS; `struct-soa` 2.50 → **2.25**; `sort-heap` 1.66
→ **1.51**; `fill-sum` 0.70 → **0.61**. Two rows moved the *other* way and neither is P5's:
`push-growth` 0.38 → **0.45**, which costs it the "biggest win in the suite" title (`tailcall`
0.35 now holds it), and `struct-aos` 0.60 → **0.65**. `matmul` (2.72 → 2.80) and `binsearch` (0.73
→ 0.70) did not move. **The family is still the family** — P5 took the header re-load out and the
Cranelift `array.get` lowering underneath it (§4.5) is untouched.

### strings

| benchmark | rust | **vl** | vl -O3 | deno | py(norm) | vl/rust | **vl/deno** | verdict |
| --- | --: | --: | --: | --: | --: | --: | --: | --- |
| `str-eq` | 37.8 | **1894.3** | 1869.8 | 135.1 | 654.5 | 50.09 | **14.02** | PRIORITY-LOSS |
| `substr-search` | 37.7 | **1063.5** | 1109.4 | 125.3 | 133.4 | 28.22 | **8.49** | PRIORITY-LOSS |
| `int-format` | 399.6 | **845.1** | 805.9 | 661.8 | 5582.0 | 2.12 | **1.28** | LOSS |
| `slice-extract` | 293.3 | **1296.1** | 1271.1 | 1191.1 | 17643.5 | 4.42 | **1.09** | PAR |
| `char-scan` | 262.4 | **1409.6** | 1248.1 | 1648.2 | 22318.3 | 5.37 | **0.86** | PAR |
| `token-count` | 331.9 | **1409.3** | 1489.7 | 2304.0 | 23523.2 | 4.25 | **0.61** | WIN |

**The worst category in the suite.** The two priority losses are also the two benchmarks VL loses to
CPython. Note the shape: VL's raw per-character scan (`char-scan` 0.86, `token-count` 0.61) is
*fine* — it is 1.5x faster than V8's `charCodeAt` loop. Everything VL loses is a place where the
other three runtimes drop into a byte-oriented builtin (SIMD `memcmp`, Boyer-Moore `indexOf`) and
VL stays in the element-at-a-time world. **`strings/concat-build` is VOID** and excluded (§3.1).

**Moved since (08-03) — P3 and P4a (#1328) landed:** `str-eq` 14.02 → **6.88** deno / 50.09 →
**24.19** rust / py/vl 0.35 → **0.74**; `substr-search` 8.49 → **5.17** deno / 28.22 → **17.21**
rust / py/vl 0.13 → **0.21**. `char-scan` 0.86 → **0.92** is the only other move and is at the
noise floor. **Both are still PRIORITY losses and both still lose to CPython** — halving them was
not enough to clear either red alert, which is the finding, not a footnote (see §5's "What #1328
changed, and what it did NOT"). This is still the worst category in the suite.

### collections

| benchmark | rust | **vl** | vl -O3 | deno | py(norm) | vl/rust | **vl/deno** | verdict |
| --- | --: | --: | --: | --: | --: | --: | --: | --- |
| `set-ops` | 415.8 | **870.5** | 800.9 | 347.1 | 655.0 | 2.09 | **2.51** | PRIORITY-LOSS |
| `map-string` | 503.6 | **1255.8** | 1244.0 | 628.9 | 1515.4 | 2.49 | **2.00** | LOSS |
| `word-freq` | 228.2 | **1202.4** | 1165.4 | 756.3 | 2140.8 | 5.27 | **1.59** | LOSS |
| `map-i32` | 367.9 | **1067.1** | 990.7 | 854.5 | 1449.7 | 2.90 | **1.25** | PAR |
| `struct-field` | 443.3 | **997.0** | 343.8 | 890.8 | 104279.8 | 2.25 | **1.12** | PAR |
| `struct-array-scan` | 260.2 | **752.9** | 673.9 | 1013.1 | 11298.5 | 2.89 | **0.74** | WIN |
| `struct-alloc` | 671.0 | **282.1** | 284.3 | 475.5 | 6905.3 | 0.42 | **0.59** | WIN |

**All four collections Python red alerts live here.** `struct-alloc` is the suite's most
interesting win — VL is **2.4x FASTER than `rustc -O`** on allocation-heavy tree building (0.42x of
Rust), because wasmtime's bump allocator beats malloc. `struct-field` carries a 2.90x `-O3` gap.

**Moved since (08-03) — nothing shipped against this category, and it shows.** Every row is inside
the noise floor, but three sit on thresholds and re-scored: `map-string` 2.00 → **2.03** crosses
INTO PRIORITY-LOSS; `map-i32` 1.25 → **1.33** crosses PAR → LOSS; `set-ops` 2.51 → **2.32** and
`word-freq` 1.59 → **1.70** stay in tier. Read these as scoring noise on an unmoved category, not
as a regression — **and as the reason the string-hashing family (§4.6) is now the largest untouched
block of compiler-fixable loss in the suite.** P7's unroll (#1342) landed after this sweep and is
not in these numbers.

### algorithms

| benchmark | rust | **vl** | vl -O3 | deno | py(norm) | vl/rust | **vl/deno** | verdict |
| --- | --: | --: | --: | --: | --: | --: | --: | --- |
| `lambda-hot` | 113.1 | **2155.7** | 182.5 | 194.7 | 22031.6 | 19.05 | **11.07** | PRIORITY-LOSS |
| `dispatch-table` | 140.6 | **1179.3** | 1216.1 | 353.4 | 11436.1 | 8.39 | **3.34** | PRIORITY-LOSS |
| `spectralnorm` | 1058.7 | **2487.8** | 2273.0 | 1629.8 | 90425.6 | 2.35 | **1.53** | LOSS |
| `nbody` | 1380.2 | **2962.1** | 3232.9 | 2451.6 | 115057.1 | 2.15 | **1.21** | PAR |
| `mandelbrot` | 2658.4 | **3175.3** | 2860.0 | 2902.4 | 80421.2 | 1.19 | **1.09** | PAR |
| `map-filter-reduce` | 121.3 | **923.0** | 513.0 | 912.5 | 6751.2 | 7.61 | **1.01** | PAR |
| `binarytrees` | 4029.4 | **4438.9** | 4443.2 | 4730.0 | 42934.6 | 1.10 | **0.94** | PAR |

The **function-value family** (`lambda-hot`, `dispatch-table`, `map-filter-reduce`) against the
**whole-program** benchmarks. On real numeric programs with no function values in the loop
(`mandelbrot` 1.09, `binarytrees` 0.94, `nbody` 1.21) VL is level with V8 and within 1.1–2.2x of
Rust — that is the honest picture of VL's baseline codegen.

**Moved since (08-03) — this is P2's category, and P2 (#1326) landed. It is the largest movement
in the suite:** `lambda-hot` 11.07 → **2.55** deno / 19.05 → **4.60** rust; `dispatch-table` 3.34 →
**1.00**, PRIORITY-LOSS → **PAR, off the loss list entirely**; `map-filter-reduce` 1.01 → **0.66**,
PAR → **WIN** — that last one is `emitMfInvoke` paying the 9.4 ns libcall once per element, exactly
as §5's P2 entry said it would. Two rows moved without P2's help: `nbody` 1.21 → **1.30** crosses
PAR → LOSS and `binarytrees` 0.94 → **0.87**, both at the noise floor. **`lambda-hot` is still a
PRIORITY loss** — the row improved 4.34x against deno and what is left is still 2.55x behind it.

### recursion

| benchmark | rust | **vl** | vl -O3 | deno | py(norm) | vl/rust | **vl/deno** | verdict |
| --- | --: | --: | --: | --: | --: | --: | --: | --- |
| `mutual` | 556.2 | **1560.3** | 1269.9 | 659.0 | 64513.1 | 2.81 | **2.37** | PRIORITY-LOSS |
| `flatcall` | 976.9 | **1428.3** | 1419.2 | 1197.5 | 78665.9 | 1.46 | **1.19** | PAR |
| `flatcall-inlined` | 970.1 | **1418.2** | 1431.8 | 1195.0 | 61828.6 | 1.46 | **1.19** | PAR |
| `treewalk` | 656.5 | **747.2** | 720.2 | 873.6 | - | 1.14 | **0.86** | PAR |
| `tailcall` | 118.3 | **1202.5** | 1202.2 | 1653.7 | - | 10.16 | **0.73** | WIN |
| `fib` | 541.2 | **870.0** | 867.4 | 1449.6 | 18389.9 | 1.61 | **0.60** | WIN |
| `deeprec` | 640.8 | **973.2** | 988.2 | 2242.5 | - | 1.52 | **0.43** | WIN |
| `ackermann` | 265.7 | **523.9** | 520.4 | 1350.1 | 39680.8 | 1.97 | **0.39** | WIN |

**Non-tail call overhead is healthy** — `ackermann` (0.39) is the cleanest read on it and VL is 2.6x
ahead of V8. `flatcall` vs `flatcall-inlined` is the control that matters: **1.19 / 1.46 on both**,
identical whether the body is a call or inlined, which rules the call itself out as the cause of the
residual 1.2–1.5x. That residual is the wasmtime/Cranelift scalar-loop floor, not a VL emitter
defect. The two rows with a real problem — `tailcall` (10.16x Rust despite beating deno) and
`mutual` — are one instruction away from being fixed (§5, P1).

**Moved since (08-03) — P1 (#1324) landed, and it is the cleanest confirmed prediction in the
document:** `mutual` 2.37 → **1.22**, PRIORITY-LOSS → **PAR, off the loss list**, against a filed
prototype of 1.97x; `tailcall` 0.73 → **0.35**, now the **best win in the suite**, against a filed
prototype of 2.06x. `treewalk` 0.86 → **0.77** crosses PAR → WIN and `ackermann` 0.39 → **0.36** is
at the noise floor; nothing else moved. The category now has **zero losses**.

### 3.1 VOID: `strings/concat-build`

Excluded from every table. **The Rust column measures literally nothing** — min-of-7 pinned wall
time is 4.6 ms, *below* the 6.8 ms empty-Rust-program startup baseline. deno reads 56.0 ms (34%
launcher), python3 71.5 ms (17%), VL 1730 ms. It is not fixable by raising N: work is linear in
`REPS` for Rust/JS/Python but VL is **O(n²)**, so `REPS × 20` puts Rust at ~92 ms (still under the
floor) while VL goes to ~34 s. There is no N where the fastest and slowest sides are simultaneously
measurable.

**The VL-internal finding survives and is reported in full (§5, P8):** doubling N multiplies VL by
~3.5x while Rust/JS/Python stay 1.6–1.9x. `s = s + c` reallocates and copies **both** operands on
every append.

---

## 4. The losses, ranked

**This ranking is the 08-02 order. Fourteen benchmarks lost to deno and nine were PRIORITY
(≥ 2.0x); on 08-03 fourteen still lose but only seven are PRIORITY.** Each heading below carries
`08-02 → 08-03` so the ordering can be read against the sweep it was ranked on. Each item is stated
with its root cause and its class: **compiler-fixable** (VL's emitter can close it),
**runtime-engine** (Cranelift/wasmtime owns it), or **language-design** (the representation has to
change).

**What the list looks like on 08-03**, in order — `str-eq` 6.88 · `substr-search` 5.17 · `matmul`
2.80 · `lambda-hot` 2.55 · `set-ops` 2.32 · `struct-soa` 2.25 · `map-string` 2.03 (the seven
PRIORITY rows) · `word-freq` 1.70 · `sort-heap` 1.51 · `reverse-inplace` 1.51 · `spectralnorm`
1.48 · `map-i32` 1.33 · `nbody` 1.30 · `int-format` 1.27. **`algorithms/dispatch-table` (§4.4) and
`recursion/mutual` (§4.7) are no longer losses at all** — their sections are kept as the record of
what fixed them.

### 4.1 `strings/str-eq` — 14.02x → **6.88x** deno, 50.1x → **24.19x** rust, **0.35x → 0.74x python** · compiler-fixable + language-design

> **P3 (#1328) shipped the 8x unroll this section prescribes and measured 2.08x** (1970 → 945 ms),
> which is what took 14.02 → 6.88. Everything below about the *representation* still holds: the row
> is **still the worst in the suite and still loses to CPython**. The unroll removed loop control;
> it did not remove 4 bytes of GC-array traffic per ASCII character. §5's P12 is the rest.

**The worst row in the suite, and on 08-02 the only one that lost to CPython by 3x.** 24M
comparisons of 64-char strings at ~79 ns each in VL vs ~5.6 ns in V8. `-O3` does nothing (1.01x).

97% of the benchmark is `__str_eq__`'s content-compare loop (per-phase: identity 32 ms, equal-content
748 ms, early-mismatch 400 ms, late-mismatch 783 ms — 1963 ms of a 2014 ms run). **Two stacked
causes.** (1) *Loop shape*: `emitStrEqFnCode` (`compiler/emit_sections.vl:1814`) emits one compare,
one branch and two bounds-checked `array.get`s **per code point** — 64 iterations and 128 GC loads to
answer a 64-char compare. (2) *Representation*: VL strings are `(array (mut i32))`, UTF-32, one
WasmGC element per code point — 4 bytes of traffic per ASCII char, a non-hoisted bounds check and
object-header length load per element, and decisively **WasmGC has no instruction that compares more
than one element at a time.**

Everything else about the function is fine and was ruled out by measurement: no allocation, no
`global.get`, no `ref.cast`, length already hoisted, the `ref.eq` identity fast path present and
working (total per-comparison fixed cost incl. call, `ref.eq`, 2 `array.len` and 2 list reads is
5.3 ns = 0.3% of the run), `i % GROUPS` through a mutable global is already handled by Cranelift,
and `wasm-opt -O3 --gufa` recovers 1.05x.

The measured ladder (60M comparisons, hand-written `.wat` under the same `vl run` host,
`taskset -c 2`, min-of-5), ns per 64-char compare:

| rung | ns | vs today |
|---|--:|--:|
| [0] VL today — GC i32 array, 1 elem/iter | 124.7 | 1.0x |
| [1] same array, unrolled 8x with an xor/or accumulator | 59.0 | 2.1x |
| [2] linear memory `i32.load`, 1 elem/iter | 23.0 | 5.4x |
| [3] linear memory `i32.load`, unrolled 8x | 16.0 | 7.8x |
| [4] linear memory `i64.load`, 8 bytes/iter | 4.5 | **27.7x** |
| [5] linear memory `v128 i8x16.eq`/`all_true` | 2.9 | 43x |
| — `rustc -O` | ~1.9 | |
| — V8 | ~11 | |

Rung 1 → 3 is **3.7x and is pure WasmGC array-access overhead**: same unrolled loop, same 4-byte
elements, only the container changed. **wasmtime is not the ceiling** — it does a 64-byte string
compare in 2.9–4.5 ns in this exact process.

Full write-up: `bench/findings/bench-strings-str-eq.md`.

### 4.2 `algorithms/lambda-hot` — 11.07x → **2.55x** deno, 19.1x → **4.60x** rust · compiler-fixable

> **P2 (#1326) shipped exactly the change this section prescribes** and measured 4.50–4.68x on this
> benchmark (§5's P2 filing said 5.4x — "real, but a sixth smaller"). It is still a PRIORITY loss.
> The paragraph below on why `-O3` "appeared to fix it" is now visible in the other direction: the
> `-O3` gap fell 11.81x → **3.01x**, because binaryen's devirtualisation had far less left to
> recover once the default build stopped paying the libcall.

**A single instruction: `struct.get $closure 0`, where VL declares field 0 of its closure
fat-pointer as a `funcref`.** In wasmtime 47 a GC-struct field load of func top-type does **not**
lower to a load — it lowers to a builtin **host call**,
`get_interned_func_ref(vmctx, id, expected_ty)`
(`wasmtime-internal-cranelift-47.0.2/src/func_environ/gc.rs:341-381`; wasmtime's own TODO in
`wasmtime-environ-47.0.2/src/builtin.rs:110-115` says they want to remove it). Measured cost
**9.40 ns per read** vs **0.15 ns** for reading any other field of the *same* struct — a 62x penalty
on one field. The mirror libcall `intern_func_ref_for_gc_heap` costs **~41 ns per closure creation**.

The bisection is decisive (hand-written WAT, one edit at a time, 100M iterations, floor = direct call
with no field reads = 69.9 ms):

| variant | ms | delta |
|---|--:|---|
| floor: direct call, no field reads | 69.9 | |
| + read an **i32** field in the loop | 84.5 | +0.15 ns/read |
| + read a **structref** field pointing at a live GC object | 84.3 | +0.14 ns/read |
| + read the **funcref** field, value **DROPPED**, call still direct | **1009.9** | **+9.40 ns/read** |
| VL's exact shape (env get + funcref get + `ref.cast` + `call_ref`) | 1072.7 | |
| same, field 0 typed `(ref $fn)` so no `ref.cast` needed | 1229.0 | **14% WORSE** |
| same, funcref+env loads hoisted above the loop | 101.5 | 10.6x |
| field 0 replaced by an i32 table index + `call_indirect` | **146.2** | **7.3x** |

**94% of the whole lambda penalty is one `struct.get` with the call left untouched, and the value is
discarded.** `call_ref` itself is free (+0.1 ns when the funcref is in a local). The `ref.cast`, the
closure allocation and the captured environment are all innocent — capturing adds only 1.0 ns/iter
on top of non-capturing.

**Why `-O3` appears to fix it (11.81x):** `wasm-dis` of the `-O3` module shows binaryen **deleted
every closure** — no `struct.new`, no `call_ref`, no closure type; 258 bytes vs 560. It devirtualised
and inlined, i.e. it *removed* the funcref field rather than making it cheap. That does not
generalise: a closure arriving as a parameter, stored in an array, or one-of-several cannot be
devirtualised at all — which is exactly why `dispatch-table` (§4.3) reads `-O3` 0.97x.

Full write-up: `bench/findings/bench-algorithms-lambda-hot.md`.

### 4.3 `strings/substr-search` — 8.49x → **5.17x** deno, 28.2x → **17.21x** rust, **0.13x → 0.21x python** · compiler-fixable

> **P4a (#1328) shipped the first-char skip** and measured 1.67x (1114 → 666 ms) against its
> prototyped 1.69x. **P4b (BMH) was measured and REFUTED** — see §5. The row is still a PRIORITY
> loss and still the worst py/vl in the suite.

`String.indexOf` is inlined by `emitStrIndexOf` (`compiler/wasmEmit.vl:7437`) as a textbook naive
O(n·m) scan with **no skip heuristic**, and it re-loads the needle character from its GC array every
iteration — so the overwhelmingly common first-character-mismatch path costs **two** bounds-checked
`array.get`s per candidate position instead of one. Rust (memchr + two-way), V8 (Boyer-Moore-Horspool
with a bad-char table) and CPython (Crochemore-Perrin + Bloom skip) all skip; VL visits all n
positions. The emitter's own doc comment concedes it: *"Mirrors the host's `__string_index_of__`
naive O(n·m) scan"*.

The loop itself is clean — wasm locals, no allocation, no `global.get`, no `ref.cast`, no boxing —
so this is purely an algorithm choice. The inverse control proves it: a **hand-written naive loop in
VL source measures 1225 ms, 11% SLOWER than the builtin's 1103 ms**. The builtin's lowering is good;
the entire gap is the algorithm it refuses to use.

Measured, 480 full 1M-char scans: VL 2.213 ns/char, rust 0.081, deno 0.265, python 0.271. Prototypes
made by disassembling the shipped module, replacing **only** the inlined `indexOf` sequence, and
reassembling (`compiler/**` untouched, both print `3173880`): first-char skip with the needle char
hoisted = **653 ms (1.69x)**, allocation-free; Boyer-Moore-Horspool with a 256-entry table indexed
`c & 255` = **352 ms (3.13x)**. `-O3` is reproducibly 4.4% **worse**.

**A length gate is mandatory:** 3M short-haystack `indexOf` calls = 95 ms (28 ns/call), but 3M BMH
table builds = 275 ms (88 ns each), so unconditional BMH would be a ~4x regression on short strings.

Full write-up: `bench/findings/bench-strings-substr-search.md`.

### 4.4 `algorithms/dispatch-table` — 3.34x → **1.00x** deno, 8.4x → **2.79x** rust · **CLOSED by P2 (#1326)**

> **This is no longer a loss.** P2 measured 2.98–3.23x here and the row went PRIORITY-LOSS → PAR,
> landing at a dead heat with deno. The section is kept because it is the load-bearing evidence for
> *why* the funcref field had to go — its `-O3` reading of 0.97x is what proved the cost was an
> opaque libcall rather than anything binaryen could optimise, which `lambda-hot`'s 11.8x `-O3` gap
> had disguised. **P2's win is bigger at `-O3` than at the default here** (4.75–4.90x), the reverse
> of `lambda-hot`.

**Same root cause as `lambda-hot`**, reached by a different route and *not* rescued by `-O3` (0.97x).
Bisection on the compiler's own WAT (one change each, output unchanged): control 645 ms; drop the
bounds check 606; delete the `ref.cast` 680; delete the closure record entirely, plain `funcref[]`
669; force a single call target so nothing mispredicts 630; **keep all the loads but make the call
direct 106 ms.** Isolation on a loop-invariant struct, 50M iterations: read its **i32** field and
`drop` = 50 ms; read its **funcref** field and `drop` = **563 ms**. That a *dropped* value still
costs proves it is an opaque call, not a load — Cranelift DCEs an unused immutable-field load.

Collector-independent: `VL_GC=auto/tracing/refcount/none` → 520/515/531/539 ms. Not a GC barrier.
Raw call costs with no GC objects: direct 55 ms, `call_ref` off a local 60 ms (+0.1 ns),
`call_indirect` 4-way 111 ms (+1.1 ns).

**Why `-O3` reads 0.97x here:** GUFA + closed-world genuinely removes the env param, the bounds
check, the null check and the cast, narrowing the loop to
`call_ref (struct.get $1 0 (array.get ...))` — and it is still 1329 ms, because that `struct.get` is
still the libcall, now on the *slower* `get_typed` path (engine signature lookup + subtype check).
The emitted wasm is already near-optimal at the wasm level; **only changing what VL stores in the
field can help.**

Per-phase, the axis in one line: going indirect costs Rust 2.1x, V8 2.7x, **VL 5.3x** over the
if/else chain.

Full write-up: `bench/findings/bench-algorithms-dispatch-table.md`.

### 4.5 `arrays/matmul` 2.72 → **2.80** · `arrays/struct-soa` 2.50 → **2.25** · `arrays/reverse-inplace` 2.19 → **1.51** · `algorithms/spectralnorm` 1.53 → **1.48** · `arrays/sort-heap` 1.66 → **1.51** — **the array-indexing family** · mostly runtime-engine

> **P5 (#1333) shipped the 9.9% half of this section** — the list-header hoist — and measured
> `reverse-inplace` −20.6% / `matmul` −7.2%, the family −4% to −21% at default opt. Only
> `reverse-inplace` left the PRIORITY tier. **The family survives intact because its dominant term
> was never ours**: the 3.41x Cranelift `array.get` lowering below is untouched, and §5's P13
> (linear-memory scalar arrays) is the only item that addresses it.

One cause, five benchmarks. Neither `-O3` (1.01x on matmul) nor any hand-written `opt.vl` (0.99x)
moves it, so it is below the source level entirely.

**Cranelift's WasmGC `array.get`/`array.set` lowering in wasmtime 47 is worth 3.41x on this kernel,
and that is 73% of VL's excess.** Per element access wasmtime emits ~23 x86 instructions and 5
conditional branches: a stack-slot **reload** of the `(ref $arr)` local (reference locals live in
stack-map-tracked slots, so `local.get` is a memory load), a null check, a load of the array length
from the GC heap, the wasm-visible bounds check, a three-op loop-invariant object-size overflow
chain, a second implementation-internal object-size bounds check, and an
`end - (obj_size - (idx*8+24))` address dance that never folds into an x86 `[base+idx*8+disp]` mode.
Because the ref SSA value differs each iteration, the readonly length load and the whole overflow
chain cannot be GVN'd or LICM'd. Upstream:
`wasmtime-internal-cranelift-47.0.2/src/func_environ/gc.rs`, `array_elem_addr` (:945) and
`emit_array_size_info`, which carry two explicit TODOs naming exactly this.

**V8 proves it is the engine, not WasmGC.** The *same bytes*, warm TurboFan:

| module | V8 | wasmtime |
|---|--:|--:|
| linear memory | 414.6 ms | 366 ms (wasmtime 1.13x faster) |
| raw `(array (mut f64))` | 423.7 ms | **1249 ms (wasmtime 2.95x slower)** |
| + VL's header struct | 408.4 ms | 1382 ms |
| + VL's `select` len guard | 519.5 ms | 1553 ms |
| VL's actual `main.wasm` | | 1528 ms (== the reconstruction) |

**V8 pays 2% to move this kernel from linear memory to a WasmGC array; wasmtime pays 241%.** V8 also
hoists the header-struct loads for free where wasmtime charges 10.6%.

**The part that is ours is 18.2%**, and 9.9% of it is soundly recoverable today:
`compiler/wasmEmit.vl:6254 emitListIdxGuard` re-loads the list header's backing-array ref
(`struct.get 0`) *and* `len` (`struct.get 1`) on **every single element access**. Bisection
(min-of-11 interleaved): emitted 1527.9 → hoist both into locals across the loop **1376.5 (−9.9%)**
→ also drop the `select` guard 1249.1 (−18.2% cumulative). The remaining 8% needs range analysis to
prove `i < len` from the loop bound; the guard cannot simply be deleted (`len < cap` after `.push`,
and the slack reads zero silently).

Decomposition of VL's 1528 ms: 225 ms (rustc scalar, `-C llvm-args=-vectorize-loops=false`) → ×1.63
= 366 ms (same loop in wasm on linear memory — a reasonable wasm tax) → ×3.41 = 1249 ms (Cranelift
WasmGC array lowering) → ×1.22 = 1528 ms (VL's header struct + len guard). **Rust's own column is
2.27x SIMD** (99 ms vectorised vs 225 ms scalar).

`struct-soa` is the sharpest statement of the family: **VL WINS the AoS side** (`struct-aos` 0.60)
and **loses the SoA side 2.5x**. Reading 2 elements from 2 different `i32[]` per iteration is 2.5x
V8; reading 2 fields from one inline record is fine. That is per-array-access overhead, not layout.
`reverse-inplace` is the purest read — no arithmetic at all, just 4 bounds-checked accesses per
iteration — and its `toplevel.vl` measures identical (1.01x), which rules out the globals cliff.

Full write-up: `bench/findings/bench-arrays-matmul.md`.

### 4.6 `collections/set-ops` 2.51 → **2.32** · `map-string` 2.00 → **2.03** · `word-freq` 1.59 → **1.70** · `map-i32` 1.25 → **1.33** — **the string-hashing family** · compiler-fixable

> **Nothing had shipped against this family when the 08-03 sweep ran, and every row is unmoved
> beyond scoring noise. It is now the largest untouched block of compiler-fixable loss in the
> suite** — four of the fourteen losses, three of them PRIORITY, all four red alerts.
> **P7's 4-wide `__str_hash__` unroll (#1342) landed after this sweep** and is not in these
> numbers; it is worth 1.135x on hash-dominated work, so it moves these rows but does not close
> them. **The hash CACHE — the item that would attack the length-proportionality measured
> below — is still fully open** (§5, P7b).

**All four collections Python red alerts.** Normalised CPython is 1.33x **faster** than VL on
`set-ops` (py/vl 0.75), and VL is only 1.21x / 1.78x / 1.36x ahead on the other three.

**VL recomputes a string's hash on every map/set probe, and the hash is length-proportional over the
`array i32` code-point storage.** V8 and CPython both cache the hash in the string object. Isolated
by differencing r=120 against r=20 passes so string *construction* is fully subtracted, 10M lookups
against a 100k-entry `{[string]: i32}`:

| key length | VL | deno | python |
|---|--:|--:|--:|
| 9 chars | 693 ms (69 ns) | 195 ms (20 ns) | 710 ms |
| 33 chars | 1426 ms (143 ns) | 189 ms (19 ns) | 840 ms |
| 97 chars | 3210 ms (321 ns) | 185 ms (19 ns) | 812 ms |

**VL scales linearly with key length (~2.6 ns per code point); V8 is dead flat; CPython is flat.** A
miss-only control (probe keys prefixed `"Z"` so the compare almost never runs, isolating the *hash*)
reads 377 ms per 10M at length 10 and 1438 ms at length 98 — **the hash alone is 3.8x more expensive
for a 10x longer key**, so it is the hash being recomputed, not the compare.

That `map-i32` — the dedicated **monomorphic i32 key representation** from the B6a/B6b work — still
lands at 1.25x deno and only 1.36x CPython is a separate finding: the specialised rep did not buy
what was expected.

### 4.7 `recursion/mutual` — 2.37x → **1.22x** deno, 2.8x → **1.44x** rust · **CLOSED by P1 (#1324)**

> **This is no longer a loss** — PRIORITY-LOSS → PAR. P1 measured 1.96x here against the 1.97x
> prototyped below, and 2.01x on `recursion/tailcall` against 2.06x prototyped. The prediction in
> this section is the most exactly confirmed one in the document, which is why it is kept verbatim.

Both legs of the cycle are tail calls and **VL emits a plain `call`.** Patching the two
`(return (call $n))` into `(return_call $n)` in VL's **own** emitted module and running it on the
**unmodified** host gives **1.97x** (0.971 s → 0.494 s, byte-identical output) — which closes the
whole gap to deno. `-O3` recovers only 1.23x, by inlining one leg. Same defect as
`recursion/tailcall`, which reads 10.16x of Rust and 2.02x idiom-gap despite *beating* deno.

### 4.8 `strings/int-format` — 1.28x → **1.27x** deno · library-quality

> Unmoved. Nothing has shipped against it.

Two findings. (1) The builtin `toString(i32)` is 1.28x behind V8's `String(v)` — modest. (2) Much
worse: `stdfmt.vl`, which uses `std:fmt`'s pure-VL `toStr()`, measures **4477 ms — 5.3x slower than
the builtin.** `toStr` is the **only** option for `i64`, which the builtin refuses, so **any i64
formatting pays that 5.3x on a path users cannot avoid.**

---

## 5. PERFORMANCE CONSTRAINTS — the actionable list

This is the point of the exercise. Every compiler-fixable item, as a work item naming the file and
function, ranked by **(win × confidence) / effort**. "Prototyped" means a hand-edited version of
VL's own emitted module (or hand-written `.wat` assembled with `wasm-as`) was run on the
**unmodified** host and produced **byte-identical output**.

| # | item | site | measured win | conf | effort |
|---|---|---|--:|---|---|
| ~~**P1**~~ | ~~emit `return_call` in tail position~~ **SHIPPED #1324** | `wasmEmit.vl emitReturnValue` (+ `fbReturnCall` in `emit_bytes.vl`) | **2.01x** tailcall, **1.96x** mutual measured (vs 2.06x / 1.97x prototyped); recursion depth 16.2k → **5M** | **DONE** | — |
| ~~**P2**~~ | ~~closure fat-pointer: drop the `funcref` field, dispatch via `call_indirect` on the id it already stores~~ **SHIPPED #1326** | `emit_sections.vl` (elem segment, struct type); `wasmEmit.vl emitClosureValueCore`, `emitMfInvoke` + the read sites | **4.50–4.68x** lambda-hot, **2.98–3.23x** dispatch-table, **−8.5 to −9.2 ns per `.map` element**, **−51.7 ns per closure allocation** (the filing said 5.4x / 3.3x / −9.4 ns / −41 ns: the two benchmark figures were **too high**, the allocation figure **too low**) | **DONE** | — |
| ~~**P3**~~ | ~~unroll `__str_eq__`'s element loop 8x~~ **SHIPPED #1328** | `emit_sections.vl emitStrEqFnCode` | **2.08x** measured (1970 → 945 ms), vs the 2.17x prototype | **DONE** | — |
| ~~**P4a**~~ | ~~`indexOf`: hoist `needle[0]` + first-char skip~~ **SHIPPED #1328** | `wasmEmit.vl emitStrIndexOf` | **1.67x** measured (1114 → 666 ms), vs the 1.69x prototype | **DONE** | — |
| **P4b** | `indexOf`: Boyer-Moore-Horspool above a length gate | `compiler/wasmEmit.vl emitStrIndexOf` | **REFUTED ON MEASUREMENT (#1333)** — would not clear CPython even at its own prototyped 3.13× | **NOT taken; see below** | M |
| ~~**P5**~~ | ~~hoist the list header's backing ref + `len`~~ **SHIPPED #1333** | `wasmEmit.vl emitListIdxGuard` | **reverse-inplace −20.6%, matmul −7.2%**, whole array family −4% to −21% at default opt | **DONE** | — |
| **P6** | fuse `a / b` and `a % b` on the same operands — lower the remainder as `a − q*b` | i32 div/rem emit in `compiler/wasmEmit.vl` | **1.99x** intdivmod | measured A/B, **SOUNDNESS-GATED** | **S** |
| ~~**P7a**~~ | ~~unroll `__str_hash__`'s FNV walk 4 wide~~ **SHIPPED #1342** | `emit_sections.vl emitStrHashFnCode` (+ `fbStrHashStep`) | **1.135x** measured on hash-dominated insertion (109 → 96 ms); 2.13 → **1.10 ns per code point** on the walk itself | **DONE** | — |
| **P7b** | **cache** a string's hash instead of recomputing it per probe | `compiler/emit_sections.vl emitStrHashFnCode`, `emitMapProbeFnCode`; requires a hash slot in the string rep | filed at up to **4.6x** on long keys; clears 3 of 4 Python red alerts — **both figures predate P7a and neither has been re-measured** | measured (pre-P7a), **site not pinned** | **L** |
| **P8** | `s = s + c` is O(n²) — `__str_concat__` allocates a fresh array and does 2 `array.copy` per append | `compiler/emit_sections.vl:1881 emitStrConcatFnCode`, `compiler/wasmEmit.vl:6647 emitStrConcat` | asymptotic: N-doubling costs VL 3.5x vs 1.6–1.9x elsewhere | measured | **L** |

### What #1328 changed, and what it did NOT

`str-eq` **1970 → 945 ms** and `substr-search` **1114 → 666 ms** (min-of-5 interleaved, load 4.41).
Against CPython, N-normalised — `str-eq`'s Python column carries a documented 8× N reduction,
`substr-search` runs the same N both sides:

| benchmark | CPython | was | now |
|---|--:|--:|--:|
| `strings/str-eq` | 752 ms | 2.6× behind | **1.26× behind** |
| `strings/substr-search` | 148 ms | 7.5× behind | **4.5× behind** |

**Both red alerts are sharply reduced and NEITHER is cleared.** `substr-search` stays 4.5× behind
CPython precisely because **P4b was not taken** — BMH needs a length gate derived from measurement,
and an un-gated skip table is an allocation in a hot path. That is the honest cost of the scope call
and it is why P4b keeps its row.

**#1325's loop-shape gate fired on this change, and it fired on the wrong axis.** It read
`binsearch-probe`'s `none` row moving `5,2,8 → 6,3,8`. Per-function counts: `$1` (bsearch itself)
2 → 2, `$0`/`$3` unchanged, `$4` — the two-string-ref `__str_eq__` — **1 → 2**, which is an unrolled
loop plus its scalar remainder. `binsearch-probe` contains **zero** string operations, so no user
loop moved. **The counter is MODULE-WIDE and cannot separate "the probe's loop rotated" (the 2.40×
defect the gate exists to catch) from "a shared runtime helper gained a loop" (inert here.)**
Tightening it to the probe's own functions is filed at `tests/selfhost_native_release_test.ts`.

### P4b is REFUTED, and the filed gate was wrong (#1333)

Three measurements kill it, and the last one is decisive:

1. **The skip-table BUILD costs 295 ns, not the filed 88** — 622 ms against a 31 ms fill-removed
   control over 2M reps. Allocation-free is easy (a start-initialised global); it is the *fill* that
   costs, and its real enabler, **`array.fill`, has no emitter at all**.
2. **The filed gate `len(sub) >= 2` is wrong.** At m=2 the shift is bounded by 2, so BMH can never
   break even if a table lookup costs twice a compare. The empirically derived gate is
   **`len(s) >= 512 && len(sub) >= 4`**. P4a's real cost is **1.39 ns/position** measured from the
   benchmark — a synthetic sweep read 4.3 and would have flattered BMH by 3×.
3. **It would not clear the red alert anyway.** At the prototype's own 3.13×, `substr-search` goes
   673 → 215 ms against CPython's 150 — still **1.43× behind**. The CPython gap on this benchmark
   does not close with a better search algorithm; it closes with P12 (UTF-8 bytes in linear memory).

*Re-price a filed remedy against the goal, not just against the baseline: a 3× win that still loses
is not the item you think it is.*

### P5's soundness condition, and the sabotage that proves it

A **whitelist whose fall-through is DECLINE**. Accepted: literals, identifiers, operators including
assignment, `o.f`, `x[i]` reads and in-place stores, `is`/`as`, and `if`/`while`/`for`/`return`/
`break`/`continue`/`let`, at any depth, on a binding declared outside the loop, across all four
scalar reps plus ref and string lists. Declined: **any call** (`.push` reallocates, and any call can
reach the list through a parameter, capture or global), any rebinding, nullable receivers, and every
unenumerated shape. A `while`'s condition is held to the body's standard.

Two sabotages give it teeth, and the second is the one that matters: deleting the call-decline makes
the fixture **trap**; neutering the rebind-decline makes it **print 3 instead of 21 at exit 0** —
silently wrong. Verified independently: a loop that pushes mid-iteration and a loop that rebinds its
list both produce identical answers on master and on the shipped compiler.

Instrument note from the same slice: **the noise floor is per-BENCHMARK, not per-rig.**
`push-growth` read +2.9% against the rig's 0.49% floor but only +0.77% against its *own* same-bytes
floor of −2.1%. And the **fuzz A/B is structurally inert for P5** — 800 generated cases contain zero
`while`/`for`/`.push`, so its identical findings are not evidence.

### Two items that must NOT ship as filed

- **P6 is soundness-gated, not merely unscheduled.** The fusion is only valid if it cannot move a
  trap: `i32.rem_s(INT32_MIN, -1)` returns **0** while `i32.div_s(INT32_MIN, -1)` **traps**, and a
  remainder spelled before its quotient can hoist a divide across a side effect. The identity is
  exact; the trap behaviour is not. It needs a sign/edge grid (both operand signs × zero divisor ×
  the `INT32_MIN / -1` overflow) before the 1.99× is real.
- **Scientific-notation literals (`1e30`) need the NUMERIC CONVERSION, not just the lexer.** Widening
  the lexer alone was built and reverted: the value parser does `acc*10 + (c - '0')` over every
  character, so `e` becomes a digit worth 53 and the literal silently evaluates wrong — `1e3` → 633,
  `1e0` → 630, `2e1` → 731, `1E2` → 312, `1.5e-3` → 1.6303. A silently wrong number is a worse defect
  than a parse error. See #1330.
| **P9** | inline small leaf functions in the **default** build | the `-O3`-gap family | **2.90x** struct-field, **1.80x** map-filter-reduce, 8–13% sort-heap | measured via `-O3` A/B | **L** |
| **P10** | top-level `const` emits a **mutable** wasm global | global emit path | not separately measured; blocks constant-folding a loop bound | `wasm-dis` witness | **XS** |
| **P11** | fix the two `-O3` **regressions** before the release profile is trusted | `docs/internals/opt-profile-design.md` pipeline | `mixed-width` **2.43x SLOWER**, `binsearch` **1.23x SLOWER** | measured | **S** (gate) |
| **P12** | UTF-8 bytes in linear memory for `string` | representation | **27.7x** on the compare itself; would also fix P7b and P8 | prototyped at `.wat` level | **XL** |
| **P13** | linear-memory backing store for scalar arrays (`i32[]`/`i64[]`/`f32[]`/`f64[]`) | representation | **3.41x** on matmul's kernel; sidesteps the Cranelift bug entirely | prototyped at `.wat` level | **XL** |

### P1 — `return_call` — **SHIPPED #1324**

> Measured on the shipped emitter, interleaved min-of-5: `tailcall` 1179.8 → **585.5 ms (2.01x)**
> at the default and 1161.8 → 581.3 (2.00x) at `-O3`; `mutual` 1557.6 → **793.4 ms (1.96x)**. The
> emitted module for `bench/recursion/tailcall` is **byte-identical to the hand-patched prototype**
> described below. `digestTail(5_000_000, 0)` now prints instead of trapping, pinned as
> `tests/cases/functions/tail-call-depth.vl`. Full write-up: `perf-program.md` §12. The filing is
> kept because the prototype it describes is what the shipped emitter reproduces byte-for-byte.

VL never emitted wasm `return_call` for a call in tail position. `wasm-dis` of `bench/recursion/tailcall/main.wasm` shows
`(return (call $0 (i32.sub (local.get $0) (i32.const 1)) ...))`. Rebuilding that same module with the
one instruction changed via `wasm-as --enable-tail-call` and running it on the unmodified `vl` host:
**1.313 s → 0.638 s (2.06x)** on `tailcall` and **0.971 s → 0.494 s (1.97x)** on `mutual`, both
byte-identical output. It also lifts the recursion depth cap: `print(digestTail(5_000_000, 0))` traps
with `wasm trap: call stack exhausted` today and prints `407392` with `return_call`.

**No host change is needed** — `scripts/vl-host/src/main.rs` sets `wasm_gc` and
`wasm_function_references` but never touches `wasm_tail_call`, and the patched module runs anyway
(the proposal is on by default in wasmtime 47). `-O3` does not fix it: `wasm-dis` of the `-O3` module
still shows `call $0`. `emit_bytes.vl` has no `fbReturnCall`; that is the one new byte emitter.

It matches `opt.vl` exactly (594.5 ms vs the prototype's 638 ms, inside noise), so **no user
contortion would be needed after the fix** — see §6.

### P2 — closure dispatch (the largest blast radius) — **SHIPPED #1326**

> Measured across three interleaved min-of-5 passes: `lambda-hot` **4.50–4.68x**, `dispatch-table`
> **2.98–3.23x** (and **4.75–4.90x** at `-O3`), **−8.5 to −9.2 ns per `.map` element**, closure
> creation **52.6 → 0.87 ns**. Two of the filed figures did not survive: `lambda-hot`'s 5.4x and
> `dispatch-table`'s 3.3x were **too high**, while −41 ns per allocation was **26% too low**. The
> claim "the self-hosted compiler itself uses closures" was **refuted**. Full write-up:
> `perf-program.md` §13.

Stop putting the code pointer in a GC-struct `funcref` field. **Field 2 of the closure record already
holds `gImports + fe`, the wasm function index** (`fbI32Const(gImports + fe)`, kept only as the `==`
identity token), and `compiler/emit_sections.vl:2490-2509` already emits an element segment listing
every user function at exactly that index — as a *declarative* segment (flags `0x03`), purely to
legalise `ref.func`. Four edits:

1. `emit_sections.vl:2490-2509` — promote the declarative segment to a **`funcref` table of
   `gImports + n` entries plus an ACTIVE segment at offset `gImports`**, over the same
   already-computed index vector.
2. `emit_sections.vl:3536-3552` — **drop field 0** from the closure struct (`{ env: structref, id: i32 }`).
   Dropping rather than merely not-reading is strictly better: it also removes the ~41 ns
   `intern_func_ref_for_gc_heap` at every closure *creation*.
3. `wasmEmit.vl:1362 emitClosureValueCore` — drop the `fbRefFunc(gImports + fe)`; field 2 unchanged.
4. The read sites (`wasmEmit.vl:9308`, `:11181 emitMfInvoke`, `:14549`) — replace
   `fbStructGet(cloStructIdx, 0); fbRefCast(sig); fbCallRef(sig)` with
   `fbStructGet(cloStructIdx, 2); fbCallIndirect(tableIdx, sig)`. `emit_bytes.vl` has no
   `fbCallIndirect` either; that is the second new byte emitter.

**Soundness is preserved, not weakened.** `call_indirect` takes the same type index and performs the
same runtime signature check the `ref.cast` was performing, and traps on mismatch, so every existing
floor keeps its meaning. The interned `$fnsig` functypes and the whole `cloSigKeys`/`cloSigKeyExt`
machinery are untouched. Function-value `==` already compares the id field.

Prototyped in WAT against the same wasmtime: `lambda-hot` phase 3 1020.5 → ~146 ms (7.0x), phase 4
1121.2 → ~160 ms (7.0x), whole benchmark 2258.6 → ~415 ms (5.4x); `dispatch-table` phase 2 623 →
136 ms (4.6x), phase 3 569 → 151 ms (3.8x), whole benchmark 1255 → 382 ms (3.3x), which moves VL
from 3.1x **slower** than deno to **faster** than deno. Table size is irrelevant to the win (a
4096-entry table measured 134 ms), so it scales to a real program's whole function set.

> **Do NOT "fix" this by typing field 0 more precisely — measured 14% SLOWER** (it takes wasmtime's
> `get_typed` path with an engine subtype check).

**Complementary, cheaper, strictly better where it applies:** hoist the closure unpack out of loops
when the closure expression is a local not reassigned in the loop — measured 1072.7 → 101.5 ms
(10.6x). Both together give ~380 ms.

**Prioritise `emitMfInvoke` regardless.** It pays the 9.4 ns libcall **once per element**, confirmed
in the disassembly of a 10M-element map, so **every idiomatic `xs.map(f)` / `xs.filter(f)` in VL is
carrying it today** — including inside the self-hosted compiler.

### P3 — `emitStrEqFnCode`

Emit an 8x-unrolled element loop with an xor/or accumulator plus a scalar remainder loop, keeping the
`ref.eq` and length gates exactly as they are. Whole benchmark 2014 → 927 ms; per phase: identity
32→34 (noise, `ref.eq` still short-circuits), equal-content 748→347 (2.16x), differ-at-index-0
400→212 (1.89x — it improves *even though* unrolling does 7 wasted loads on an early mismatch),
differ-at-last 783→358 (2.19x). **No phase regresses.** Independently confirmed in the source
language: a pure-VL `streq8()` with the same unroll takes phase B from 735 → 344 ms, matching the
`.wat` prototype's 346 ms.

While in that function: the loop is currently `if (i>=n) then {} else { ... br }` — an if/else with
an **empty then-arm** around a `br` to the loop header. A bottom-tested `br_if $done` loop is the
idiomatic shape; it measured inside noise (821 vs 838 ms), so do it for readability, not perf.

`__str_eq__` is one of the compiler's own hottest helpers (its `ref.eq` fast path was worth −3.8% of
a self-compile), so **re-run the self-compile ladder — this should show there too.**

### P4 — `emitStrIndexOf`

Step 1, unconditional and zero-risk: hoist `needle[0]` into a scratch local and make the outer loop a
single-load first-character skip. Allocation-free, ~10 emitted instructions, one extra i32 scratch
slot, no threshold needed. **1.69x.**

Step 2, gated: escalate to Boyer-Moore-Horspool above `len(s) >= 64 && len(sub) >= 2`. 256-entry
table via `array.new`, indexed `c & 255` — **sound for code-point strings without a range check,
since aliasing can only produce a SMALLER, always-safe shift**. Reuse the already-typed-`$0`
`strScratchBase + 2` ref slot so only one new i32 slot is needed (frame width at
`compiler/emit_sections.vl:689` / `compiler/emit_bytes.vl:854`). **3.13x.** The gate is mandatory —
88 ns table build vs 28 ns for an entire short search. Instrumented shift quality: 874,147 positions
examined per 16-needle pass (~109k of 1M per full scan, average shift 9.2).

**Do NOT file this against `-O3`, and do NOT pursue an i8 string representation for it** — narrowing
the element from i32 to i8 is worth only 1.26x (792 → 630 ms) and is not worth the project.

### P5 — `emitListIdxGuard`

Cache the list header's backing-array ref and `len` in locals across a loop body that neither
reassigns the binding nor can reallocate it (no `.push`, no call that could reach it). matmul's inner
loop has zero calls so the analysis is trivial. **This is the transform V8 performs for free** (408 vs
424 ms = noise) where wasmtime charges 10.6%. `wasm-opt -O3` recovers none of it — it will not hoist
a `struct.get` past an `array.set` it cannot prove non-aliasing.

### P7 was filed as ONE item and is TWO. Do not read the shipped number as the filed one.

**P7 was filed as "cache a string's hash instead of recomputing it per probe", at up to 4.6x.
What shipped under the name P7 is not that.** #1342 shipped a 4-wide unroll of the FNV walk, worth
1.135x. The cache is untouched and still carries its own, much larger, unrealised number. They are
split here as **P7a** (shipped) and **P7b** (open) so the two can never again be mistaken for each
other.

#### P7a — `__str_hash__` unrolls FOUR WIDE — **SHIPPED #1342**

`emitStrHashFnCode` hashed one code point per loop iteration; it now does four, with a scalar
remainder loop for the tail — the same shape `__str_eq__` took in P3. The step is factored into
`fbStrHashStep(k)` and **shared** by the unrolled block and the remainder, so the two cannot drift
into hashing differently (that failure mode is a silently wrong hash, not a crash). `lim = n - 4`
is a **subtraction** deliberately: `n` is an `array.len`, so a gate written `i + 4 <= n` could wrap
on a maximal-length string.

| | min |
|---|--:|
| master | 109 ms |
| shipped | **96 ms** |
| | **1.135x** |

Hash-dominated insertion (30k distinct long string keys × 10 rounds), interleaved min-of-9, outputs
asserted identical, **taken at load 3.86 on a shared box, so it is a lower bound** — and it is above
the suite's 7% noise floor. On a 1k-entry / 8M-lookup probe at 46-char keys the walk itself goes
**2.13 → 1.10 ns per code point**.

**FNV is a serial dependency chain** — each `i32.mul` waits on the previous `h` — so the unroll
cannot overlap the arithmetic; what it removes is per-element loop control, plus hoisting `n`
(a reference local lives in a stack-map slot, so `local.get 0; array.len` is a memory load every
iteration). **Widening to eight is measurably WORSE and no further unroll can help**: at ~3
cycles/point the loop is now `i32.mul`-latency-bound, not overhead-bound.

**#1325's module-wide loop-shape gate fired again, on `__str_hash__` this time**, and was verified
per function rather than bumped — `binsearch-probe` contains zero string operations and never calls
the helper, so the added loop is unreachable from it. That is the **second** false positive from the
same counter (P3's unroll was the first); the tightening filed at
`tests/selfhost_native_release_test.ts` is now twice-evidenced.

#### P7b — the hash CACHE (site still not pinned; be honest about that) — **OPEN**

**Nothing about the cache shipped.** The witness is the key-length sweep in §4.6, which is
unambiguous about the *behaviour*: VL scales linearly with key length (~2.6 ns per code point
pre-P7a) where V8 and CPython are flat. The *implementation* was never traced to a line:
`emitStrHashFnCode` computes a masked non-negative FNV-1a over the code-point array and
`emitMapProbeFnCode` calls it per probe. Note `emitMapProbeI32FnCode` already has a **stored-hash**
notion, so the map side may already be half-built; **what is missing is a place to cache the hash on
the string itself.** That is a representation change (a mutable `hash` slot alongside the code-point
array, or P12's linear-memory string), which is why this is L and not S.

**Re-price it before taking it.** The filed "up to 4.6x on long keys / clears 3 of 4 Python red
alerts" was derived from the §4.6 sweep, which is **pre-P7a**: P7a already took the per-code-point
walk roughly in half, so the length-proportionality P7b attacks is smaller than it was and the
residual has not been measured. P7a's own instrumentation puts a further bound on it — **at short
keys the whole walk is ~11 ns of a ~63 ns probe**, so a cache cannot be worth more than that on
short-key workloads however perfect it is. The long-key case is where the item lives; that is the
measurement to take first.

### P11 — the `-O3` regressions. **NOT the release profile's fault, and the name is misleading.**

A release profile that makes a benchmark 2.43x slower is a finding in its own right.
`arith/mixed-width`: 195.4 → 474.3 ms. `arrays/binsearch`: 1464.3 → 1802.1 ms. `-O3` is also a
**wash or worse on the entire arith and arrays categories** and costs ~380 ms of build time against
~9 ms plain.

**#1325 RULED THIS UPSTREAM, and the original diagnosis above — "`wasm-opt --closed-world -O3
--gufa` is actively destroying the mixed-width cast sequence" — is refuted.** Bare `wasm-opt -O`
carries the regression *identically*: plain 205 ms · `--closed-world` 209 · `--gufa` 205 · **bare
`-O` 488**. No flag in the release profile is responsible. Binaryen rotates every loop and Cranelift
then spills the carried values; V8 does not. The failure is gated by loop **shape**, and the fix is
not ours.

**That gate's counter is MODULE-WIDE** (`tests/selfhost_native_release_test.ts`) — it fired on #1328
because `__str_eq__` gained an unroll remainder, and again on #1342 because `__str_hash__` did,
while the probe it was supposed to be watching (`binsearch-probe`, zero string ops) was untouched
both times. Get per-function loop counts before believing it.

The three-rung sweep in §2.4a confirms the ruling on a wider population — seven benchmarks are worse
at BOTH optimized rungs, not two — **and separates out a second class P11 does not cover**:
`arrays/sort-heap`, where `-O` is the best rung by 1.32x and `-O3` specifically gives the win back.
That one IS a profile question rather than an upstream one. `run.sh` now raises `OPT-LOSES` and
`O3-WORSE-THAN-O` as distinct flags so the two never merge again.

### Not ours — track, do not chase inside `compiler/**`

- **Cranelift `array_elem_addr` / `emit_array_size_info`** (§4.5). File upstream: fold the
  wasm-visible bounds check into the internal object-size check, and keep reference locals in
  registers so the length load and overflow chain can be GVN'd/LICM'd. Until it lands, **~3.4x on
  every hot `T[]` element loop is a known platform ceiling.**
- **`get_interned_func_ref`** (§4.2). wasmtime's own TODO says they want to remove it. P2 routes
  around it rather than waiting.

---

## 6. IDIOM VS HACK

**Every entry here is a DEFECT.** The project's goal is that users must not need hacks to get good
performance, so a gap between `main.vl` and a contorted variant is filed, never recommended. `opt.vl`
exists as *documentation of the gap*.

> **Superseded where the shipped work closed a gap.** This table is the 08-02 sweep; the 08-03
> variant table (`bench/results/summary.md`, "Extra VL spellings") reads:
>
> | benchmark | gap 08-02 | gap 08-03 | |
> |---|--:|--:|---|
> | `algorithms/lambda-hot` opt | 8.98x | **2.03x** | P2 |
> | `recursion/tailcall` opt | 2.02x | **1.00x** | **P1 CLOSED IT EXACTLY**, as the row below predicted |
> | `arith/f64-accum` main_global | 1.55x | **0.99x** | the globals cliff is GONE on f64 |
> | `arith/i64-accum` main_global | 1.41x | **1.16x** | reduced, still surviving |
> | `arith/i32-accum` opt | 2.05x | 2.16x | unmoved |
> | `arith/intdivmod` opt | 2.03x | 2.03x | unmoved — P6 is still open and soundness-gated |
> | `collections/struct-array-scan` opt | 1.37x | 1.35x | unmoved |
> | `strings/slice-extract` opt | 1.31x | 1.30x | unmoved |
> | `strings/int-format` stdfmt | 5.3x | 5.4x | unmoved |
>
> `strings/str-eq` inverts: its `opt.vl` is now **slower** than the idiom (0.74x), because P3 gave
> the compiler the unroll the hack existed to supply. The `str-eq streq8` and `substr-search` BMH
> rows below were never in a sweep's variant table (§6's own preamble says so) and have not been
> re-measured.

Rows are from the recorded sweep's variant table unless noted. Two are **not**:
`bench/strings/str-eq/opt.vl` and the `substr-search` BMH probe were written by the follow-up
diagnoses *after* the sweep, so their absolutes come from those runs' own interleaved min-of-N
(which read `str-eq` at 2014 ms where the sweep reads 1894 ms — §2.3: read the ratios, not the
absolutes) and they do not appear in `bench/results/summary.md`.

| benchmark | idiomatic | variant | ratio | the "hack" | ruling |
|---|--:|--:|--:|---|---|
| `algorithms/lambda-hot` | 2155.7 | opt 240.1 | **8.98x** | *stop using a lambda* — lift the body to a named top-level function | **not a language-design defect**: there is no VL spelling of a lambda that avoids it. Closes entirely with P2. |
| `strings/int-format` | 845.1 | stdfmt 4477.5 | **5.3x** (inverse) | the *idiomatic library* path is the slow one | `std:fmt`'s `toStr()` is 5.3x the builtin, and is the **only** option for i64. Library-quality defect on an unavoidable path. |
| `arith/i32-accum` | 320.0 | opt 155.8 | **2.05x** | hand-unrolled 4-accumulator loop | the simplest loop in the suite has a 2x hand-optimisation available. `-O3` recovers only 1.11x. |
| `arith/intdivmod` | 483.6 | opt 238.3 | **2.03x** | `const q = i / d; sum + q + (i - q * d)` | P6. `-O3` recovers nothing (1.02x). deno is equally unfused (2.489 ns/iter), so VL merely *ties* JS here. |
| `recursion/tailcall` | 1202.5 | opt 594.5 | **2.02x** | hand-written accumulator loop | P1 matches `opt.vl` **exactly**, so after the fix no contortion is needed at all. |
| `strings/str-eq` | 2014 | streq8 1259 | **1.60x** | user-space 8x-unrolled compare | the hack is **strictly worse than the compiler fix and cannot be made equal**: VL exposes no reference-identity operator, so a user-space compare cannot reproduce `__str_eq__`'s `ref.eq` fast path and pays a full 64-element scan on the identity phase (that is the entire 1259 vs 927 difference). It wins 3 phases and loses the 4th. **Only the compiler can have both.** |
| `arith/f64-accum` | 535.9 | main_global 830.4 | **1.55x** | *avoid top-level `let`* | the **globals cliff**, surviving half — see below. |
| `arith/i64-accum` | 295.9 | main_global 416.3 | **1.41x** | same | the other surviving half. |
| `collections/struct-array-scan` | 752.9 | opt 551.0 | **1.37x** | destroy the record type into parallel `i32[]` columns | a clear WIN against deno that is still leaving a third behind. See §8 (no inline-struct array rep). |
| `strings/slice-extract` | 1296.1 | opt 988.5 | **1.31x** | hand-spelled window | PAR against deno, 31% left on the floor. `-O3` recovers 2%. |
| `strings/substr-search` | 1103 | BMH in VL source 423 | **2.61x** | hand-write Boyer-Moore-Horspool in user code | the inverse control matters: a hand-written **naive** loop is 1225 ms, i.e. 11% *slower* than the builtin — so the builtin's inlining is good and the whole 2.61x is the algorithm it refuses to use. P4. |
| `algorithms/dispatch-table` | 623 (phase 2) | 104 (if/else chain) | **6.0x** | *do not use a dispatch table* | the workaround does not survive contact with a registry of 50 handlers. P2. |

### The top-level-`let`-becomes-a-global cliff (fix in flight)

Briefed as 1.6–3.2x. **At this commit it is largely GONE and it is not this suite's to fix** (#1321
landed in this tree), but it was measured on 8 probe pairs and it **survives on the wide scalars**:

| probe pair | ratio 08-02 | ratio 08-03 | |
|---|--:|--:|---|
| `arith/f64-accum` main vs `main_global` | **1.55x** | **0.99x** | **now GONE** |
| `arith/i64-accum` main vs `main_global` | **1.41x** | **1.16x** | **reduced, still survives** |
| `arrays/fill-sum` main vs `toplevel` | 1.00x | 0.95x | gone |
| `arrays/reverse-inplace` main vs `toplevel` | 1.01x | 0.98x | gone |
| `collections/map-i32` main vs `toplevel` | 0.95x | 1.09x | gone |
| `collections/struct-field` main vs `toplevel` | 1.01x | 1.03x | gone |
| `strings/char-scan` main vs `globals` | 0.97x | 0.87x | gone |
| `strings/token-count` main vs `globals` | 1.05x | 1.05x | gone |

The seven recursion benchmarks that spell their hot loop at top level are **not** penalised for it
(`flatcall` top-level 1.477 s vs the same code in a function 1.470 s). On 08-02 writing a script at
top level still cost 1.4–1.55x on i64/f64 accumulation; **on 08-03 the f64 half is inside the noise
floor and only the i64 half survives, at 1.16x.** `vl build -O3` was never a workaround:
`wasm-dis` of the `-O3` module still counts all six `global.get`/`global.set` in the loop body.

Related and unfixed: **top-level `const` emits a MUTABLE wasm global** (P10) —
`(global $global$0 (mut i64) (i64.const 1000000000))` for `const n: i64 = 1_000_000_000`, so the
trip count is re-read every iteration and nothing can constant-fold it.

### The `-O3` gap is an idiom-vs-hack defect too

Where `vl build -O3` is much faster than the default build, **the default build is the idiom and
users are paying for not knowing a flag**:

| benchmark | default (08-02) | `-O3` (08-02) | gap | gap on 08-03 |
|---|--:|--:|--:|---|
| `algorithms/lambda-hot` | 2155.7 | 182.5 | **11.81x** (`-O3` beats deno) | **3.01x** — P2 closed most of it in the DEFAULT build |
| `collections/struct-field` | 997.0 | 343.8 | **2.90x** (default LOSES to deno; `-O3` BEATS rustc `-O`) | **2.92x** — unmoved, and now the largest `-O3` gap in the suite |
| `algorithms/map-filter-reduce` | 923.0 | 513.0 | **1.80x** | **1.12x** — P2 |
| `recursion/mutual` | 1560.3 | 1269.9 | 1.23x | **1.00x** — P1 |
| `algorithms/dispatch-table` | 1179.3 | 1216.1 | 0.97x | **1.45x** — P2's win is bigger at `-O3` here |

`vl run` has **no `-O` flag at all** (wasm-opt is wired only into `vl build -O/-O3`,
`scripts/vl-host/src/main.rs:1355-1372`), so **the default path every user and the self-hosted
compiler take always pays this.**

---

## 7. HEADROOM VS RUST

Median `vl/rust` is **2.29x, geomean 2.65x** on the 08-03 sweep (it was 2.49x / 3.04x on 08-02) — a
reasonable place for a WasmGC language. The tail is where the information is. **After discounting
the nine auto-vectorised rows (§2.6), the largest genuine gaps are** (the `08-02` ranking, with the
current figure alongside):

| benchmark | vl/rust 08-02 | vl/rust 08-03 | how much is SIMD width | what is left |
|---|--:|--:|---|---|
| `strings/str-eq` | 50.09 | **24.19** | none (Rust's is SIMD `memcmp`, but VL has no bulk path at all) | P3 shipped; representation (P12) |
| `strings/substr-search` | 28.22 | **17.21** | none (algorithm) | P4a shipped, P4b refuted; representation |
| `algorithms/lambda-hot` | 19.05 | **4.60** | none | **P2 shipped** |
| `arrays/matmul` | 14.83 | **14.47** | **2.27x** | Cranelift + P13 (P5 shipped) |
| `arrays/struct-soa` | 12.01 | **10.61** | 42 packed ops in `main::main` | Cranelift (P5 shipped) |
| `arrays/fill-sum` | 11.14 | **9.07** | 54 packed ops | Cranelift (P5 shipped) |
| `recursion/tailcall` | 10.16 | **5.05** | none | **P1 shipped** |
| `algorithms/dispatch-table` | 8.39 | **2.79** | none | **P2 shipped** |
| `arrays/reverse-inplace` | 8.02 | **7.38** | 18 packed ops | Cranelift (P5 shipped) |
| `algorithms/map-filter-reduce` | 7.61 | **4.66** | none | P2 shipped; P9 |

**The shape of this tail is the clearest single statement of what the five shipped items did.**
Every row whose "what is left" named an emitter item moved by 2–3x; every row whose remainder is
Cranelift's `array.get` lowering barely moved at all. The residual headroom against Rust is now
concentrated almost entirely in the two representation items (P12, P13) and in SIMD width.

### "WasmGC cannot do this" — the hard ceiling

- **There is no bulk compare.** WasmGC has no instruction that compares more than one array element
  at a time. A 64-char string compare is 64 iterations, full stop. This is why `str-eq`'s ladder
  bottoms out at 59 ns in the GC-array world and only reaches 4.5 ns by leaving it (§4.1).
- **There is no bulk find.** Same reason `indexOf` cannot vectorise; ~1.15–1.31 ns per character
  *touched* is the hard floor even after BMH (~14x off Rust's 0.081 ns/byte `memchr`).
- **No SIMD anywhere in the pipeline.** VL emits no vector instructions; neither Cranelift nor
  `wasm-opt` will introduce them. On a trivial reduction VL's emitted wasm is already minimal (a
  4-instruction loop body) and its scalar issue rate is near-optimal (~1.5 cycles/iter), so the
  remaining gap to `rustc -O` on `i32-accum` is **entirely SIMD width**.
- **Reference locals are stack slots.** Cranelift keeps `(ref $arr)` locals in stack-map-tracked
  slots, so `local.get` on an array is a memory load, which is what defeats GVN/LICM on the length
  and the overflow chain (§4.5). This is arguably a Cranelift bug rather than a WasmGC law — V8 does
  not pay it — but VL cannot fix it.

### "We have not done this yet" — the roadmap

In dependency order, largest first. **The two items that headed this list — P2 closure dispatch and
P1 `return_call` — have SHIPPED (#1326, #1324), along with P3, P4a (#1328), P5 (#1333) and P7a
(#1342). What remains:**

1. **P12 UTF-8 strings in linear memory** — 27.7x measured on the compare itself; subsumes P7b and
   P8, and is the rest of P3. `std/buffer.vl` already has the machinery. This is the single largest
   item on the board and it is a language-representation decision, not an emitter change.
2. **P13 linear-memory backing for scalar arrays** — 3.41x measured; sidesteps the Cranelift bug
   entirely, at the cost of explicit bounds checks and losing GC integration for scalar arrays.
   Deserves its own design note. **P5 shipped the 9.9% that was available above it; this is the
   3.41x underneath.**
3. **P9 inlining in the default build** — `-O3` proves 2.9x is sitting there on `struct-field`.
4. **P7b the hash cache** — the string-hashing family (§4.6) is now the largest untouched block of
   compiler-fixable loss in the suite, and P7a's unroll did not dent it. Re-price before taking it.
5. **P6/P10** — small, certain, cheap. **P6 is soundness-gated** (see above), not merely
   unscheduled.

**P4b (BMH for `indexOf`) is REFUTED on measurement and is not on this list.**

**Where VL is already at or past native, for calibration:** `collections/struct-alloc` at **0.42x of
Rust** (VL is 2.4x *faster* than `rustc -O` on allocation-heavy tree building — wasmtime's bump
allocator beats malloc), `arith/floatops` 0.79x, `arith/convert` 0.91x, `arith/f64-accum` 0.97x.
Scalar float and integer arithmetic have no headroom problem.

---

## 8. What VL could not do at all

These are correctness and expressiveness findings that fell out of a performance exercise. They are
recorded here so they are not lost; each is reproducible as written.

### 8.1 `vl check`-clean EMIT FAILURES (compile-time holes)

| what | witness | error |
|---|---|---|
| **Bare map read bound to a local, then narrowed with `!= null`, for an i32-keyed or i32-valued map.** Blocked the idiomatic hit/miss spelling in three benchmarks (`map-string`, `map-i32`, `word-freq`), all rewritten to a `?? -1` sentinel. Works for `{[string]: string}` and `{[string]: Struct}`; the plain-i32 value type is the gap `tests/cases/maps/bare-read-narrow-nullable-mono-map.vl` does not reach. | `const m: {[string]: i32} = Map()` … `const v = m["a"]` … `if v != null { print(v) }` | `emit error: emitProgram: bare null needs a struct-typed context` — while `vl check` on the same file reports **`Checked 1 file, no errors.`** |
| **A bare `return` (no value) in a void function.** Blocked the natural spelling of heapsort's sift-down early exit; all four languages were restructured to a `cont` flag to preserve equivalence. Note the diagnostic points at the **function** (1:9), not at the `return`. | `function f(x: i32) { if x > 0 { return } print(x) }` | `emit error: emitProgram: bare return is not supported` — `vl check` exits 0 |
| **Importing anything from `std:fmt`** breaks a function with an annotated array return whose body holds a multi-element array literal with non-literal field initialisers. Cost the idiomatic number formatter in `nbody` and `spectralnorm`; both carry a longhand digit renderer instead. Removing the import makes it emit; removing the return annotation does not help. | `import { toStr } from "std:fmt"` + `function makeBodies(): Body[] { const bodies: Body[] = [{x:0.0,…}, {x:1.0,…}] return bodies }` | `emit error: emitProgram: object literal matches no union variant` — `vl check`: `Found 0 errors, 1 warning.`, exit 0 |
| **A numeric intrinsic is not callable from any function in a module that uses function values.** This makes float algorithms and closures **mutually exclusive in one module**, which is why `nbody` and `spectralnorm` have no higher-order variant — the two `*-closures` benchmarks were dropped as inexpressible. | `function work(a: f64) { sqrt(a) }` + `const f = (v: i32) => v * 2` in the same module | `emit error: the numeric intrinsic 'sqrt' is mistaken for a captured variable here — it is not yet callable from a lambda, nor from a named function in a module that uses function values` |

> Four separate `vl check`-clean emit failures found by writing 46 ordinary programs. This is
> consistent with the standing ruling that **`vl check` is blind to the emitter**; `vl build` is the
> usable channel.

### 8.2 Benchmarks that could not be written

| dropped | why |
|---|---|
| **split-based tokenisation** | VL has no `split` on string (`"a,b,c".split(",")` → `no method '.split' on string`), and `std:fmt`'s pure-VL `split()` allocates a fresh substring at **every scan position** to test the separator. `token-count` uses a hand-written state machine in all four instead so the algorithm stays identical. |
| **iterate-all-occurrences search** | `indexOf` takes no start offset (`s.indexOf("o", 5)` → `indexOf expects 1 argument, got 2`, `compiler/typecheck.vl:12339`), so the only spelling re-slices the remainder — **quadratic**, and it would measure allocation rather than search. `substr-search` searches many different needles instead. |
| **set algebra** | Rust has `HashSet::intersection`, Python has `a & b`, V8 2.9 has the ES2025 Set methods; **VL has none** (`unknown property 'intersection' on {[string]: boolean}`). `set-ops` uses an explicit membership loop in all four. |
| **word-freq over one large corpus string** | Not constructible: `s = s + x` in a loop is **quadratic** — 25k appends 0.56 s, 50k 2.8 s (5.0x), 100k 19.7 s (7.0x), 200k timed out past 60 s. All three spellings (top-level, `for i in 0 to n`, appending a variable) are equally quadratic. Redesigned as 4000 short documents. |
| **`nbody-closures` / `spectralnorm-closures`** | Inexpressible — see the `sqrt`-in-a-module-with-function-values emit error above. |
| **a library-sort comparison** | **VL has no sort.** `std/array.vl` provides `indexOf`/`lastIndexOf`/`includes`/`count`/`reduce`/`reverse`/`concat`/`mapIndexed` and there is no sort intrinsic in the emitter, so there is no VL side to put in the comparison. `sort-heap` is hand-written heapsort in all four. |
| **transcendental math** | Deliberately out of scope: VL has no transcendentals by design (no wasm opcode computes one, so any `sin` would be a library whose last bit is a policy choice — `compiler/typecheck.vl:11804`). Benchmarking it would compare libms. |
| **`i64-accum` with BigInt in JS** | Rejected before writing — a BigInt spelling measures V8's bignum library, not integer arithmetic. The benchmark is sized so the i64 sum stays under 2⁵³ where plain JS doubles are exact; that is the honest idiomatic JS spelling. |

Also dropped, but as *benchmark bugs* rather than VL findings — recorded because they are the shape
of trap this suite kept hitting: **five benchmark drafts were VOID for Rust** because `rustc -O`
folded them (`deeprec` draft 1 folded to a constant *and* LLVM's accumulator-recursion transform
turned `n + f(n-1)` into a loop; `flatcall` draft 1 vectorised at 0.11 ns/iter because masking
distributes over xor; `mutual` draft 1 collapsed to an O(1) parity test; `mutual` draft 2 and
`treewalk` draft 1 hoisted a loop-invariant pure call). Each was rewritten with a genuine serial
dependency, not dropped.

### 8.3 Missing surface, catalogued

- **String methods are four members** — `.slice` / `.indexOf` / `.includes` / `.charCodeAt`, plus
  `.length` and `s[i]`. `.startsWith`, `.endsWith`, `.trim`, `.replace`, `.repeat`, `.padStart`,
  `.lastIndexOf`, `.concat`, `.at`, `.codePointAt`, `.toUpperCase`, `.split` **all reject
  identically** (`no method '.X' on string`).
- **`toString` refuses i64 and f64.** `toString(x: i64)` → `toString expects an i32 or boolean, got
  i64`; same for f64. **There is no float formatter in the language or in std** (`std/fmt.vl` states
  f64→string is "deliberately absent"), so the only way to see a float is `print`, which cannot be
  captured into a string. Every benchmark that prints a float carries its own ~35-line fixed-point
  formatter.
- **No single-probe map upsert** — no `entry` / `getOrInsert`, so a read-modify-write count is two
  probes.
- **No inline-struct array representation.** `Rec[]` is an array of **references** with one pointer
  chase per element; there is no way to ask for the contiguous layout Rust's `Vec<Rec>` gets for
  free. The only workaround is to destroy the record type into parallel `i32[]` columns — measured
  1.35x, and **exactly the kind of hack the project says users must not need** (§6).
- **No exponent form for float literals.** `1e18`, `4.84143144246472090e+00` are parse errors
  (`expected ')' but found 'e18'`), so every Benchmarks-Game constant table had to be hand-expanded
  into plain decimal. Correctness was fine — VL's decimal-to-double conversion is correctly rounded
  and all four languages agreed bit-for-bit — but the reference programs cannot be pasted in.
- **No range `for`.** Every VL loop in `arith/` is a `while` with a hand-written counter while all
  three peers use their idiomatic range loop. It costs no performance (the emitted wasm is identical
  in shape) but it is the one place the VL sources cannot be spelled idiomatically.
- **No number→string coercion in `+`** — `"x" + n` → `operator '+' is not defined for string and i32`.
- **Recursion depth ceiling ~16.2k frames** for a 2-parameter non-tail function, ~32.2k tail-shaped.
  VL is level with V8 (15,625 / 16,113 / 32,409 on the same three shapes) and ~30x below Rust
  (~500k–600k frames on an 8 MiB stack). Every limit was found by bisection, not estimated.
  **P1 removes this ceiling entirely for tail calls.**

### 8.4 Two correctness bugs found in passing

- **`print` drops the sign of negative zero.** The value is correct — `f64bits(-0.0)` returns
  `0x8000000000000000` and `1.0 / -0.0` evaluates to `-Infinity` — **only the formatter is wrong.**
  JS and Rust both print `-0`. This is a live stdout-equivalence hazard for any cross-language float
  benchmark: a program can be bit-exact and still print differently.
- **`vl fmt` destroys comments inside an array literal.** It hoists every one out to after the
  literal and pads them with blank lines. Semantics preserved, source is not. This is why no `.vl`
  file in `bench/algorithms/` is fmt-clean — running `vl fmt -w` would scramble `nbody`'s
  `// Sun` / `// Jupiter` body-table labels.

---

## 9. How to re-run, and what an authoritative pass requires

```sh
bench/run.sh                          # full sweep, 5 reps (~30 min)
BENCH_REPS=7 bench/run.sh             # what produced this document (~40 min)
BENCH_FILTER='strings/' bench/run.sh  # ERE over "<category>/<name>"
BENCH_QUICK=1 bench/run.sh            # 1-rep smoke test — NOT a measurement (see below)
BENCH_PIN=none bench/run.sh           # disable taskset pinning
BENCH_REPORT_ONLY=1 bench/run.sh      # regenerate results.json/summary.md from raw.ndjson,
                                      #   measuring nothing (for report-format changes)
```

`run.sh` owns `bench/results/` and rewrites all three files. It exports `VL_WASM_OPT` itself
(§2.4). Everything is deterministic given the same box.

**An authoritative pass requires all five of these. This pass had the first three.**

1. **Prebuilt modules only.** `vl build` then `vl run x.wasm`, never `vl run x.vl` (§2.1).
2. **min-of-N or median-of-N, N ≥ 7**, with a repeat probe to establish the noise floor. A 1-rep
   sweep on this box was **5.7x wrong** on one row.
3. **`VL_WASM_OPT` set**, plus the `cmp` that raises `O3-NOOP` — otherwise the entire `-O3` column
   is a re-run of the unoptimised module (§2.4).
4. **EXCLUSIVE USE OF THE BOX.** This is the one this pass did not have. Measured 2.5–4x swings on
   identical binaries when a second timing job ran, *even pinned*. Nothing here is authoritative
   until it is re-run idle. Check `uptime` before starting and after finishing.
5. **Disassembly of every `main.rs`** whose `vl/rust` ratio is quoted as a codegen finding. The
   prescribed N-vs-2N scale test **cannot see auto-vectorisation** and 9 of 46 benchmarks were
   affected (§2.6). Count packed ops inside `main::main` against the std-library baseline, and take
   a `-C target-cpu=native` column wherever the ratio is close.

**Additionally worth fixing in the harness itself:**

- Six extra `.vl` files sit outside the declared `main.vl`/`opt.vl` layout — `main_global.vl`
  (`arith/i64-accum`, `arith/f64-accum`), `toplevel.vl` (`arrays/fill-sum`,
  `arrays/reverse-inplace`, `collections/map-i32`, `collections/struct-field`), `globals.vl`
  (`strings/char-scan`, `strings/token-count`), `stdfmt.vl` (`strings/int-format`). `run.sh`
  discovers them and measures them as their own configurations with per-variant `expect<Variant>`
  keys, which is the right behaviour, but the layout contract in `bench/README.md` should say so
  explicitly. The globals probes are now **largely obsolete** (§6) and should be retired down to the
  two pairs where the cliff survives.
- Raise N on the sub-floor columns where it is possible without breaking the scale test:
  `strings/substr-search` at `PASSES=240` puts Rust at ~195 ms and VL at ~4.3 s (`expect` needs
  re-recording). `strings/str-eq` **cannot** be raised — VL would exceed ~9 s — so its correction
  must stay subtractive.
- Raise `nPython` ~3x on `arith/f64-accum` (71.8 ms, 17% CPython startup) and `arith/intdivmod`
  (99.4 ms, 13%) before normalising; their reductions are 100x, so the launcher share is multiplied
  by 100.

---

## Appendix — the five deep dives

`bench/findings/` carries the full bisection logs, the hand-written `.wat` ladders and the exact
commands for the five worst rows:

- `bench-strings-str-eq.md` — the 6-rung compare ladder and the `emitStrEqFnCode` prototype
- `bench-algorithms-lambda-hot.md` — the funcref-field bisection and the `call_indirect` prototype
- `bench-algorithms-dispatch-table.md` — the same defect via arrays and struct fields, plus why
  `-O3` cannot help
- `bench-strings-substr-search.md` — the first-char-skip and BMH prototypes, and the short-string
  hazard
- `bench-arrays-matmul.md` — the 4-level representation ladder and the V8-vs-wasmtime control that
  pins the cause on Cranelift

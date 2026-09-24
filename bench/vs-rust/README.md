# vs-rust — the "match Rust → wasm" scoreboard

The owner's stated perf target for VL is to **match Rust compiled to wasm**. This directory is
the permanent, reproducible instrument for that target: six kernels, written once in VL and once
in Rust, built with each language's own toolchain, and run side by side in the same V8 (Deno)
process so the only variable is the code the two compilers produced.

**Provenance.** The kernels (`k.vl`, `k.rs`) were written by **plumb** (a VL consumer
transliterating Warcraft III to wasm) while chasing exactly this question, filed as `PL-037` in
plumb's own issue log (`docs/vl-issues.md`, a separate repository), and shared with the VL
project for use here. They keep their original header comment (which now also credits plumb) —
keep the VL and Rust versions semantically identical; a change to one without the matching
change to the other invalidates the comparison.

## What's here

| File | What |
|---|---|
| `k.vl` | The six kernels in VL. |
| `k.rs` | The same six kernels in Rust, built as a `cdylib` for `wasm32-wasip1`. |
| `k-rs.wasm` | **Committed prebuilt** Rust module, so the suite runs with no Rust toolchain installed. |
| `k-rs.build-info.json` | The exact `rustc` version, date and command that built the committed `k-rs.wasm`. |
| `bench.ts` | The runner: builds, runs, compares, reports. |
| `baseline.json` | The standing ratio scoreboard `--check` compares against (not a gate — see below). |

## The kernels

| kernel | what it measures |
|---|---|
| `hash` | `SStrHash`-shaped byte loop, two table loads per byte |
| `matChain` | 4×4 f32 matrix chain (`m = m * a`, n times), scalar, `for i in 0 until 4` loops |
| `sort` | quicksort of `n` i32s (xorshift32-seeded) in linear memory |
| `mix` | translated-register-shaped: i64 state, i64 multiplies, 64-bit loads/stores at `D + (x & 1023) * 8` |
| `array` | a growable `i32[]`: push `n`, then indexed-sum it 20 times |
| `map` | an i32-keyed `Map`: insert `n` keys, then probe each 10 times (Rust side: `HashMap` with an Fx-style multiplicative hasher, what a Rust program would actually reach for) |

Each kernel is exported from both modules under the same name and takes the same argument
tuple, so `bench.ts` can call `vl[name](...args)` and `rust[name](...args)` identically. Every
kernel returns an accumulator so nothing folds away as dead code.

## Running it

```sh
# from the repo root
deno run --allow-read --allow-run --allow-write --allow-env bench/vs-rust/bench.ts
deno run -A bench/vs-rust/bench.ts --json                 # machine-readable
deno run -A bench/vs-rust/bench.ts --check                # diff against baseline.json
deno run -A bench/vs-rust/bench.ts --reps 15               # more reps, tighter min-of-N
deno run -A bench/vs-rust/bench.ts --vl /path/to/vl        # a specific vl binary
deno run -A bench/vs-rust/bench.ts --no-rustc              # force the committed k-rs.wasm
deno run -A bench/vs-rust/bench.ts --write-baseline        # overwrite baseline.json
```

| flag | default | meaning |
|---|---|---|
| `--reps <n>` | 5 | timed calls per kernel per language; the runner keeps the minimum (best-of-N) |
| `--json` | off | print one JSON object instead of the table |
| `--check` | off | print each kernel's ratio against `baseline.json`, with a `%` delta |
| `--vl <path>` | see below | the `vl` binary to build the VL side with |
| `--rustc <path>` | `rustc` | the Rust compiler to try first |
| `--no-rustc` | off | skip the toolchain probe and always use the committed `k-rs.wasm` |
| `--write-baseline` | off | overwrite `baseline.json` with the ratios just measured, tagged with the current commit and date |

`vl` resolution, in order: `--vl`, the `VL` environment variable, then
`scripts/vl-host/target/release/vl` (the dev binary every other gate in this repo builds and
uses), then `dist/vl`, then whatever `vl` resolves to on `PATH`. There is no compiler-side work
in this suite — it always measures **whatever `vl` you point it at**, which is the point: every
perf lane can run this against its own build and report the effect on the "match Rust" target
directly.

### Build commands, exactly

VL (plumb's original PL-037 repro flags — `--import-memory` so `bench.ts` can hand both modules
one shared `WebAssembly.Memory`; the heap window is inert here since no kernel calls `Buffer()`,
kept only so this command matches the filed repro byte-for-byte):

```sh
vl build bench/vs-rust/k.vl --import-memory --heap-base=0x100000 --heap-limit=0x8000000 -O -o k-vl.wasm
```

Rust:

```sh
rustc --edition 2021 --target wasm32-wasip1 --crate-type cdylib -C opt-level=3 -C panic=abort bench/vs-rust/k.rs -o k-rs.wasm
```

### The Rust side, with or without a toolchain

If `rustc` is on `PATH` and its `--print target-list` includes `wasm32-wasip1`, `bench.ts`
rebuilds `k.rs` fresh into a temp file on every run — so a local Rust toolchain change is always
reflected. Otherwise (or under `--no-rustc`) it falls back to the **committed**
`bench/vs-rust/k-rs.wasm`, so the suite runs on a box with no Rust installed at all, and reports
that module's provenance from `k-rs.build-info.json` rather than assuming it matches whatever
`rustc --version` prints locally.

To refresh the committed artifact after editing `k.rs`, rebuild with the command above from
inside `bench/vs-rust/`, then update every field in `k-rs.build-info.json` (`rustcVersion`,
`date`, `command`, `bytes`) — nothing re-derives it automatically, on purpose, so a stale
provenance file is a diff someone has to write, not a silent drift.

## Methodology

- Both modules are instantiated in the **same Deno (V8) process** — `bench.ts` uses the shared
  host-import ABI (`compiler/vlHostImports.ts`) for the VL side and a no-op WASI preview1 stub
  for the Rust side (none of these kernels call back into the host).
- Each kernel is timed **best-of-N** (`performance.now()` around the call), never the mean — a
  noisy neighbour can only ever add time, so the minimum is the closest a single number gets to
  the kernel's true cost.
- **Every run checks VL and Rust agree** on the kernel's return value; a disagreement is a
  correctness bug, printed as `MISMATCH`, and the process exits non-zero (independent of
  `--check`, which is about the *ratio*, not correctness).
- `ns/op` divides by the same "units" plumb's original `bench.ts` used (calls × inner-loop
  trips), so these numbers are directly comparable to the PL-037 filing.

## `--check` and `baseline.json` — informational, not a gate

`baseline.json` holds one ratio per kernel, tagged with the commit and date it was measured at.
`--check` diffs the current run against it and prints a `%` delta. **This is deliberately not a
CI gate.** The box these numbers come from is shared with other work, and a single run's ratio
can move by double digits under load alone (see the stability note below) — a hard threshold
would either be so loose it catches nothing or so tight it reds on contention, not on a real
regression. Read `--check`'s output as a trend across runs and PRs, not a verdict on any one of
them. `--write-baseline` is how a maintainer deliberately moves the standing number, the same way
`comment-budget.py --write-baseline` moves that ratchet — in the same PR as whatever justifies
the change.

## Results

Measured 2026-09-24 at commit `5c97d7e32b08` (master tip), `vl 0.1.0 (host ABI 2)`, `rustc 1.94.0
(4a4ef493e 2026-03-02)` (freshly built, not the committed fallback), Deno 2.9.6 / V8
15.0.245.2, `--reps 15` (the box was under concurrent load; 15 reps' min tracked the filed
PL-037 numbers far more tightly than the default 5 — see the stability note):

| kernel | VL ns | Rust ns | VL/Rust |
|---|---|---|---|
| hash | 1.05 | 1.18 | 0.90 |
| sort | 66.15 | 65.22 | 1.01 |
| mix | 2.36 | 1.49 | 1.59 |
| array | 0.44 | 0.23 | 1.96 |
| matChain | 32.01 | 13.80 | 2.32 |
| map | 12.37 | 4.16 | 2.97 |

Run a second time immediately after, same commit and binaries:

| kernel | VL ns | Rust ns | VL/Rust |
|---|---|---|---|
| hash | 1.05 | 1.18 | 0.89 |
| sort | 67.17 | 72.17 | 0.93 |
| mix | 2.42 | 1.50 | 1.62 |
| array | 0.45 | 0.23 | 1.95 |
| matChain | 31.99 | 13.75 | 2.33 |
| map | 12.35 | 4.27 | 2.89 |

Every ratio agrees within noise (largest swing: `sort`, 1.01 → 0.93 — both inside the `PAR` band
the cross-runtime suite's own thresholds use), and both runs land within a few percent of the
PL-037 numbers filed at `27f5b9b2c` — no regression on this target since that measurement.

**A note on this box's noise.** At the default `--reps 5`, under the load this box happened to be
under while these were taken, single runs read as far off as `map` 4.38 (vs. 2.90 committed) and
`matChain` 2.62. Raising `--reps` tightens the min-of-N considerably (matches the general
cross-runtime suite's own finding, `bench/README.md` §Noise floor) — `--reps 15` reproduced the
filed table to within a few percent twice in a row. Treat any single low-rep run on a busy box
with suspicion; this is exactly why `--check` is informational rather than a gate.

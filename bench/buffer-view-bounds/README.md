# `buffer-view-bounds` — what the typed-view bounds check costs in a hot loop

The measurement behind webcraft **P1.4** ("bounds-check ergonomics"). The full
write-up, with the disassembly it rests on, is `docs/internals/buffer-design.md`
**§M**; the answer in the consumer's own words is `docs/webcraft-requirements.md`
under P1.4. This directory is the apparatus and the recorded numbers.

Not a `bench/run.sh` benchmark: there are no Rust/JS/Python twins to compare
against, because the question is not "how fast is VL" but "what does one VL
spelling cost against another VL spelling of the same loop". `bench/run.sh`
discovers `bench/<category>/<name>/meta.json` and never sees this directory.

## Running it

    bench/buffer-view-bounds/run.sh          # 13 kernels x 3 rungs, min-of-5
    VB_REPS=9 bench/buffer-view-bounds/run.sh
    VB_PIN=none bench/buffer-view-bounds/run.sh

Needs the release `vl` binary, `build/vl-compiler.wasm`, and a `wasm-opt` (it
refuses to run without one rather than silently measuring `-O0` three times).
Takes about 8 minutes at the default 5 reps.

## The kernels

Four SHAPES x three SPELLINGS, plus a fourth spelling on `scale`. Every source
runs N = 1,048,576 elements x R = 501 trips = 525,336,576 inner-loop iterations,
so the shapes are directly comparable per iteration.

| shape | the loop | accesses / iteration |
|---|---|---|
| `scale` | one f32 column, read-modify-write: `v[i] = v[i] * k` | 2 |
| `reduce` | one i32 column, read-only: `s = s + g[i]` | 1 |
| `axpy` | two views in one loop: `y[i] = y[i] + x[i] * dt` | 3 |
| `rows` | inner loop over one row of a 1024x1024 i32 grid: `g[rb + c]` | 2 |

| spelling | what it is | check? | calls / access |
|---|---|---|---|
| `view` | the fenced canonical — the typed-view bracket `v[i]` | yes | 2 |
| `accessor` | the same kernel as `v.getF32(i)` / `v.setF32(i, …)` | yes | 1 |
| `buf` | the unfenced twin — `Buf.loadF32`/`storeF32`, byte offsets | **no** | 1 |
| `hoist` | the fast pattern — base + count out of the loop, bare intrinsics | **no** | 0 |

`accessor` is what makes the check separable: it and `buf` execute the same one
call per access, and only one of them checks. `view` additionally pays the
bracket's forwarding hop (`"[]"` calls `getF32`), which both wasm-opt rungs
inline away.

## Method

- **Prebuilt modules.** `vl run <src>` carries ~300 ms of compile time; only
  `vl run <prebuilt.wasm>` measures the kernel.
- **An R=0 control build of every configuration**, from the identical source with
  the trip count zeroed. It allocates and seeds the same 4-8 MiB and runs no
  trips; its wall time is subtracted, which removes process startup,
  instantiation, memory growth and seeding.
- **Interleaved min-of-N** — the rep loop is outside the configuration loop, so a
  drifting machine perturbs every row equally.
- **The output of every run is asserted**, and each shape prints a value that
  differs between R>0 and R=0 (`scale` ends at 2.0 after an odd number of
  alternating x2 / x0.5 trips and at 1.0 with none; the others end at the trip
  count or at N x trips). A kernel that was optimized away reports as WRONG, not
  as fast. Belt and braces: a run must also exceed its own control by >=3x.
- **`vl build -O3` with no wasm-opt writes the UNOPTIMIZED module and exits 0**,
  so `VL_WASM_OPT` is set explicitly and every rung's module size is asserted to
  have moved off the unoptimized one.

## Recorded result

ns per inner-loop iteration, control subtracted, min-of-5 interleaved,
`taskset -c 2-5`, wasmtime via the Rust host. `-O3` is `vl build -O3` =
`--closed-world -O3 --gufa -O3`.

| shape | spelling | (none) | `-O` | `-O3` |
|---|---|---|---|---|
| scale | view | 2.773 | 1.661 | 0.444 |
| scale | accessor | 1.918 | 1.598 | 0.464 |
| scale | buf | 1.622 | 1.214 | 0.466 |
| scale | **hoist** | **0.326** | **0.419** | **0.428** |
| reduce | view | 1.583 | 0.355 | 0.344 |
| reduce | buf | 0.951 | 0.424 | 0.419 |
| reduce | **hoist** | **0.296** | **0.276** | **0.291** |
| axpy | view | 4.320 | 2.642 | 1.713 |
| axpy | buf | 2.607 | 2.199 | 0.703 |
| axpy | **hoist** | **0.444** | **0.487** | **0.493** |
| rows | view | 2.645 | 1.699 | 0.581 |
| rows | buf | 1.730 | 1.670 | 0.680 |
| rows | **hoist** | **0.407** | **0.459** | **0.500** |

**Noise floor:** a full independent re-run moved these by 1-14%, worst on the
smallest numbers (`rows-view` `-O3` 0.508 -> 0.581). Do not read anything inside
15% off this table; the conclusions in §M are all drawn from 3x gaps or from
differences the disassembly independently explains.

Four readings, in the order they matter:

1. **The check itself is 0.15 ns per access** (accessor - buf at `none`, matched
   call counts) and at `-O3` it is ~0.02 ns per compare — under a tenth of a
   cycle, on a loop holding one view.
2. **What costs at `-O3` is the view descriptor's own `base`/`length` being
   reloaded per access.** That is the `axpy` row (3.5x over hoisted, seven
   `struct.get`s per element in the disassembly) and it does NOT happen on the
   other three, because with one view of a width live GUFA folds both fields.
   The fenced spelling's cost is therefore a whole-program property.
3. **`-O` is a third of `-O3`.** The release profile is where the wrapper calls
   disappear.
4. **The hoisted spelling is 0.30-0.50 ns at every rung**, never varying by more
   than 25% between them. It is the only predictable one.

## What is pinned, and what is not

Timing cannot be gated in CI. What IS gated is the SHAPE the timing explains —
`tests/buffer_view_bounds_shape_test.ts` builds every kernel here at every rung
and counts the `unreachable` / `call` / `struct.get` instructions inside loops
against exact goldens, plus three contract assertions (the fence survives `-O3`,
the unfenced twin has no check, the fast pattern is bare). Those numbers are what
make the table above mean something rather than merely be true on one machine.

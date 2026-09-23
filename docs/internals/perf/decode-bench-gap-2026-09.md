# The decoder gap, round two: VL vs Rust→wasm on the same engine, 2026-09-23

plumb's x86 decoder benchmark (`tools/decode-bench.vl`, 10,584,797 instructions of war3.exe's
`.pdata` functions, identical output from every build) ran at **~1.9×** a faithful Rust port
compiled to `wasm32-wasip1` (plumb `vl-probes/decode-rs/RESULTS.md`, 2026-09-23). This document
attributes what is left of that gap after the fixes in `docs/internals/perf-decoder-gap-2026-09.md`
(the GC heap sizing, the host at opt-level 3, the compiled-module cache).

**The short answer.**

* **The gap is specific to wasmtime.** On V8 (node 24) the same VL module decodes **at parity with**
  the Rust port (0.92× its median CPU). VL runs **47% fewer wasm operators** than Rust (8.19 G vs
  15.42 G per pass) and still takes 1.7× as long on wasmtime, so the gap is what each operator
  costs, not how many operators there are.
* **About 45% is the copying collector re-copying a large live set.** The benchmark holds
  131,503 `Func` structs (`pdata(pe)`) for the whole run. wasmtime's collector is not
  generational, so each of the 123 collections per pass copies all of them again. Rust keeps
  the same data as one contiguous `Vec<Func>` and never touches it.
* **About 20–25% is the decoder state `D`**, a heap struct that is allocated per instruction and
  updated through `struct.set` for every byte read. Inlining the helpers and scalar-replacing
  `D` (binaryen `--inlining` + `--heap2local`) removes it. This is lane L4.
* **About 6% is `__str_eq__`**, called two to four times per instruction. This is lane L9.
* **About 25% is residual**: building the operand list plus Cranelift's WasmGC codegen. With L4
  and L9 applied and the operand list removed, VL decodes at Rust-faithful speed while Rust still
  builds its `Vec`.

Machine: 24 cores, WSL2, shared box (load 5–40 during the session, so every figure below is a
median over interleaved rounds). Pins: master `327b15510` seed and host (wasmtime 47.0.2),
wasmtime CLI 49.0.0, node 24.11.1 (V8), binaryen 130, plumb's pre-built `decode-bench.wasm`.

## 1 · Timings

Seconds of user CPU **per pass** (a decode of all 10.58 M instructions). These are medians of
6–12 interleaved rounds, with the multi-pass runs divided by the number of passes.

| engine | VL default | VL `-O3` | Rust faithful | Rust idiomatic |
| --- | --- | --- | --- | --- |
| wasmtime (VL: `vl run` on 47.0.2; Rust: CLI 49.0.0) | **0.97–0.99** | 0.86 | **0.56–0.60** | 0.42–0.46 |
| wasmtime 47.0.2 (Rust in a scratch WASI harness, same engine version as VL) | | | 0.59 | |
| V8 (node 24; VL through a JS host, Rust through `node:wasi`) | **0.57** (min 0.48) | 0.64 | **0.63** | 0.46 |

* **Start-up is gone.** A `passes=0` run costs 0.00 s of user CPU for VL, both for `vl run x.vl`
  and for a prebuilt `.wasm` (the compiled-module cache, lane L5). It costs 0.01 s for the Rust
  wasm on the wasmtime CLI and 0.20 s in the uncached 47 harness. `vl run src` and
  `vl run built.wasm` time the same, so the whole of plumb's 1.00–1.07 s is steady-state decode.
* **The engine version does not matter.** Rust's wasm on wasmtime 47 (0.59) and on 49 (0.56–0.60)
  are the same within noise, so VL's host version is not part of the gap.
* **Operator counts** (wasmtime fuel, one unit per operator, `passes=1` minus `passes=0`): VL
  default runs 8.186 G operators per pass, VL `-O3` 8.206 G, and Rust faithful 15.42 G. Rust's
  extra operators are cheap linear-memory i32 work (most likely shadow-stack traffic and copying the
  `Insn` into its `Box`). VL's are `struct.get`/`struct.set` through the GC heap, and allocations.
* **The V8 figures are total process CPU.** They include V8's concurrent GC marking and tier-up
  threads, which work in VL's favour. Read them as "at parity", not as "VL is faster".

## 2 · Where the time goes (profile)

The profile comes from wasmtime's `GuestProfiler` on the user program: a scratch host armed the
program's store as well as the compiler's (§6), with a `--names` build and 3 passes, 3,182
samples.

| function | self % | what it is |
| --- | --- | --- |
| `decode` | 47.4 | the decoder body: 5,236 wat lines, 334 `struct.get`, 105 `struct.set`, 26 `struct.new`, 22 `array.new` |
| `__str_eq__` | 15.2 | `mn == "(bad)"` in the bench loop and in `decode`, and the group-table compares |
| `byte` | 13.1 | `__load_u8__(d.p + d.i); d.i += 1`, with `d` on the heap |
| `oprSize` / `sizeOf` | 8.9 / 6.7 | three-line selectors over `d.osz16` |
| `readImm`, `memOperand`, `gpr` | 2.9, 2.0, 1.6 | |
| `__start__` (the bench loop) | 1.9 | |

**Epoch sampling over-attributes small functions.** A sample can only land at a function entry or
a loop back-edge, so the helpers' self time is inflated. The removal experiments in §3 are what
the shares rest on. The same caveat is in `perf-decoder-gap-2026-09.md` §4.

The op mix in `decode` shows no `ref.cast`, no `ref.test` and no `br_on_*`: no union or boxing
work is on the hot path. It has 27 `ref.as_non_null`, all from list reads whose backing array has
nullable slots, 12 index clamps (`select`), one `i32.wrap_i64` and no `i64.extend`. (The
`readImm` extends are in the callee, and Rust has the same ones.) Every `const` is an immutable
global with a constant initialiser, which wasmtime folds (lane L10 has landed).

## 3 · Attribution

The gap: VL default 0.97–0.99 s minus Rust faithful 0.56–0.60 s is **≈ 0.42 s per pass**. Each
row removes one cost from the VL module or source and is timed against its base in the same
rounds. The Δ column is the median of the per-round ratios, applied to the base's median.

| # | category | Δ per pass | share of gap | evidence (experiment → median ratio to its base) |
| --- | --- | --- | --- | --- |
| A1 | **GC: re-copying a long-lived live set** (non-generational copying collector) | **−0.19 to −0.20** | **~45%** | `flat`: the bench walks `.pdata` from the image instead of holding `Func[]`, 131,503 GC structs → 0.797–0.81 vs default (three runs). Starting the heap larger instead: 128 MiB 0.888, 256 MiB 0.840 (26 collections instead of 123), 1 GiB 0.854. On `flat`, a 1 GiB heap moves nothing (1.00–1.05), so collections with a small live set cost almost nothing |
| A2 | **Non-escaping struct kept on the heap** (`D`: 1 allocation per instruction, a `struct.get` + `struct.set` per byte) | −0.08 to −0.11 | ~20–25% | on `flat`, binaryen `--inlining` (aimfs 400, `decode` itself not inlined) + `--heap2local` → 0.863–0.912. `D` is fully scalar-replaced: no `struct.new` of its type is left |
| A3 | **Missed inlining** of the five leaf helpers, *alone* | 0 to −0.04 | 0–10% | `--inlining` with aimfs 60 → 0.949–0.994. With aimfs 400 (also `memOperand` and `__str_eq__`) but no `--heap2local` → 1.000. Inlining pays through what it enables (A2), not by itself. wasmtime's own inliner (`Inlining::Yes`) → 0.957–0.980 |
| A4 | **String equality as an out-of-line call** (`== "(bad)"` and friends, 2–4 per instruction) | −0.02 to −0.03 | ~6% | an inline length test in front of each `==` against a literal (`s.length == 5 && s == "(bad)"`) → 0.967–0.968, for the 4 sites in `decode` and the 1 in the bench loop |
| A5 | **Operand-list construction** (the `[]` literal allocates a wrapper and a zero-length array; the first push allocates capacity 4 and copies; then an `Opnd` struct per operand) | up to −0.13 if removed entirely | see A6 | a list that is never pushed → 0.830–0.843. This is a ceiling, not a lane: Rust faithful builds its `Vec` too (Rust idiomatic is 0.14 s faster than faithful). Sharing one immutable zero-length backing array (safe, since push grows when `len == cap`) → 0.987. `Opnd` packed into an `i32` instead of a struct → 1.026–1.031, no gain |
| A6 | **Residual: list construction plus Cranelift's WasmGC codegen** | ≈ −0.11 | ~25% | A2+A3+A4 together (`combo`) → 0.847–0.858, which is 0.67 s against Rust's 0.56–0.60. Adding A5's list removal (`combonoops`) → 0.723, which is 0.58 s: at Rust faithful's speed while Rust still builds its `Vec`. The per-access codegen (a null check on a non-null `(ref $D)`, the GC heap base re-derived through two loads, a frame per call) is disassembled in `perf-decoder-gap-2026-09.md` §4, and V8 does not pay it |

Measured, and **not** a cause here:

| category | result |
| --- | --- |
| bounds checks: VL's logical-length index clamp (`select(i, -1, i <u len)`) | removing all 250 (a stack-`.wat` rewrite) → 0.994–1.034, noise |
| casts (`ref.cast`/`ref.test`) from unions and boxing | none on the hot path |
| i32/i64 conversions | the same as Rust's (`readImm` sign-extends into `i64` fields in both) |
| string or print work in the loop | none besides A4. `mn` is a shared literal, and the `"v" + mn` concatenation runs only for VEX instructions |
| string literals (the data-segment lane) | literals are module globals built once in the start function, and the hot loop only does `global.get`. This benchmark cannot see that lane |
| module `const`s as globals | already immutable and folded |
| per-`Opnd` boxing (array-of-structs vs Rust's contiguous `Vec<Opnd>`) | A5: 0% |
| loop-invariant work | nothing material: the bench loop is 1.9% self |

The shares add up to about 100% (0.19 + 0.09 + 0.025 + 0.11 ≈ 0.42 s), but the rows interact:
A2 also cuts about 50 allocated bytes per instruction, and fewer bytes means fewer collections,
so A1 and A2 compound.

## 4 · `-O` / `-O3`, and V8

* **wasmtime.** `vl build -O3` gets 0.86 s against 0.97 s (−12%). On the `flat` source, `-O3`
  gets −13%, about what A2+A3 get by hand. binaryen does do the scalar replacement, but only
  inside its release profile, and `vl run x.vl` never runs binaryen. `-O3` does nothing for A1.
* **V8.** VL's default module is at parity with Rust faithful (median ratio 0.92). `-O3` is
  slightly worse than the default (1.01), even with L8's hot-callee marking, which suggests the
  run-once tiering effect is not fully gone. Holding `Func[]` costs V8 nothing measurable
  (`flat` 0.87 vs default 0.92, inside noise), because V8's collector is generational. **VL's
  main target already runs this program as fast as Rust does.** The remaining gap is about VL
  on wasmtime: `vl run`, `vl test`, and any server-side host.

## 5 · Proposed lanes, ranked

| rank | lane | expected win on this benchmark (wasmtime) | effort | risk | fits |
| --- | --- | --- | --- | --- | --- |
| 1 | **Size the GC heap from the live set, not just the allocation rate.** Upstream: wasmtime's copying collector should grow when a collection's survivors are a large fraction of the semispace (L3(a) of the previous round, now with a second witness: the live set, not the heap floor). Host stopgap: `vl run`'s initial heap from 64 MiB to 256 MiB | **−16%** (0.97 → 0.80–0.81); up to −20% for a program shaped like `flat` | host: S. Upstream: S to file, the fix is theirs | host: +192 MiB committed for any program that allocates that much in total (the RSS table in the previous round's §3 applies unchanged). `vl test` keeps 8 MiB | `perf-decoder-gap-2026-09.md` L1/L3(a). Host stopgap **BUILT** (`gc-heap-policy-2026-09.md`); upstream issue drafted (`wasmtime-copying-heap-growth-issue.md`) |
| 2 | **L4: emit-time inlining of small leaf functions plus scalar replacement of non-escaping structs.** `D` is the textbook case: built in `decode`, passed only to helpers that are candidates for inlining, never stored | **−10 to −14%**, and fewer collections as a side effect | M–L: needs an escape rule and the inliner to run first. A struct passed to a non-inlined call escapes | medium: an escape check has to be exact about closures, `self` arguments and returns. Needs a byte-identical-output check on the corpus plus the rep-fuzz gate | L4 (queued) |
| 3 | **L9: an inline length test (and `ref.eq`) in front of `__str_eq__` for `==` against a literal** | **−3%** | S | low: a pure pre-check, the call stays the fallback | L9 (queued) |
| 4 | **Host: turn on wasmtime's inliner** (`Config::compiler_inlining(Inlining::Yes)`) on the user-program engine | −2 to −4% (the previous round measured 0% on an older module) | S (one line) | low for correctness. It costs compile time on a cold cache (cached since L5); measure `p0` before landing | new, host-side |
| 5 | **Cheaper `[]`**: point a list literal with no elements at one shared immutable zero-length backing array per element type, allocating only at the first push | −1% | S | low, since push already grows at `len == cap`. Check every path that writes through a list's backing array without the grow test (`list[i] = v` at `i < len` cannot reach it, because len is 0) | new, small |
| 6 | **Advice to plumb, no compiler change**: walk `.pdata` from the image, or keep `begin`/`end` in two `i32[]`, rather than holding 131 k small structs for the whole run | **−20%** today, on wasmtime only | S, their side | none | PL-014 follow-up |
| — | string-literal data segments | 0% here (the literals are start-time globals) | | | queued lane, no effect on this benchmark |
| — | removing the index clamp, unboxing `Opnd`, folding consts | 0% measured | | | do not schedule on this benchmark's evidence |

L4 and L1 compound. After lanes 1–3 the benchmark would sit near 0.65 s per pass against Rust's
0.56–0.60 s, about 1.1–1.2×. What is left is Cranelift's per-access cost on WasmGC, which is the
engine's to fix (the previous round's L3(b)–(d)).

**Found on the way, not filed.** The following program is `vl check`-clean (rc 0) and then fails
in the emitter with `emitProgram: object literal field count does not match struct` (a clause-2
violation by construction). A statement-position `{}` inside an `if` arm is typed as an empty
statement block by the checker and lowered as an object literal by the emitter:

```vl
type Insn = { len: i32 }
function f(x: i32): Insn {
  const ins: Insn = { len: x }
  if x > 0 {
    {}
  } else {
    {}
  }
  ins
}
print(f(3).len)
```

## 6 · How to reproduce

All instruments were kept out of the tree. Each one's shape, so it can be rebuilt:

* **Program profiling and fuel on the VL side.** A copy of `scripts/vl-host` built to its own
  `--target-dir`, with four changes. `gc_engine` enables epoch interruption under
  `$VL_PROFILE_GUEST` and fuel under `$VL_FUEL`, and takes `$VL_HEAP_MB` and `$VL_INLINE`.
  `instantiate_program` calls `start_guest_profile` and `arm_guest_profile` on the program's
  store, which makes `vl run x.wasm` profile the program instead of the compiler. After the run,
  `run_program_with` prints the fuel consumed. Rank the profile with `scripts/profile-rank.py`.
* **Rust on the same engine version.** A 40-line binary built against `wasmtime = "=47.0.2"` and
  `wasmtime-wasi = "=47.0.2"` (`p1::add_to_linker_sync`, one preopened directory, optional fuel).
* **V8.** Twin sources with the args hard-coded, since JS cannot build the `u8[]` that
  `__args_get__` returns. `wasm-dis`, then `(start $f)` becomes `(export "main" (func $f))`, then
  `wasm-as --all-features --disable-custom-descriptors`. A node script serves `__fs_size__` and
  `__fs_read_into__` for one fixed file and stubs every other import, and runs the Rust wasm
  through `node:wasi`.
* **The experiments.** Source variants are regex edits of a copy of plumb's `src/x86.vl` (the
  length guard, the packed `Opnd`, the never-pushed list). Module variants are `wasm-opt -g`
  passes (`--inlining` with `-aimfs 60/400` and `--no-inline=decode*`, then `--heap2local`) and
  two text rewrites: dropping the `i32.const -1 … i32.lt_u; select` clamp from `wasm-tools print`
  output, and replacing `(array.new_fixed $T 0)` with a shared global. Every variant printed the
  benchmark's exact output line before it was timed.
* **Timing.** `/usr/bin/time -f %U`, variants interleaved within each round, 6–12 rounds, and
  the median of per-round ratios to a base column. There are no hardware counters on this box
  (`perf_event_open` returns `ENOENT` under WSL2), so ratios are the robust column and absolute
  seconds move with load.

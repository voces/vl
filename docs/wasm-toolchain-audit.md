# Wasm toolchain audit for VL — as of June 2026

A survey of the WebAssembly toolchain ecosystem mapped to VL's concrete needs: optimizing the
self-hosted emitter's raw WasmGC output, killing the ~6.5 min self-rebuild, debugging emitted
modules (traps currently surface as bare `unreachable`), testing/fuzzing the emitter, module size,
and the future WASI file-I/O story for the native `vl` tool. Versions verified against current
documentation in June 2026: **binaryen 130** (released 2026-06-01), **wasm-tools 1.251.0**
(2026-05-28), **wasmtime 45.0.1** (2026-06-05 — the same major version `scripts/vl-host` pins).
Background: WasmGC is no longer "a proposal" — it's part of the
[Wasm 3.0 standard (2025-09-17)](https://webassembly.org/news/2025-09-17-wasm-3.0/), which is why
default-on support is now the norm across tools.

Priority legend: **now** (adopt in the current milestone) · **soon** (next milestone / when the
trigger condition hits) · **later** (real value, no urgency) · **skip** (not for VL).

---

## 1. Post-hoc optimization of WasmGC: `wasm-opt`

**Verdict: yes — binaryen's `wasm-opt` is still the only serious post-hoc optimizer for WasmGC
modules.** Nothing else in the ecosystem does whole-module GC-aware optimization over the binary:
LLVM doesn't target WasmGC, wasmtime/Cranelift optimizes at JIT time only (and doesn't rewrite the
module), and `wasm-tools` has no optimizer. Every production WasmGC toolchain (J2Wasm/Java,
Kotlin/Wasm, dart2wasm) funnels output through wasm-opt — binaryen's GC pass pipeline was built
*for* them ([V8 WasmGC porting post](https://v8.dev/blog/wasm-gc-porting),
[binaryen README](https://github.com/WebAssembly/binaryen)). This validates the H4 decision
(emit bytes directly + optional `wasm-opt` subprocess) — the optimizer VL gives up by dropping
binaryen-as-library is recoverable post-hoc from the CLI.

### Passes that matter for VL's GC-heavy output

From the [GC Optimization Guidebook](https://github.com/WebAssembly/binaryen/wiki/GC-Optimization-Guidebook)
and [Optimizer Cookbook](https://github.com/WebAssembly/binaryen/wiki/Optimizer-Cookbook):

| Pass / flag | What it does | Why VL cares |
|---|---|---|
| `--closed-world` | Assumes no unknown outside code interacts with the module's types | **Prerequisite** for the aggressive GC passes. VL's module boundary is scalar-only (i32 print imports, i32 driver exports — DECISIONS H6), so it qualifies cleanly. |
| `-O3 -O3` (repeat) | Full pipeline, twice | Non-LLVM GC compilers produce code shapes one `-O3` doesn't normalize; the guidebook explicitly recommends repeated runs (J2Wasm uses ~6). |
| Heap2Local (in `-O`) | Escape analysis: non-escaping GC allocations → locals | VL's biggest single win: the emitter boxes everywhere (tagged-union `{tag, value}` structs, `{backing,len,cap}` list wrappers). Needs **inlining first** to expose non-escaping allocations — another reason for repeated `-O3`. This is the Heap2Local the DECISIONS file already says to lean on instead of hand-rolled SROA. |
| `--gufa` | Grand Unified Flow Analysis: whole-program content-flow; infers constants and exact types, enables devirtualization and cast removal | VL's `is`-narrowing emits `ref.cast` downcasts and closure-env `structref` params; GUFA removes provably-redundant casts. Recommended shape: `-O3 --gufa -O3`, requires `--closed-world`. |
| `--type-ssa` … `--type-merging` | Split types for sharper analysis, then re-merge needless distinctions | VL emits one struct type per object shape + per-element list wrapper types; merging shrinks the type section. Suggested: `--type-ssa -O3 -O3 --type-merging -O3`. |
| `--type-finalizing` | Marks types `final` | Run at pipeline end; final types are cheaper to cast in engines. |
| `--reorder-types` / `--minimize-rec-groups` | Type-section layout for size | `--reorder-types` for single-module delivery (VL's case). |
| `-tnh` (traps-never-happen) | Assume no trap is intentional control flow | **Use with care**: VL's OOB indexing and the no-`else` exhaustive-chain fall-through *deliberately* lower to traps; `-tnh` may delete code paths VL's semantics rely on. Test against the corpus before adopting. |

### Caveat: rec groups, type identity, and wasmtime

Wasm 3.0 type identity is *structural, canonicalized per rec group*: two types are identical only
if their **whole recursion groups** match shape-for-shape. wasm-opt's type passes
(`--type-merging`, `--type-ssa`, `--reorder-types`, `--minimize-rec-groups`) freely rewrite the
type section — so a wasm-opt'd module's GC types are **not identity-compatible** with the
pre-optimization module's types. This matters exactly when a GC type crosses the module boundary:

- Under `--closed-world`, binaryen treats any type reachable from imports/exports as **public**
  and refuses to modify it — and a public type poisons its *entire rec group* (optimization
  blocked for the whole group; see
  [binaryen #6640](https://github.com/WebAssembly/binaryen/issues/6640),
  [#4462](https://github.com/WebAssembly/binaryen/issues/4462)). The guidebook's advice: keep only
  basic types (`i32`, `anyref`) on the boundary.
- wasmtime canonicalizes types the same way, and is strict about it when linking typed imports.

**VL is currently safe**: both the compiler module's driver interface and emitted programs'
print imports are pure-i32 (DECISIONS: "thin scalar wrapper" exports). **Keep that invariant** —
it's what makes `wasm-opt` a free post-processing step. If VL ever exports a GC-typed function
(e.g. a future host-visible string ABI), wasm-opt's type passes must be constrained, and any
host-side typed `FuncType` construction must match the post-opt rec-group shapes.

**How VL adopts (priority: now).** The self-hosted emitter's output is unoptimized; the fix is a
subprocess step, not emitter work: `vl build` (and the stage-0 seed build) shells out to
`wasm-opt --closed-world --type-ssa -O3 -O3 --type-merging --gufa -O3 --type-finalizing` when
`wasm-opt` is on PATH, as already decided in H4. Concretely the highest-value target is
**optimizing `build/vl-compiler.wasm` itself** — the 561 KB module the host re-runs constantly;
smaller + Heap2Local'd compiler code directly attacks the 6.5 min self-rebuild (less allocation
churn for wasmtime's DRC to track, less code for Cranelift to compile).

---

## 2. Binaryen's other tools

All ship in the binaryen release tarball / brew package alongside `wasm-opt`
([README tool list](https://github.com/WebAssembly/binaryen)).

| Tool | What it is | VL use | Priority |
|---|---|---|---|
| **wasm-dis** | Binary → text (WAT), GC-aware | Inspecting self-emitted modules — the emitter has no text backend, so this *is* the debugging view of `vl build` output. Also `wasm-tools print` (§3) does the same with independent parsing — disagreement between the two is itself a bug signal. | **now** |
| **wasm-reduce** | Test-case reducer: shrinks a module while a user-supplied script still observes the failure (e.g. "wasmtime traps" / "validation fails") | **The emitter-bug workflow.** When a self-compiled corpus case produces a bad module, reduce the *module* against `wasmtime` to a minimal repro. Caveat: it reduces the wasm, not the `.vl` source — for source-level reduction you'd still bisect by hand. | **now** |
| **wasm-ctor-eval** | Executes functions (or prefixes of them) at build time and snapshots resulting state back into the module; **supports GC** — evaluated GC objects are serialized into globals ([tool source](https://github.com/WebAssembly/binaryen/blob/main/src/tools/wasm-ctor-eval.cpp), [CHANGELOG](https://github.com/WebAssembly/binaryen/blob/main/CHANGELOG.md)) | Directly relevant: VL lowers top-level statements to the **start function**. For the compiler module, the start fn builds keyword tables / checker init state — ctor-eval could pre-execute that once at build time (`--ctors` on the start fn) so every `vl` invocation skips it. It stops at the first non-evaluable instruction (e.g. a call to an import) and keeps the partial progress. This is the GC-capable answer to what wizer (§5) can't do. | **soon** (measure: init is probably small today; revisit when std tables grow) |
| **wasm-metadce** | Graph-driven dead-code elimination: you describe the *outside* (which exports the host actually uses) in a JSON graph and it DCEs across the boundary ([manpage](https://manpages.debian.org/experimental/binaryen/wasm-metadce.1.en.html)) | Marginal: VL controls both sides and already exports only the driver functions; plain `wasm-opt` DCE under `--closed-world` covers it. Useful only if the driver surface grows vestigial exports. | **skip** (for now) |
| **wasm-merge** | Merges multiple modules into one, resolving cross-module imports/exports; checks import/export types match ([PR #6437](https://github.com/WebAssembly/binaryen/pull/6437)) | VL already decided whole-program merge at the *source* level (H0: N files → one `VLProgramNode` → one module), so there's no link step to serve. Could matter someday for a binary `std` distributed separately — but that fights monomorphization, already rejected. | **skip** |
| **wasm-split** | Splits a module into primary + lazily-loaded secondary parts (web load-time tool) | Wrong problem domain for a CLI compiler. | **skip** |
| **Fuzzing harness** (`-ttf`, `--fuzz-exec`, `--initial-fuzz`, `scripts/fuzz_opt.py`) | `wasm-opt -ttf` turns arbitrary bytes into a valid wasm module (GC included); `--fuzz-exec` runs it in binaryen's interpreter for differential comparison; `--initial-fuzz=FILE` mutates from an existing module; `--fuzz-preserve-imports-exports` keeps the boundary fixed ([Fuzzing wiki](https://github.com/WebAssembly/binaryen/wiki/Fuzzing)) | Two uses: (a) fuzz the **host/runtime path** — generated GC modules through wasmtime to harden `vl run`; (b) `--initial-fuzz` seeded with VL-emitted modules to shake out wasmtime/binaryen disagreement about VL's exact construct mix. Note it fuzzes *consumers of wasm*, not VL's emitter — emitter fuzzing needs a VL-source generator (none exists; that's VL-side work). | **later** |

---

## 3. Bytecode Alliance `wasm-tools` (1.251.0)

One CLI, many subcommands, all over the same `wasmparser` family of crates
([repo](https://github.com/bytecodealliance/wasm-tools)). GC, function-references, and tail-call
are implemented and **enabled by default in validation** (stage 4+ / Wasm 3.0 features).

| Tool | What it is | VL use | Priority |
|---|---|---|---|
| `wasm-tools validate` | Standalone validator with per-proposal feature flags | **The emitter's independent referee.** Today "it instantiates in wasmtime" is VL's only validity check — but wasmtime failure conflates validation with engine limits. `wasm-tools validate` gives spec-grade errors with offsets, from a *different* parser implementation than both binaryen and wasmtime. Wire into the corpus runner: every self-emitted module must pass. Also the gate for **B-validwasm** (emit valid wasm without binaryen's fixups). | **now** |
| `wasm-tools print` / `parse` | Binary↔text, full GC support | Same role as wasm-dis but spec-syntax-faithful; `parse` lets you hand-write WAT repros for wasmtime issues. | **now** |
| `wasm-tools smith` / [wasm-smith crate](https://docs.rs/wasm-smith/latest/wasm_smith/struct.Config.html) | Random *valid* module generator from a seed; `Config` has `gc_enabled` (**default `true`**), plus reference-types/tail-call/exceptions toggles (65 config fields) | Yes, it can fuzz a WasmGC host: generate GC-heavy modules and run them through the `vl-host` wasmtime embedding (differentially vs. `wasmtime run` CLI or V8). Like binaryen's `-ttf`, it tests wasm *consumers*, not VL's emitter. As a Rust crate it drops straight into a `cargo fuzz` target inside `scripts/vl-host`. | **later** |
| `wasm-tools shrink` | Predicate-preserving shrinker (same role as wasm-reduce, different implementation) | Second reducer when wasm-reduce gets stuck (reducers routinely plateau; alternating two works well). | **soon** |
| `wasm-tools mutate` | Semantics-aware module mutator | Feeds the same host-fuzzing loop as smith. | **later** |
| `wasm-tools dump` / `objdump` | Byte-level structure dumps with offsets | Debugging the *binary encoding* the self-hosted emitter produces (LEB128/section-framing bugs) — exactly the H4 byte-emission failure mode; better suited than WAT views when the binary is malformed enough that disassemblers reject it. | **now** |
| `wasm-tools metadata` / `strip` / `addr2line` | Names/producers metadata, custom-section strip, DWARF addr→line | `metadata add` can inject a producers section; `addr2line` is moot until VL emits DWARF. | later |
| `component …` (new/wit/embed), `compose` | Component-model tooling | Not until VL targets components — see §4 WASI: it shouldn't yet. | **skip** (for now) |

---

## 4. wasmtime 45+ audit for `vl-host`

Latest stable is **45.0.1** ([releases](https://github.com/bytecodealliance/wasmtime/releases)) —
the repo's pin is current. Full WasmGC shipped in
[wasmtime 27.0](https://bytecodealliance.org/articles/wasmtime-27.0). All `Config` methods below
verified present in [45.0.1 docs](https://docs.rs/wasmtime/45.0.1/wasmtime/struct.Config.html).

### 4.1 GC: collector choice + heap knobs

- **`Config::collector(Collector)`** ([docs](https://docs.wasmtime.dev/api/wasmtime/enum.Collector.html)):
  - `Collector::DeferredReferenceCounting` (DRC, the current default behind `Auto`): deferred RC +
    stack over-approximation; better latency, worse throughput. **Cannot collect cycles** — they
    leak until the Store drops. Known to struggle under heavy allocation churn (see
    [wasmtime #9701](https://github.com/bytecodealliance/wasmtime/issues/9701)) — i.e. exactly the
    self-rebuild profile VL observed.
  - `Collector::Null`: never collects; bump-allocates until the heap is exhausted, then traps.
    Documented as intended for "incredibly short-running Wasm instances" and overhead measurement —
    **yes, this is the recommended collector for one-shot batch compiles**: a `vl build` Store
    lives milliseconds-to-seconds and is then dropped wholesale, so paying *zero* RC/collection
    overhead and reclaiming via Store-drop is strictly better — *provided the heap is sized to fit
    the peak live+garbage footprint* (a 561 KB-source compile that churns hard may OOM-trap; size
    generously and fall back to DRC on trap).
  - A `Collector::Copying` variant exists in the dev (47.0.0-dev) docs but is marked "still under
    construction and not yet functional" — watch it: a real tracing collector is the long-term
    answer to the churn problem.
- **Heap sizing** (all in 45.0.1): `Config::gc_heap_reservation` (initial bytes reserved),
  `gc_heap_reservation_for_growth` (extra VM space for in-place growth),
  `gc_heap_guard_size`, `gc_heap_may_move` (allow relocation on growth)
  ([Config docs](https://docs.wasmtime.dev/api/wasmtime/struct.Config.html)). For the Null-collector
  batch path, set a large `gc_heap_reservation` up front so the bump allocator never relocates.

**Priority: now.** One-line change in `gc_engine()` plus heap sizing; directly attacks the rebuild
pain. Consider two engine configs: Null for `build`/`check` (one-shot), DRC for `run` (arbitrary
user programs that may run long).

### 4.2 AOT compilation & caching — eliminate per-run Cranelift

Three independent layers ([Module docs](https://docs.wasmtime.dev/api/wasmtime/struct.Module.html),
[cache docs](https://docs.wasmtime.dev/cli-cache.html)):

1. **Precompile the compiler module (`.cwasm`)** — `Engine::precompile_module(bytes)` /
   `Module::serialize()` produce an AOT artifact; `Module::deserialize_file()` memory-maps it back
   with **no compilation at all** (lazily paged, `unsafe` because the artifact is trusted native
   code; version-locked to the exact wasmtime release, with deterministic rejection on mismatch).
   `scripts/build-compiler-wasm.ts` should emit `vl-compiler.cwasm` next to the `.wasm` (via a tiny
   `vl-host` subcommand, e.g. `vl precompile`), and `compile_vl()` should prefer it. This removes
   the "cranelift recompiles the compiler module each run" cost **entirely** — the single biggest
   structural fix available for batch latency. The ROADMAP's H-M2 note already assumes this
   (`wasmtime run --dir . vl.cwasm`). **Priority: now.**
2. **`Config::cache`** — the transparent compiled-module disk cache (zstd-compressed, LRU,
   ~512 MiB default cap). Covers what precompilation doesn't: *emitted user modules* in `vl run`
   get JIT-cached across invocations keyed on content. Cheap to enable; an implementation-detail
   format (safe default). **Priority: soon.**
3. **Incremental compilation cache** — `Config::enable_incremental_compilation(CacheStore)`
   (cargo feature `incremental-cache`): Cranelift caches per-*function* compiled artifacts, so
   recompiling a slightly-changed module only compiles changed functions
   ([wasmtime #4155](https://github.com/bytecodealliance/wasmtime/issues/4155)). Interesting for
   the edit-compile-run loop on user programs (most functions unchanged between edits). Requires
   providing a `CacheStore` impl. **Priority: later** (layer 1+2 likely suffice).

### 4.3 Winch (baseline compiler)

`Config::strategy(Strategy::Winch)`. Single-pass compiler for fast startup; x86-64 mature, AArch64
support landed in 2026 releases. **Does not support GC types**
([winch README](https://github.com/bytecodealliance/wasmtime/blob/main/winch/README.md) — no
externref/GC support; not production-ready per
[tiers of support](https://docs.wasmtime.dev/stability-tiers.html)). Since *every* VL module is
WasmGC, Winch is unusable for VL today, and the `.cwasm` route (§4.2) eliminates the startup-latency
motivation anyway. **Priority: skip** (re-check yearly; GC support would make it interesting for
`vl run` of freshly-emitted modules, where Cranelift compile time of *user* modules is the residual
cost).

### 4.4 Debugging emitted modules

- **NAMES section → real trap backtraces: the highest-leverage cheap win.** Wasmtime trap errors
  carry a `WasmBacktrace` whose frames expose `func_name()`
  ([WasmBacktrace docs](https://docs.wasmtime.dev/api/wasmtime/struct.WasmBacktrace.html)) — the
  names come from the module's `name` custom section (the same symbolication every wasm tool uses);
  without it, frames print as numeric indices and VL sees bare `unreachable`. The `name` section is
  a trivial appendix (section id 0, "name", function-index→string map) — well within the self-hosted
  emitter's existing LEB128/section machinery, and VL already tracks `fnNames` in the driver.
  Backtraces are on by default (`Config::wasm_backtrace_max_frames` tunes depth). **Priority: now.**
- **Core dumps on trap**: `Config::coredump_on_trap(true)` attaches a core dump (memory, globals,
  full stack with function names + offsets) to the trap error; CLI `wasmtime -D coredump=PATH`. The
  format is the standard
  [tool-conventions coredump](https://github.com/WebAssembly/tool-conventions/blob/main/Coredump.md),
  consumable by `wasmgdb` ([guide](https://docs.wasmtime.dev/examples-debugging-core-dumps.html)).
  Natural `vl run --coredump` / `VL_COREDUMP=1` debug flag. **Priority: soon.**
- **DWARF guest debugging**: `Config::debug_info(true)` lets gdb/lldb step through guest source
  ([guide](https://docs.wasmtime.dev/examples-debugging.html)) — but it requires the *producer* to
  embed DWARF, which VL doesn't (and DWARF emission is a large project). VL's planned source-map
  trap diagnostics (B-debug) cover the same need at the language level. **Priority: skip** (DWARF
  emission); **later** as a B-debug synergy if VL ever wants standard-tooling integration.

### 4.5 Profiling, fuel, epochs

- **`Config::profiler(ProfilingStrategy)`** — `PerfMap` (cheap, Linux perf), `JitDump` (richer,
  Linux), `VTune` ([guide](https://docs.wasmtime.dev/examples-profiling.html)). With perfmap +
  the name section, `perf` shows *VL function names* inside the JIT — the right tool for finding
  where the 6.5 min self-rebuild actually goes (GC vs. per-codepoint boundary vs. compiler logic).
  **Priority: now** (diagnostic, behind a debug env var).
- **Fuel** (`Config::consume_fuel` + `Store::set_fuel`): deterministic instruction-count budgets;
  meaningful per-instruction overhead. **Epochs** (`Config::epoch_interruption` +
  `Engine::increment_epoch` from a timer thread): near-zero-overhead wall-clock interruption —
  the documented lightweight alternative
  ([Config docs](https://docs.wasmtime.dev/api/wasmtime/struct.Config.html)). For a future
  `vl test` runner, **epochs are the right timeout mechanism** (a hung test case gets interrupted
  cleanly instead of wedging the runner); fuel only if VL ever wants *deterministic* replay budgets.
  **Priority: soon** (lands with `vl test`).

### 4.6 WASI for `vl`'s file I/O

[wasmtime-wasi 45.0.1](https://docs.rs/wasmtime-wasi/latest/wasmtime_wasi/) ships three layers:
`p1` (`wasi_snapshot_preview1` for **core modules**), `p2` (components; the default focus), `p3`
(experimental/incomplete).

- **Target WASIp1 — the ROADMAP's H-M2 call is still right (June 2026).** p2/p3 are
  component-model-based, and **GC support in the component model's canonical ABI is an early,
  incomplete extension** — a pre-proposal being implemented behind experimental flags, with
  wasmtime's support explicitly "very incomplete"
  ([component-model #525](https://github.com/WebAssembly/component-model/issues/525)). A WasmGC
  core module + p1 imports, by contrast, is boring and fully supported: p1 functions are plain
  `(i32…) → i32` core imports, orthogonal to whether the module uses GC types internally.
- The one emitter prerequisite stands: p1's pointer/len ABI needs a **linear memory** + a
  GC-string→linear-memory copy for `fd_read`/`fd_write` buffers (GC refs can't cross the WASI ABI).
  A module may freely have both a GC heap and a linear memory.
- Host side: `wasmtime_wasi::p1` provides `WasiP1Ctx` + a sync `add_to_linker` for exactly the
  `Linker<T>`-over-core-modules shape `main.rs` already has. This is also what kills the
  per-code-point `srcPush` feed: the compiler module reads its own source via `fd_read` (or
  initially, a coarse host-provided "read whole file into a GC string" intrinsic as a stepping
  stone — even that beats one call per code point).
- **Priority: soon** — it's the planned H-M2 step; nothing in the 2026 ecosystem changes the plan.
  Revisit p2/components only when GC-in-canonical-ABI stabilizes (track #525).

### 4.7 Pooling allocator / instance reuse

`Config::allocation_strategy(InstanceAllocationStrategy::Pooling)` +
[`PoolingAllocationConfig`](https://docs.wasmtime.dev/api/wasmtime/struct.PoolingAllocationConfig.html):
pre-reserved slots make instantiation ~syscall-free; GC-aware via `total_gc_heaps` (default 1000
concurrent GC heaps). Designed for high-concurrency serving, but the same property — cheap
repeated instantiation of the *same* module — fits a `vl test` runner instantiating the compiler
module (or many emitted test modules) hundreds of times in one process, with slot affinity giving
copy-on-write reuse. Note what it does *not* fix: per-instantiation cost is already small once the
module is precompiled (§4.2); measure before adopting. **Priority: later.**

---

## 5. Ecosystem extras

- **Wizer (pre-initialization snapshots)** — instantiates a module, runs an init function,
  snapshots memory+globals into a new module
  ([repo](https://github.com/bytecodealliance/wizer)). **Does not support reference types, let
  alone WasmGC heaps** — snapshotting ref-typed state is an open design problem
  ([README](https://github.com/bytecodealliance/wizer/blob/main/README.md)). So no, it cannot
  snapshot the VL compiler module post-parse. The GC-capable equivalent is binaryen's
  **wasm-ctor-eval** (§2), which serializes GC objects into globals. **Skip** (wizer);
  wasm-ctor-eval is the watch item.
- **jco / componentize tooling** — JS-ecosystem component toolchain
  ([jco](https://github.com/bytecodealliance/jco)): transpiles components to JS, componentizes JS.
  Only relevant if VL targets components (§4.6: not yet) or wants the playground to consume
  components (it doesn't — it instantiates core modules directly). **Skip** for now.
- **Engine portability matrix for WasmGC (June 2026)** — VL output is portable across:
  **V8/Chrome** (119+, default-on since 2023,
  [Chrome blog](https://developer.chrome.com/blog/wasmgc)), **SpiderMonkey/Firefox** (120+),
  **JavaScriptCore/Safari** (18.2+, late 2024 — cross-browser baseline; Safari 26 added an
  in-place interpreter + JS string builtins), **wasmtime** (27.0+,
  [release post](https://bytecodealliance.org/articles/wasmtime-27.0)). **Wasmer** still has no
  native-backend GC — it gets GC only via its V8/JSC `wasm_c_api` backends (i.e. a JS engine again;
  [wasmer discussion #3839](https://github.com/wasmerio/wasmer/discussions/3839)), confirming the
  H-M2 engine survey: wasmtime remains the only standards-track non-browser engine with production
  WasmGC. The Safari 26.2 **JS string builtins** shipment also unblocks the B7 string-backing plan
  (`wasm:js-string`) browser-side.
- **`wasm:js-string` builtins note** — when B7 lands, binaryen has dedicated passes
  (`--string-lifting` / `--string-lowering-magic-imports`) to optimize across the builtin boundary
  (GC Optimization Guidebook §strings) — but those imports are *typed* (externref), so revisit the
  §1 public-type caveat then.

---

## Measured addendum (2026-06-10, this machine)

Empirical results from the native stage3→stage4 experiment that REVISE the priorities above:

- **The stage-0-built compiler module is 4.8× faster than the self-emitted one** on identical
  work (19KB `vl check`: 13.3s vs 64.4s).
- **`wasm-opt` over the self-emitted module was a NO-OP on runtime** (64.4s → 63.0s; size
  222KB → 199KB). Item #3's runtime hopes do not materialize: stack sampling shows the hot cost
  is wasmtime executing GC `array.copy` via a **per-element host libcall**
  (`vm::libcalls::array_copy` → `ArrayRef::_get`/`_set` per element; V8 inlines the same op).
  Those calls are semantic — no post-hoc optimizer can remove them. wasm-opt stays worthwhile
  for SIZE and for when wasmtime's array-copy fast path improves, but it does not fix the
  rebuild time today.
- **#1 (.cwasm) and #2 (null collector) are ALSO measured no-ops on this workload** (13.8s vs
  13.3s with the null collector; warm-cache run identical): DRC barriers are not the cost, and
  Cranelift compilation of a 152KB module was never significant. Both stay adopted in `vl-host`
  as correct architecture (no GC pauses in one-shot compiles; compile cost will matter as
  modules grow), but neither moves the rebuild time.
- Consequence: the ONLY rebuild-time lever is **reducing per-element copy traffic itself** — a
  `fromCodePoints(i32[]): string` builtin (amortized list build + one inlined conversion loop,
  no `array.copy` libcalls) for the source feed and eventually the lexer/string paths, or an
  upstream wasmtime array-copy fast path.
- One more compat note: `wasm-opt -all` emits **exact reference types** (custom descriptors),
  which wasmtime 45 rejects — pass explicit `--enable-reference-types --enable-gc` instead.

## Recommended adoption order

| # | Action | Component | Wins | Priority |
|---|---|---|---|---|
| 1 | Precompile `vl-compiler.wasm` → `.cwasm` (`Engine::precompile_module`, `Module::deserialize_file`) | `vl-host` + seed build | Removes per-run Cranelift compile of the compiler module — biggest fixed cost | **now** |
| 2 | `Collector::Null` + large `gc_heap_reservation` for `vl build`/`check`; keep DRC for `vl run` | `vl-host` `gc_engine()` | Removes DRC churn overhead from one-shot batch compiles | **now** |
| 3 | Run `wasm-opt --closed-world -O3 -O3` (+`--gufa`, `--type-merging`, `--type-finalizing`) over self-emitted output — above all over `vl-compiler.wasm` itself | `vl build` / seed build (subprocess, per H4) | Heap2Local + GUFA + size on the unoptimized emitter output; faster compiler module | **now** |
| 4 | Emit a `name` custom section from the self-hosted emitter | `wasmEmit.vl` | Wasmtime trap backtraces show VL function names instead of bare `unreachable` | **now** |
| 5 | Wire `wasm-tools validate` (+ `print`/`dump` for inspection, `wasm-dis` cross-check) into the corpus runner | tests | Independent spec-grade validation of every emitted module; the B-validwasm gate | **now** |
| 6 | `Config::profiler(PerfMap)` behind a debug flag; profile the self-rebuild | `vl-host` | Ground truth on where the 6.5 min goes | **now** (diagnostic) |
| 7 | Adopt `wasm-reduce` / `wasm-tools shrink` as the emitter-bug reduction workflow | dev workflow | Minimal repros for bad emitted modules | **now** (workflow, zero code) |
| 8 | WASIp1 file I/O (`wasmtime_wasi::p1`): kill the per-code-point feed; linear-memory string handoff in the emitter | `vl-host` + `wasmEmit.vl` | Removes the wasm-boundary feed cost; the H-M2 step | **soon** |
| 9 | `Config::epoch_interruption` timeouts | future `vl test` | Hung-test interruption, near-zero overhead | **soon** |
| 10 | `Config::cache` for emitted user modules; `coredump_on_trap` debug flag | `vl-host` | Cached JIT across `vl run` invocations; post-mortem debugging | **soon** |
| 11 | `wasm-ctor-eval` over the start function (GC-capable pre-init) | build pipeline | Pre-evaluated top-level/init state | **soon** (when init cost is measurable) |
| 12 | wasm-smith / binaryen `-ttf` fuzzing of the host path; pooling allocator for mass corpus runs; incremental compilation cache | `vl-host` / tests | Hardening + marginal perf | **later** |
| — | Winch (no GC), wizer (no GC refs), component model / WASIp2 (GC ABI incomplete), wasm-merge/split/metadce, DWARF emission | — | — | **skip / re-check later** |

**The 6.5-minute self-rebuild, decomposed by this audit:** #1 kills the Cranelift recompile, #2
kills the DRC churn cost, #3 shrinks/speeds the compiler module itself, #8 kills the per-code-point
boundary feed, and #6 verifies the residue. All five are independent and individually small.

---
*Sources current as of 2026-06-10. Key versions: binaryen 130, wasm-tools 1.251.0 / wasm-smith
0.251.0, wasmtime 45.0.1 (stable) / 47.0.0-dev (docs.wasmtime.dev), Wasm 3.0 (2025-09-17).*

# Memory & GC strategy

How VL allocates: what the WasmGC object model gives us, what it structurally
cannot give us, what linear memory is (and isn't) today, and where the collector
choice belongs. Companion to `DECISIONS.md` ("Allocation = WasmGC") and
`docs/internals/wasm-toolchain-audit.md` §4.1 (wasmtime collector knobs).

## TL;DR

- **WasmGC stays the object model.** The alternative — VL managing a linear-memory
  heap itself — costs a hand-written tracing collector *plus* a shadow stack on every
  call (wasm exposes no way to scan a frame's locals), and it discards the wasm
  validator as VL's memory-safety proof. That is a bad trade for the common case.
- **Linear memory is becoming a design, but is not one yet.** Seventeen memory
  builtins are declared in the checker; fifteen are lowered. Since the webcraft P0.2
  slice it has a full LOAD width matrix, `memory.grow`/`memory.size`, and an exported
  memory — so it is no longer a fixed 64 KiB scratch page a host cannot see — and the
  three WIDE store widths have since landed, so every scalar VL has round-trips at its
  own width. There is still no allocator, no data section, no free, no bulk ops, and
  no narrow (8/16-bit) store. It should become one deliberate *tier* (buffers/FFI/bulk
  I/O), not a second object model. *(Was: "not a design, it is three intrinsics and a
  scratch page. Ten memory builtins are declared in the checker; three are lowered.
  There is no allocator, no data section, no export, no free.", then "twelve are
  lowered … and one store width".)*
- **The collector is a real, measurable, workload-dependent choice, and it is the
  single largest performance lever VL has today.** `vl run` was pinned to wasmtime's
  deferred-reference-counting collector. On an allocation-heavy program that is
  **21× slower** than the tracing collector; on cyclic garbage it is ~10× slower and
  holds **175× more memory**, because reference counting cannot reclaim cycles at all.
- **So: yes, expose the choice — as a runtime knob, never as language surface.**
  This change makes `vl run` default to the engine's tracing collector and adds
  `VL_GC=auto|tracing|refcount|none`. VL's compiler keeps its own (internal) null
  collector for one-shot batch work.
- **Two whole-program object models behind a flag: no.** One scoped linear-memory
  tier inside the GC program: yes. The 80/20 is a `Buffer` primitive, not a second
  emitter.

## 1. Where memory lives today

### 1.1 WasmGC — the object model

Every VL heap value is a WasmGC struct or array. Nothing about this is
placeholder: the emitter's hardest machinery exists to make wasm's *nominal* heap
types carry VL's *structural* types (`repCanonKey` twin dedup — `DECISIONS.md`,
"Struct heap-type identity is STRUCTURAL"). The representations:

| VL value | wasm shape |
|---|---|
| object / struct | `(struct …)`, one heap type per structural equivalence class |
| `T[]` | `(struct backing:(array T), len:i32, cap:i32)` |
| `string` | `(array (mut i32))` — one i32 per code point |
| `Map` / `Set` | a struct of **parallel** arrays (`keys`, `vals`, `live`, `index`, `hashes`) plus two i32 counters (`count`, `size`) |
| closure | closure struct + `call_ref` (`selfhost-lambdas-design.md`) |
| union arm | `{tag, value}` box (except where a niche/sentinel encoding applies) |

That table is worth reading as a list of *workarounds*, because §2 explains that
each one is shaped by something WasmGC will not let VL express.

### 1.2 Linear memory — the audit

Linear memory in VL predates the WasmGC decision and was never revisited. Current
state, verified against `compiler/typecheck.vl`, `compiler/wasmEmit.vl` and
`compiler/emit_sections.vl`:

- **Seventeen builtins are declared** in the checker's default scope: `__store_i32__`,
  `__store_i64__`, `__store_f32__`, `__store_f64__`, `__load_i32__`,
  `__store_string__`, `__log_string__`, `__log__`, `__memory_grow__`,
  `__memory_size__`, and the seven load widths `__load_i8__`, `__load_u8__`,
  `__load_i16__`, `__load_u16__`, `__load_i64__`, `__load_f32__`, `__load_f64__`.
- **Fifteen are lowered** by the emitter: `__store_i32__`, `__load_i32__`, `__log__`,
  the seven load widths, the three WIDE store widths (`__store_i64__` → `i64.store`,
  `__store_f32__` → `f32.store`, `__store_f64__` → `f64.store`), `__memory_size__` and
  `__memory_grow__`.
  The other **two have no emitter arm**: `__store_string__` and `__log_string__`.
  Neither is a table entry away — `__store_string__` would have to copy a GC
  `(array i32)` into linear memory with no byte encoding decided, and `__log_string__`
  is a host import the native runner does not provide.
  *(This bullet read "Twelve are lowered … the other five" until the wide store widths
  landed; the five were re-censused independently in three call POSITIONS each —
  statement, value and binding — and reproduced exactly at the time.)*
  **THE DIAGNOSTIC HALF IS DONE.** They used to typecheck and then fail at emit
  with `emitProgram: call to unknown function` — safe (no wrong bytes) but reading
  like a typo'd identifier rather than "this builtin has no implementation", which
  this bullet called the half worth fixing first (§B1). The CHECKER now says it
  itself, positioned at the call, on the `unsupported-lowering` channel
  (`nameIsUnimplementedIntrinsic` in `typecheck.vl`). A program that DECLARES one of
  these two names still shadows the builtin and still runs — unlike the
  emitter-intercepted names `nameIsEmitterIntrinsic` reserves, these two are not
  intercepted, so the diagnostic is gated on the program not declaring a function of
  the name. The three store widths LEFT this set by acquiring arms, and their
  shadowing escape hatch closed with the same motion: a `function __store_f64__(…)`
  definition is now a reject, because the call site is rewritten before any
  declaration is looked up and the body would never run.
  *(This bullet read "Ten builtins … Three are lowered … the other seven" before the
  P0.2/load-width slice, and the ten/three/seven counts were right at the time. The
  numbers moved because seven load widths and the two memory-size ops acquired
  emitter arms — see `buffer-design.md`.)*
- **The store/load matrix is asymmetric only at the NARROW end now.** There are
  **eight** load widths (i8/u8/i16/u16 signed+unsigned narrow, i32, i64, f32, f64) and
  **four** store widths (i32, i64, f32, f64). Every scalar VL has can be written at its
  own width and read back at its own width; what is missing is `i32.store8` /
  `i32.store16`, which `buffer-design.md` §C2 spells `store8`/`store16` and §O2 leaves
  as an unruled naming question — no `__store_i8__`/`__store_i16__` name is declared.
  *(This bullet has now said three different things. It first said "four `__store_*__`
  widths and exactly one `__load_i32__` — you can write an `f64` into memory and have
  no way to read it back", which counted DECLARATIONS and was measured false; then
  "eight load widths and exactly one store width", which was true between the load
  slice and this one.)*
- **There is no allocator.** No bump pointer, no `__heap_base`, no free list, no
  free. Addresses are raw i32 constants the program picks. Two pieces of code using
  memory in the same module silently collide.
- **There is no data section.** String and array literals cannot be placed in
  memory; `array.new_data` is therefore unreachable.
- **The memory is one page to start, EXPORTED, and conditional.** `emit_sections.vl`
  emits `min 1` page and no max, and only when a lowered memory intrinsic appears —
  a program calling `__store_f64__` (still unlowered) would not force a memory
  section. It is now also **exported as `memory`** (webcraft P0.2), gated on the same
  flag, and `__memory_grow__` makes `min 1` a starting size rather than a ceiling.
  *(Was: "one page, unexported, and conditional … one of the three lowered
  intrinsics".)*
- **Nothing is bulk.** No `memory.copy` / `memory.fill`, no i64 memory, no
  multi-memory, no atomics, no SIMD.

The comment in `emit_sections.vl` is honest about the intent: "64 KiB — ample for
the corpus' tag/value scratch region." Linear memory is a **test-harness scratch
page**, not a memory model. Anything written about VL "having a linear-memory
escape hatch" is currently aspirational.

### 1.3 The host boundary — where the absence costs real time

The `vl` host and the compiler talk over an all-scalar ABI, because a GC ref cannot
cross a wasm import/export boundary usefully and there is no memory to stage
through. So:

- **Source in:** ~~`srcPush(c: i32)` / `modSrcPush(c: i32)` — one host call per code
  point~~ — **FIXED**, see below.
- **Module bytes out:** `rbyteAt(i: i32) -> i32` — **one host call per emitted byte**
  (~1M for the compiler module). Still true.
- **Every diagnostic string** crosses the same way, one code point per call. Still
  true.

`scripts/vl-host/src/main.rs` already documents the fix — a `<name>Reserve(n)`
capacity hint plus an exported `ioMem` linear memory and `<name>Load(count)` bulk
staging — and notes "no seed exports these yet." The host half is written; the
emitter half does not exist, because there is no exported memory to write into.
Measured on the compiler self-compile (below), staging is ~10% of wall clock under
the null collector and ~6% under DRC. Not the headline, but it is free money that
is already designed.

**The source-IN half shipped** (`perf-program.md` §6). The driver exports
`srcLoad` / `modKeyLoad` / `modSrcLoad` / `cliResultLoad`; a `__load_i32__` inside
those loops sets `memUsed`, which is what materialises the memory the host writes
into (it is exported as `memory`, per §1.2's P0.2 rule, and the host probes `ioMem`
then `memory`). No `Reserve` exists — VL has no list-capacity primitive.
**Measured: 4,565,054 host calls per self-compile became 279; the host's
`[profile] stage_program` phase went 192 → 135 ms** (interleaved min-of-9), and
peak RSS did not move (511.2 → 511.3 MB). The ~10% figure above was right and the
residue is the element move, which **§2 constraint #10 makes irreducible** — there
is no runtime memory→GC-array copy, so the guest still loops. The two remaining
per-call channels are the OUT direction (`rbyteAt`, diagnostics), which want the
mirror mechanism.

## 2. What WasmGC structurally cannot do

These are *spec* constraints, not engine immaturity. No wasmtime or V8 release
fixes any of them.

| # | Constraint | What it costs VL |
|---|---|---|
| 1 | **SIMD only addresses linear memory.** `v128.load`/`store` have no GC-array form; there is no lane-wise access to `(array i8)`. | Every scan is scalar: `is_ascii` high-bit scanning, UTF-8 validation, `memcmp`-style key compare, hash-table probing. `strings-design.md` explicitly plans "(or SIMD-scans)" — that plan is unreachable while strings are GC arrays. |
| 2 | **No inline aggregates.** `(array (ref $P))` stores *references*. There is no array-of-structs-by-value. | `Point[]` is N separate allocations plus N pointer chases. A hash table cannot have an inline entry array. |
| 3 | **No interior or derived pointers.** You cannot hold a pointer into an array. | Slices must copy — which `collections-design.md` already concedes ("v1 `slice` copies"). No zero-copy views, ever. |
| 4 | **No reinterpret / bitcast between types.** An `(array i8)` cannot be read as i32s. | The B7 UTF-8/i8 packing direction gets 4× the density and loses word-at-a-time scanning: byte-at-a-time forever. |
| 5 | **No control over layout, alignment, padding or field order.** Packed i8/i16 *fields* exist; nothing else does. | No cache-line-aware structures, no bit-packing across fields, no explicit false-sharing avoidance. |
| 6 | **No address identity or address hashing.** `ref.eq` answers equality; nothing yields a stable hash, and funcrefs admit no `ref.eq` at all. | An identity-keyed map needs a side identity counter stamped into every object. `DECISIONS.md`/A15 already hits this for function-value equality. |
| 7 | **Every field has one fixed type.** No `void*`, no untyped slot. | Heterogeneous containers need a tagged wrapper struct per arm — VL's `{tag, value}` boxing is an allocation per union value. |
| 8 | **No weak references and no finalization.** | Caches and interning tables can only grow. VL's string interning and the emitter's memo tables are unbounded by construction. |
| 9 | **No free, and no way to hint the collector.** Not even "this arena is dead." | The compiler *knows* its whole AST/type arena dies at the end of a compile and cannot say so. The only lever is choosing a collector that ignores the problem (§4). |
| 10 | **No runtime GC-array ↔ linear-memory copy.** `array.new_data` / `array.init_data` read a *passive data segment* (constant, build-time); nothing copies a live GC array to or from memory. | This is precisely the H4.5 "byte handoff" blocker `DECISIONS.md` names for the libbinaryen FFI route — and the reason `ioMem` bulk I/O (§1.3) needs a per-element loop on the guest side even once it exists. |

### 2.1 Worked example — the hash map

VL's `Map` is open-addressed with linear probing and a cached FNV-1a hash per
entry. That is a good design *given the constraints*, and it is the only shape
WasmGC permits: since entries cannot be inline (#2), the table is
**struct-of-arrays** — five parallel GC arrays rather than one entry array.

What is unreachable: a Swiss table / F14-style layout, where a `v128` load of 16
control bytes tests 16 slots in one instruction. That needs #1 (SIMD) and #2
(inline entries) simultaneously. Under WasmGC, probing is one `array.get` per slot,
scalar, forever. There is no clever emitter work that recovers it — the instruction
does not exist.

The consolation: struct-of-arrays is genuinely cache-friendly for the probe
sequence (the `index` array is dense i32), and the per-entry hash cache already
removes the expensive part of a probe miss. VL is near the ceiling of what the API
allows. The ceiling is just lower than a native hash map's.

### 2.2 Worked example — strings

A `string` is `(array (mut i32))`: 4 bytes per code point, O(1) indexing, no
encoding work. Moving to `(array i8)` UTF-8 (the B7 direction) would cut memory 4×
for ASCII — and then #1 and #4 bite: no SIMD scan for the ASCII fast-path flag, no
word-at-a-time `is_char_boundary`, no bulk compare. The i8 representation is *more*
compact and *less* scannable. That tension is a structural property of WasmGC, and
it is worth pinning here because it will otherwise be rediscovered mid-implementation.

## 3. Would managing memory ourselves be better?

"Our own" means: emit a linear-memory allocator, lower objects/arrays/strings to
raw offsets, pass i32 handles instead of refs.

**What VL would gain.** All ten rows of §2, essentially. SIMD kernels. Inline
aggregates and real Swiss tables. Slices as views. Arenas and explicit free — and
the compiler's own workload is *exactly* arena-shaped. Predictable footprint with
no collector to tune. Plus one thing that has nothing to do with performance:
**portability**. WasmGC restricts VL's output to V8, SpiderMonkey, JSC and
wasmtime. A linear-memory VL runs on WAMR, wazero, wasm2c, every embedded runtime,
and any browser with GC disabled.

**What it would cost.**

1. **You must write a garbage collector, and refcounting will not do.** VL has
   recursive types, closures that capture their environment, and structurally-typed
   graphs; cycles are routine, not exotic. So it must be tracing.
2. **Tracing in linear memory requires a shadow stack.** Wasm gives no way to scan
   a frame's locals for roots, so every live reference must be spilled to a
   guest-managed stack around every call and every allocation site. That is a cost
   on *all* code, paid to make collection possible at all. This is the tax Go's
   wasm backend and pre-WasmGC dart2wasm paid, and it is the reason WasmGC exists.
3. **The wasm validator stops being VL's memory-safety proof.** Today, an emitter
   bug that confuses two struct types produces an *un-instantiable module* — loud,
   at build time. That is not a nicety; it is how the structural-twin soundness bug
   in `DECISIONS.md` was caught, and `docs/guide/soundness.md` leans on it. With raw
   offsets, the same bug becomes silent memory corruption. VL's fuzzing corpus
   (`rep-fuzz-findings.md`) is built around loud rejection.
4. **The emitter roughly doubles at its most fragile layer.** Six representations
   (struct, list, map, string, closure, tagged union) each need a second lowering —
   and the rep layer is mid-rewrite (`destringify-types-program.md`,
   `codegen-builder-migration-plan.md`).
5. **You lose the engine's collector**: no free write barriers, no generational
   nursery, no JIT-aware compaction, no inline allocation fast path maintained by
   someone else (§6).

**Verdict.** Not better as a replacement. The honest framing is three tiers:

1. **WasmGC is the object model** — safety, engine collector, host interop.
2. **A bounded linear-memory tier** for what §2 makes impossible: byte buffers,
   FFI/WASI ABI, SIMD kernels, bulk host I/O staging. This is `collections-design.md`
   §OQ.7's "user-facing low-level array escape", which that document defers — the
   argument here is that it should be *designed* (allocator, exported memory, data
   section) rather than left as the three ad-hoc intrinsics of §1.2.
3. **Collector choice** (§4) for the GC-pressure question, instead of collector
   replacement.

## 4. Domain-specific collector choice

### 4.1 The measurements

Environment: 4-core Xeon @ 2.80 GHz, Linux 6.18, wasmtime 47.0.2, `vl` release
build, prebuilt `.wasm` (compile time excluded), best of repeated runs, peak RSS
sampled from `VmHWM`.

**`trees` — 5.24M short-lived acyclic allocations** (binary-trees, depth 16 × 40):

| collector | time | peak RSS |
|---|---|---|
| `tracing` (copying) | **0.08 s** | 22 MB |
| `refcount` (DRC) — *the previous `vl run` default* | 1.75 s | 18 MB |
| `none` (null) | 0.11 s | 94 MB |

**`cycles` — 80M allocations forming 40M two-node cycles:**

| collector | time | peak RSS |
|---|---|---|
| `tracing` | **0.96 s** | **14 MB** |
| `refcount` | ~9.5 s | **2455 MB** |
| `none` | 0.9 s | 1234 MB |

Two findings, not one. The 21× throughput gap is the expected refcount-vs-tracing
trade. The 175× memory gap is different in kind: **DRC cannot collect cycles at
all** — they leak for the life of the store. A long-running VL program that builds
any cyclic structure grew without bound under the old default. That is closer to a
correctness bug than a tuning miss.

Note also that `none` is *slower* than `tracing` on `trees`. Never collecting is no
longer the fast path; a semispace collector with an in-Wasm bump allocator wins on
throughput *and* footprint. The intuition "GC off must be fastest" is now false.

What the tables do **not** measure is pause distribution, and that is the one axis
where `refcount` still wins: the copying collector is stop-the-world, DRC is not.
Nothing in VL is latency-sensitive today, so the default is a throughput call — but
a per-frame or soft-real-time workload is exactly the case for reaching for
`VL_GC=refcount` (accepting that its cyclic garbage never comes back), and it is
half of why the knob is worth exposing at all.

### 4.2 The compiler's own choice, re-examined

The compiler instance runs under the null collector — one-shot batch work, dropped
wholesale, so pay zero collection overhead. Measuring the self-compile
(`vl build compiler/entry.vl`, 3.36 MB of source, warm `.cwasm`) with each
collector forced on the *compile* engine:

| collector | staging | compile | total |
|---|---|---|---|
| `none` (shipped) | 0.27 s | 2.25 s | **2.59 s** |
| `tracing` | 0.38 s | 3.44 s | 3.92 s |
| `refcount` | 1.23 s | 17.97 s | 19.28 s |

All three produce **byte-identical** output, and it equals the seed (the
self-compilation fixpoint holds). So the call was right and stays right — but the
margin over a real tracing collector is 1.5×, not the 7.4× it has over DRC. Most of
what "turning GC off" bought was avoiding DRC, not avoiding collection.

Note the staging column moving with the collector (0.27 → 1.23 s): that is `srcPush`
pushing 3.4M code points into a growable GC array, and DRC paying a barrier on every
one. §1.3's bulk-`ioMem` path would shrink this regardless of collector.

### 4.3 Should VL's consumers get the choice?

**Yes — as a runtime knob, on the host tool, with no language surface.** Implemented
here as `VL_GC=auto|tracing|refcount|none`, defaulting to `auto`.

The reasoning:

- **It is a real, measured, workload-dependent trade**, not a micro-optimization.
  Batch tools, long-running servers and latency-sensitive loops genuinely want
  different collectors, and VL's own compiler is the proof that the batch case
  exists.
- **It costs nothing to offer.** One `Config` line in the host. Precedent is
  universal: `-XX:+UseZGC`, `GOGC`, .NET server-vs-workstation GC.
- **It must not be language surface.** Nothing in a `.vl` file may depend on it, or
  the flag becomes semantics and programs stop being portable. It is a property of
  *this run on this host*, like a stack-size limit.
- **It is an env var, not a CLI flag, for a structural reason:** the engine is
  constructed before any guest code runs, and all `vl` flag parsing lives in the
  guest (`compiler/cli.vl`, `cli-design.md`). A `--gc` flag would have to be parsed
  twice, in two languages, one of which has not started yet.
- **`none` must be named honestly.** It is not "GC off", it is "never free, then
  trap." Calling it `none` and documenting the trap is the difference between a
  tuning knob and a footgun.
- **The asymmetry must be documented:** the knob applies to the `vl` host. A VL
  module shipped to a browser gets whatever V8 provides. This is a property of the
  *runner*, not of the program — which is exactly why it does not belong in the
  language.

The compiler's own null collector stays internal and is deliberately *not* routed
through `VL_GC`: it is not a user's decision, and letting it float would also
invalidate the `.cwasm` sidecar on every change of the variable.

### 4.4 The better answer to GC pressure: allocate less

A collector flag treats the symptom. The compiler-side levers are already on the
roadmap and are worth naming as the real program:

- **Heap2Local** (binaryen escape analysis) — `DECISIONS.md` commits to leaning on
  it rather than hand-rolling SROA, but the native path only runs `wasm-opt` under
  an explicit `-O`. Non-escaping allocations should not exist at all; an inline
  allocation fast path is the consolation prize for the ones that do.
- **Representation inference** (`collections-design.md` §VL.7) — a never-grown list
  loses its `{backing, len, cap}` wrapper allocation entirely.
- **Union-arm boxing** — `{tag, value}` is one allocation per union value that VL
  fully controls; every niche/sentinel encoding removes one.
- **`Set` dropping its always-`true` `vals` array** (ROADMAP B6a-opt) — ~17% of a
  Set's memory and an allocation-plus-`array.copy` on every resize.

## 5. Both object models behind a flag — could we? should we?

**Could we.** Yes, mechanically. It is §3's cost list in full: a second lowering of
all six representations, a shadow stack, a hand-written tracing collector, and a
second set of invariants for the rep layer.

**Should we — as a whole-program mode: no.** The cost is not the emitter work, it
is the *validation surface*. Two object models means the ~1000-case corpus, the
soundness corpus, the rep fuzzer and the self-compilation fixpoint all run twice, or
one mode silently rots. A bug found in one mode is invisible in the other. And the
payoff is lopsided — WasmGC would remain the default for nearly every user, so the
second mode would carry most of the risk for a fraction of the use.

**Should we — as a scoped tier: yes.** One explicit low-level primitive inside an
otherwise-GC program (`collections-design.md` §OQ.7's `Buffer`/`Array<T>`, plus the
allocator and exported memory of §1.2) reaches most of the wins for a fraction of
the cost, and it composes: GC by default, raw buffers where they pay. It does not
double anything; it adds one type.

**The one argument that would justify a real second mode is portability, not
performance.** If VL wants to target engines with no GC support — WAMR, wazero,
wasm2c, embedded runtimes — then a linear-memory backend is not an optimization, it
is the only way to run there at all. That is a distribution decision and should be
argued on distribution grounds, with the §3 costs priced in honestly. It is not a
reason to build a second backend for speed.

## 6. Improving the wasmtime path

The user-visible gap between V8 and wasmtime on VL's output has been, concretely,
**inlined allocation**. Under DRC, a `struct.new` is a `gc_alloc_raw` libcall out of
compiled code on every allocation; V8's advantage was never a smarter collector so
much as an inline bump-pointer sequence in JIT-compiled code. That gap closed
upstream:

- **wasmtime 46** (2026-06-22) made the **copying collector the default**
  ([#13439](https://github.com/bytecodealliance/wasmtime/pull/13439)) and gave it an
  **in-Wasm fast path for its bump allocator**
  ([#13323](https://github.com/bytecodealliance/wasmtime/pull/13323)) — allocation
  compiled inline instead of calling out.
- DRC's GC-triggering heuristics were also adjusted for blowups seen in the wild
  ([#13422](https://github.com/bytecodealliance/wasmtime/pull/13422)), and the GC
  was hardened against heap corruption ([#13321](https://github.com/bytecodealliance/wasmtime/pull/13321),
  [#13320](https://github.com/bytecodealliance/wasmtime/pull/13320)).

VL was pinned to wasmtime 45 *and* explicitly overrode `Collector::Auto` with DRC —
so a version bump alone would not have helped. Both had to change. The copying
collector on 45 is genuinely non-functional, as its docs say: forced on, it panics
mid-collection (`invalid VMGcKind` inside `CopyingHeap::forward`) on the compiler
workload. 47 runs it cleanly.

**Validation of the switch:** native corpus sweep 997 PASS / 3 CHECKFAIL / 0 RUNFAIL
/ 0 LOGDIFF — identical to the pre-change baseline, with the 3 CHECKFAILs being the
documented `xfail` and prose-comment cases. The self-compilation fixpoint holds
byte-for-byte, and all three collectors emit byte-identical modules.

**What remains, beyond the flag:**

1. **Run `wasm-opt` on the default path, or accept the allocations.** Heap2Local is
   the pass that removes allocations rather than speeding them up, and it needs
   inlining first (hence the guidebook's repeated `-O3`). Today it is opt-in via
   `-O`.
2. **Tune the run engine's heap.** Only the null-collector engine gets an explicit
   `gc_heap_reservation`. A semispace collector's reservation *is* its collection
   frequency; the default is currently unexamined.
3. **Expect one `.cwasm` recompile per config change.** The sidecar is keyed on
   engine configuration, so the first run after changing the collector recompiles
   the seed through Cranelift (~3–5 s observed) and rewrites it — including when a
   CI cache restores a sidecar built by a different wasmtime version, which heals on
   first use rather than costing every later invocation. Self-healing, but surprising if
   measured naively — this is why `VL_GC` deliberately does not touch the compiler
   engine.
4. **Budget one slow `ci-native` run per wasmtime bump.** That job's cargo cache is
   keyed on `Cargo.lock`, so a version bump misses it and rebuilds the host from
   scratch — 2m19s observed, against ~30 s for everything else in the job. The
   post-job step saves the new key, so it is a one-time cost per branch. Worth
   knowing before reading a single slow run as a regression.
5. **Watch the Cranelift inliner.** wasmtime still does no GC-aware whole-module
   optimization (`wasm-toolchain-audit.md` §1), so binaryen remains VL's only source
   of Heap2Local. A Cranelift inliner is the prerequisite for that changing.
6. **Re-check `Collector::Copying`'s doc comment.** It still reads "under
   construction and is not yet functional" on `main` while simultaneously being what
   `Auto` selects — stale text, not a status signal. VL should track the release
   notes, not the enum docs.

## 7. Recommendations, sequenced

1. **Done here.** wasmtime 45 → 47; `vl run` defaults to `Collector::Auto` (tracing);
   `VL_GC=auto|tracing|refcount|none` as a documented runtime knob. Largest
   measured win available, and it removes the cyclic-garbage leak.
2. **Close the linear-memory audit gaps** (small, mechanical): either lower the
   declared-but-unimplemented builtins or stop declaring them, and give the
   rejection a diagnostic that says "not implemented" rather than "unknown
   function". *Nearly done:* the seven missing `__load_*__` widths and
   `__memory_size__`/`__memory_grow__` were lowered by the webcraft P0.2 slice, then
   the three WIDE store widths, so **two** remain (`__store_string__`,
   `__log_string__`) and the matrix is symmetric for every scalar VL has. Both halves
   of the diagnostic ask are now closed: an unlowered builtin is a positioned CHECKER
   admission (`nameIsUnimplementedIntrinsic`) rather than `call to unknown function`,
   and the remaining two are the ones that need a design rather than a table row.
3. **Export `ioMem` and implement the bulk staging ABI** the host already
   documents (`<name>Reserve`, `<name>Load`, and a `rbyte` bulk sibling). Removes
   ~3.4M host calls in, ~1M out, per self-compile.
4. **Then** design the linear-memory tier properly — allocator, data section,
   `Buffer`/`Array<T>` surface (`collections-design.md` §OQ.7) — as one deliberate
   escape hatch, not ten intrinsics.
5. **Keep pushing allocation count down** (§4.4): Heap2Local on the default path,
   representation inference, union-arm niches, `Set`'s dead `vals` array.
6. **Do not build a second object model** unless the goal is running on non-GC
   engines — and argue that case on portability, with §3's costs priced in.

## Appendix — reproducing the measurements

```sh
cargo build --release --manifest-path scripts/vl-host/Cargo.toml
VL=scripts/vl-host/target/release/vl

# collector comparison on a prebuilt module (compile time excluded)
$VL build bench.vl -o bench.wasm
for gc in auto tracing refcount none; do VL_GC=$gc $VL run bench.wasm; done

# compile-side phase breakdown (load / stage / compile / readback)
VL_PROFILE=1 $VL build compiler/entry.vl -o /tmp/next.wasm

# function-level attribution inside the compiler wasm (Firefox-profiler JSON)
VL_PROFILE_GUEST=/tmp/prof.json $VL build compiler/entry.vl -o /tmp/next.wasm

# correctness gates
bash scripts/native-corpus-sweep.sh    # expect 997 PASS / 3 CHECKFAIL / 0 RUNFAIL
bash scripts/native-fixpoint.sh        # expect stage3 == stage4 byte-for-byte
```

The two benchmark programs are a depth-16 binary-trees build/check loop (acyclic
churn) and a loop that builds and drops two-node cycles (cyclic churn); peak RSS is
sampled from `/proc/<pid>/status` `VmHWM`.

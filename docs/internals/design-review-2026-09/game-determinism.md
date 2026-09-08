# VL for veldt — adversarial ship review

Reviewer stance: I have shipped console/PC titles at 60fps. I am reading VL as the language
a voxel/rigid-body engine (veldt) would build on top of, not as a compiler-engineering
project. Sources: `/mnt/d/projects/veldt/docs/vl-notes.md`, `docs/internals/simd-design.md`,
`docs/internals/buffer-design.md`, `docs/internals/memory-gc-design.md`,
`docs/internals/concurrency-design.md`, `docs/internals/flat-records-design.md`,
`docs/internals/serde-critique-crosslang.md`, `docs/internals/open-rulings.md`, `ROADMAP.md`,
`DECISIONS.md`, plus direct spot checks with `dist/vl run` against the current seed
(`vl 0.1.0`, commit `58a7f5b0fc47`).

Ranked blockers first. "Blocker" = a real engine cannot ship on this today, full stop.
"Severe" = ships, but the workaround is dangerous or the risk is unquantified. "Annoyance" =
costs time, has a workaround, does not threaten the frame budget or correctness.

---

## BLOCKERS

### 1. There is no SIMD. Not "4x slower" — zero instructions exist.

`grep -rn "v128\|f32x4\|SIMD" compiler/*.vl` returns nothing. `docs/internals/simd-design.md`
is a *survey and recommendation*, explicitly not code: "No compiler source is touched by the
change that carries it." `ROADMAP.md` item 32 lists it as "DESIGNED, gated on owner rulings,"
**blocked on ten separate owner rulings** (O1 library-vs-builtin, O3 lane indexing, O4 operator
overloading, O6 the relaxed-SIMD gate, O7 a `std:vec` layer, ...), none of them made, with a
first buildable slice ("days per slice") that has not started.

veldt calls this "ask #1, the one gap with no workaround," and is right: a CPU-side voxel pass
or rigid-body solver without `v128` is running scalar f32/f64 through a GC'd or Buffer'd
WASM engine with none of `f32x4.add`/`dot`/`min`/`max`. That is not a 4x tax on an otherwise
viable solver — for anything with a non-trivial voxel count or contact count, it is the
difference between real-time and not.

**Sharpest part of this finding:** `ROADMAP.md`'s own ranking criterion ("programs that RUN
per unit of effort") puts SIMD at the *bottom* of a curated list of ~10 tracked items, below a
`for`-loop syntax ruling and a corpus-runner documentation cleanup. That criterion is correct
for a compiler-correctness backlog and actively wrong for a performance-only feature that is
existential for the one real external consumer this repo has. A team optimizing "programs that
run" will never schedule "programs that run 4x too slow to hit 60fps," because by that metric
they already run.

**What a real engine needs:** fixed-width `v128` load/store/arith/compare over `Buffer`,
deterministic by default (see #6), with FMA/relaxed ops opt-in only.
**What VL provides today:** nothing. Not a subset, not a scalar shim with a documented
upgrade path — zero emitted SIMD instructions, and no committed date.

### 2. Zero CPU parallelism story — the owner explicitly ruled it out five weeks ago.

`docs/internals/concurrency-design.md` §6: **"RULED (owner, 2026-08-22): do not ship a
restricted `parMap`."** Reasoning given is sound in isolation (WasmGC references cannot cross
threads yet, so any worker-based API would need permanent, ugly restrictions), but the
practical result is that **no VL program can use more than one core for gameplay/simulation
work, in any form, today.** The only multi-core story is `vl test` running separate OS
processes/instances per test file — not usable inside a running game, since each instance has
its own fresh heap and globals.

Stack this on top of #1: a voxel engine's two most expensive CPU-side jobs — broad-phase /
solver iteration and greedy meshing — get neither data parallelism (SIMD) nor task parallelism
(threads/workers). Every bit of that work runs on one core, scalar. GPU compute via WebGPU
covers embarrassingly-parallel per-voxel work (veldt's own Step-0 spike proves the data plane),
but a rigid-body solver's sequential-impulse iterations and voxel meshing's per-brick job
graph are not naturally GPU-shaped; they are exactly the job-system workload every shipped
engine (Unity's Burst+Jobs, Unreal's task graph, id Tech, etc.) parallelizes across cores.
VL has no equivalent, and has explicitly declined to build even a restricted one.

**What a real engine needs:** a job system — worker threads or `SharedArrayBuffer` +
`Atomics` reaching at least the `Buffer`/linear-memory tier, even if WasmGC objects stay
worker-local.
**What VL provides:** nothing, and a standing ruling against building anything until
shared-memory-threads-for-WasmGC lands upstream in the wasm spec — a dependency on other
people's timeline, not VL's.

### 3. GC pause behavior for a 60fps frame budget has never been measured — and the one
knob that exists doesn't apply to the actual shipping target.

`docs/internals/memory-gc-design.md` is candid about this, which makes it worse, not better:
*"Nothing in VL is latency-sensitive today, so the default is a throughput call."* The default
collector (`tracing`, a semispace **copying, stop-the-world** collector) was chosen and
measured purely on aggregate wall-clock throughput and peak RSS over two synthetic benchmarks
(`trees`, `cycles`). **Pause distribution — the only number a 60fps game cares about — is
never measured anywhere in this document or the repo.** The doc even says outright: *"Only the
null-collector engine gets an explicit `gc_heap_reservation`. A semispace collector's
reservation is its collection frequency; the default is currently unexamined."* Nobody knows
the worst-case single-frame GC hitch on the tracing collector, because nobody has asked.

The alternative collector (`refcount`/DRC) has smaller, incremental pauses (better for
latency) but is **21x slower in throughput** and, worse, **cannot collect cycles at all** — a
40M-node cyclic-garbage benchmark held **175x more memory** under it and leaked for the life of
the process. A physics/scene graph with any back-references (parent/child, contact pairs,
broadphase adjacency — all extremely normal in a rigid-body engine) is exactly a cyclic
structure. Picking the "smoother pauses" collector to protect frame time means picking the one
that leaks your scene graph.

And the knob (`VL_GC=auto|tracing|refcount|none`) is a **native-host-only environment
variable**, read by the `vl` CLI before any guest code runs. The doc says so plainly: *"the
knob applies to the `vl` host. A VL module shipped to a browser gets whatever V8 provides."*
veldt's own Step-0 spike targets `queue.writeBuffer`/WebGPU from a browser — i.e., the actual
deployment target is V8's WasmGC, not wasmtime's. **VL's entire GC-tuning story is inert for
the platform veldt is actually shipping to**, and this repo has not measured, or even
discussed, V8's WasmGC pause characteristics anywhere I can find.

**What a real engine needs:** either (a) a documented, bounded worst-case pause time on the
target runtime, or (b) a hot path that provably never allocates on the GC heap, so pause
frequency is a non-issue regardless of collector.
**What VL provides:** (a) not measured on any target; (b) partially — see #4.

### 4. No arbitrary-lifetime, zero-GC allocator — the fast tier is LIFO-stack-only, and it
was ruled that way on purpose.

This is the sharpest version of the "how do you free entity #5 while #4 and #6 live" question,
and the honest answer splits in two, both bad for different reasons:

- **Put entities in WasmGC-managed structs/arrays** (the ergonomic, default VL surface).
  This *does* correctly support arbitrary lifetimes — WasmGC is a real tracing collector, not
  a bump allocator, so dropping entity #5's reference while #4/#6 live is completely normal
  and gets reclaimed on the next collection. But "gets reclaimed on the next collection" is
  exactly finding #3: an unmeasured, possibly-stop-the-world pause, on a platform (browser)
  VL doesn't control.

- **Put entities in `Buffer` (linear memory)**, VL's only zero-GC tier, to dodge #3 entirely.
  `docs/internals/buffer-design.md` §O6 is unambiguous: **"RULED reclamation YES, via
  MARK/RELEASE... No per-object `free`, and no free list."** `bufferMark()`/`bufferRelease()`
  is bump-pointer LIFO — you can free "everything since mark," never "the specific 200 bytes
  entity #5 was using while #4 and #6 keep theirs." Confirmed directly against
  `std/buffer.vl`'s own header (line 9): *"is LIFO — `bufferRelease(mark)` invalidates every
  `Buf` allocated after `mark`."* The design doc names the consequence itself: *"the first way
  a VL program can hold a DANGLING REFERENCE at all: a `Buf` held across a `bufferRelease`
  still points at live, in-bounds, since-reused linear memory, so reads return someone else's
  bytes and writes corrupt them **silently — no trap**."*

So: arbitrary entity lifetime **or** zero-GC-pause allocation — pick one, VL does not offer
both together. A real ECS with per-entity component pools (the standard shape: dense arrays of
transform/velocity/health, entities spawning and dying every frame in arbitrary order —
projectiles, particles, destroyed voxels) is precisely the case that wants a pool/free-list/
generational-slot allocator over raw memory, with none of the per-access safety net a bump
allocator gives you. **VL ships no such primitive anywhere in `std/`** (checked: no
Pool/SlotMap/FreeList/generational-handle type exists in `std/*.vl`). A team would have to
hand-roll a free-list allocator on top of `Buffer`'s raw bytes themselves, and the moment they
do, they've left VL's memory-safety guarantee behind: a use-after-free of their own slab is a
silent wrong-value bug, not a trap, because `Buffer`'s bounds check only verifies "inside this
`Buf`'s `[0,length)`," not "still yours."

**What a real engine needs:** either a generational/pooled allocator in the standard library
over `Buffer`, or a documented, bounded GC pause budget for the struct-array path.
**What VL provides:** neither. The one "reclamation" feature that exists (mark/release) is
explicitly scoped to init-time scratch allocation ("allocates a few large Buffers at init and
never frees" is literally the design doc's stated use case, §O6), not to a live, churning
entity population.

---

## SEVERE (ships, but the risk is real and currently unquantified or unresolved)

### 5. Determinism: the base arithmetic story is actually good; the edges are not settled.

This needed a spot check rather than trust, so I ran one. Good news first: VL emits ordinary
WASM `f32`/`f64` ops (no SIMD exists at all — see #1 — so there is no relaxed-SIMD risk in
shipping VL code *today*, trivially, because there's no SIMD of any kind to be non-deterministic
with). Plain IEEE-754 WASM arithmetic (add/sub/mul/div/sqrt) is bit-exact and required to be
identical across every conformant engine — genuinely better than native x86/ARM cross-hardware
float determinism, and better than most engines' native code paths. No `--fast-math` or
reassociating flag is passed to `wasm-opt` anywhere in the toolchain (checked
`scripts/vl-host/src/main.rs`), so `-O3` does not silently break bit-exactness either.
`Map`/`Set` are explicitly designed for insertion-ordered iteration "(deterministic, for
multiplayer/replay)" (`DECISIONS.md`, B6a) — someone here has thought about this class of bug.

But two real gaps stand, both **currently unresolved in this repo's own docs, not just
undocumented**:

- **NaN payload bits are implementation-defined across WASM engines** (a spec fact, not a VL
  bug), and `docs/internals/serde-critique-crosslang.md` §(c) catches **two design docs in this
  repo giving opposite advice about it**: the serialization design recommends "bits-verbatim"
  because divergence "is not observed on the engines VL runs on," while
  `docs/webcraft-requirements.md` lists "NaN canonicalization (the WASM NaN-payload
  nondeterminism mitigation)" as a **hard requirement** for the same consumer. That
  contradiction is still open. If veldt ever does full-state hashing for desync detection
  (the standard lockstep-multiplayer technique) and a physics computation produces a NaN
  transiently, the hash can differ across engines/machines for reasons that have nothing to do
  with a real desync. This is exactly the "existential" failure mode the review brief asked
  about, and the repo has correctly identified it and then not closed it.

- **Relaxed SIMD is correctly recognized as non-deterministic in the design doc** (§A4: "a
  determinism gap is exactly what a physics engine's replay/netcode cannot have silently... a
  separately-gated, opt-in tier, never the default") — but this is a paper commitment about a
  feature that does not exist yet (#1). The discipline is right; it has never been tested
  against a real implementation, and "the plan says we'll gate it" is not evidence about what
  actually ships when SIMD lands under schedule pressure years from now.

**Verdict:** VL's determinism instincts are better than most young languages' (insertion-order
maps, no fast-math, correctly wary of relaxed SIMD in the design doc). But "cross-engine
bit-identical replay" is not yet a claim this repo can back with a closed design — it has an
open self-contradiction on NaN handling and an untested policy for the one feature (SIMD) most
likely to tempt someone into non-determinism under a performance deadline.

### 6. `f64`-to-integer casts are unrecoverable process crashes, and the safe alternative
requires discipline the type system doesn't enforce.

Spot-checked directly:

```
function f(d: f64): i32 { return d as! i32 }
print(f(100000000000.0))
```
```
as! i32 at 2:16: not exact
Caused by: wasm trap: wasm `unreachable` instruction executed
```

`as!` traps the entire WASM instance — unrecoverable, no exception handling, total state loss
— on any exact-cast violation. That's a defensible *design* (fail loud rather than silently
wrap/corrupt), and VL does offer `as?` for a nullable, checked alternative. But a rigid-body
solver doing world-to-voxel coordinate conversion, or any float-to-int index math, is exactly
the code that occasionally sees an out-of-range value from numerical blowup or a degenerate
case (an object integrating off into space for one frame before a constraint catches it). One
missed `as?`/clamp anywhere in that code path takes down the **entire running game process**,
with no engine-level recovery (no exceptions to catch a trap mid-frame; a wasm trap unwinds the
whole instance). `docs/internals/open-rulings.md` independently flags this as unresolved: the
plain `f64 as i32` trap-vs-saturate-vs-wrap question is an **open three-way fork with no
ruling**, and the doc names the exact risk: *"webcraft's determinism-critical numeric code
reasoning about the edge"* is blocked on it. This is a known, named, unclosed gap — not a
surprise I'm the first to find.

**What a real engine needs:** either a total (non-trapping) numeric-to-index conversion in the
hot path, or a lint/convention that makes "used `as!` on a physics-derived value" visible in
review — today there is neither.

---

## ANNOYANCES (real, workaroundable, do not block shipping)

### 7. Closures-as-array-elements: mostly fixed. The remaining gap is narrow, not the ECS
killer the framing suggests.

I verified this directly rather than trust the framing. Three realistic ECS/event-system shapes
all **work today**:

- Homogeneous handler table, closures capturing different data, called in a loop: **runs.**
- A growable `((i32) => i32)[]` built with repeated `.push(makeHandler(...))`: **runs.**
- A `System[]` of structs each holding an `update: (i32) => i32` closure field, pushed onto a
  growable array and dispatched through `.update(...)`: **runs.**

The one thing that still fails is narrower than "callback tables don't work":

```
function o(n) {
  function k(x: i32) { return n }
  const fs = [k]
  return fs[0](1)
}
print(o(2)); print(o(2.5))
```
`vl check` passes, then `vl run` fails loudly with `emitProgram: callee is not a function
name`. Per `docs/internals/inventory/D1816.md` (open, re-verified 2026-09-08, "not scheduled"):
this needs a **generic function** whose closure-array literal gets monomorphized at **two
different type instantiations sharing one AST array-literal node** — a specific compiler
representation gap (one arena node can't carry two ref-list signature rows), not a general
statement about closures in arrays. It is also a **loud compile-then-emit failure, not a
silent miscompile** — you find out at build time, not in production.

**Net:** downgraded from the brief's framing. An ECS built the ordinary way (non-generic
handler factories, struct-of-closures, growable arrays) is fine today. Only a generic
higher-order factory returning a closure array hits this, and it fails loudly when it does.

### 8. `flat` records: 4-byte-minimum field width; no packed u8/i8/u16/i16.

veldt's voxel record is `{ sdf: i8, mat: u8 }` — 2 bytes. `flat` (the zero-cost struct-over-
`Buffer` layout feature, confirmed erased entirely at compile time, §4 of
`flat-records-design.md`) currently requires 4-byte-minimum fields, so this has to be hand-
packed through `store8`/`loadU8` with manual offset arithmetic. Works today (veldt confirms
it), but it's exactly the kind of manual bit-twiddling a systems feature is supposed to remove,
and the generic `Rows<T>` accessor that would fix it "is right there" per veldt's own notes —
this is a real, scoped, buildable gap, not a design problem.

### 9. No hot-reload story — not built, not designed, not even listed as rejected.

Zero hits for "hot reload" anywhere in `ROADMAP.md`, `DECISIONS.md`, or `docs/internals/*.md`.
Iteration is full recompile + restart. This is a pure productivity tax on months of gameplay
iteration, not a runtime/frame-budget concern, but it's conspicuous by its total absence from
a project that otherwise documents rejected ideas explicitly (see `concurrency-design.md` §7's
table of rejected async models) — this one was never even considered enough to reject.

### 10. Destructuring absent (`const {x,y,z} = p`).

ROADMAP item 31, "owner ask, not scheduled." Purely ergonomic for vector math; every use site
has a workaround (`p.x`, `p.y`, `p.z`).

---

## Bottom line

The determinism story is the one place VL's instincts are ahead of where I expected — bit-exact
WASM float arithmetic, deterministic map iteration, and a design doc that already worries about
relaxed-SIMD non-determinism before the feature exists. But instinct isn't a shipped guarantee:
the NaN-canonicalization question is an open self-contradiction between two docs in this same
repo, and the cast-trap semantics that determinism-critical numeric code depends on are an
unruled three-way fork.

None of that is what stops a 60fps ship, though. What stops it is compute: **zero SIMD and a
standing ruling against any CPU parallelism** means every expensive voxel/physics workload runs
on one scalar core, indefinitely, with no committed date to fix either half. Layered under that,
the memory story forces a choice nobody should have to make — arbitrary-lifetime entity data
either lives on a GC heap whose real-time pause behavior has never been measured (and, on the
actual browser deployment target, isn't even VL's to control), or it lives in a linear-memory
tier that only knows how to free in LIFO stack order, with silent (non-trapping) corruption
the moment you get that wrong. A tech demo — one persistent world, no dynamic entity churn, no
CPU-bound solver, everything hand-tuned to dodge the GC heap — ships fine. A game does not.

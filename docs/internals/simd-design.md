# SIMD as a first-class feature — survey and recommendation

**The ask.** The veldt voxel / rigid-body engine (`/mnt/d/projects/veldt`, the first external
consumer to own its data plane on VL) files SIMD as **ask #1, "the one gap with no workaround"**: its
CPU-side rigid-body solver and voxel passes are *"~4x off without it."* veldt already proved the data
plane — a `Buf` of SDF bricks read straight into `queue.writeBuffer` with no JS-side array
(`vl-notes.md` step 0) — so the missing piece is width, not plumbing. Its world is `f32` at 8
voxels/metre, `16³` bricks, a **2-byte voxel record** `{ sdf: i8, mat: u8 }`; its mental model is
already `vec4`-shaped because it targets WebGPU/WGSL. This document surveys how a wide gamut of
languages treat SIMD as first-class, works the design axes against VL's actual model (`Buffer`,
unions, tight nominal types, `flat`, `std:*` conventions, a WASM target), and **recommends one
direction**. The owner has since ruled on all ten open questions — §F is rewritten from
questions into decisions, and §D is updated to match. Two rulings moved past the
recommendation: **O4** sanctions operator overloading broadly, for any nominal type under the
orphan rule, not just the SIMD family; **O7** unifies the SIMD and graphics-vector surfaces into
one type family rather than layering a separate `std:vec` on top.

`ROADMAP.md` already reserves the slot — *"SIMD over Buffer (unlocked by P0, not requested yet)"* and,
in the strings design, *"SIMD / word-at-a-time work belongs to `Buffer` (B-mem) — wasm SIMD is
linear-memory-only and a GC `(array i8)` cannot be read as an `i64`/`v128`."* This doc is that item,
now requested.

This is a **design pass. No compiler source is touched by the change that carries it** — the
`compiler/*.vl` gates (`refresh-compiler.sh` / `native-fixpoint.sh` / `lint-self.sh`) therefore do not
apply and were not run; the doc-only PR runs the ordinary docs path. Sibling docs whose style this
matches: `buffer-design.md` (the linear-memory tier this builds on), `flat-records-design.md`,
`numeric-intrinsics.md`.

**Status: the design is finalized; this is not a build ticket.** All ten open questions in §F are
now ruled. The build itself stays gated on two prerequisites: the `std:math` deterministic numeric
substrate (`docs/internals/std-math-design.md`, DESIGNED but not yet built — ROADMAP row 34) that
SIMD's scalar ops sit on, and the type-bound UFCS method resolution that lets `v.dot(w)` resolve as
a method in `F32x4`'s own module with no import — that half is now SHIPPED (#3003 receiver-keyed
operators, #3005 type-bound method fallback), so `std:math` is what remains before S0 can start.

---

## A. The target constraint: what WASM lets VL emit

Every surface below is bounded by one fact: **the only SIMD WebAssembly has is a fixed 128-bit value
type, `v128`, and it lives in linear memory.** VL emits wasm directly (no LLVM legalization pass), so
whatever the surface promises, the emitter has to spell in `v128` opcodes or in scalar loops it writes
itself. There is no free lunch from a backend that splits a wide vector for you.

### A1. `v128` — one type, six lane interpretations

`v128` is 128 bits with no lane type of its own; each *instruction* imposes an interpretation:

| shape | lanes | veldt use |
| --- | --- | --- |
| `f32x4` | 4 × f32 | **the workhorse** — solver state (SoA position/velocity columns), vector math |
| `f64x2` | 2 × f64 | double-precision accumulation if the solver needs it |
| `i32x4` | 4 × i32 | indices, connectivity, packed masks |
| `i16x8` | 8 × i16 | `dot` accumulation, quantised intermediates |
| `i8x16` / `u8x16` | 16 × i8/u8 | **voxel bytes** — 16 SDF or material bytes per op |
| `i64x2` | 2 × i64 | wide integer / bit-twiddling |

The width is **not negotiable**: there is no `v256`, no scalable vector, no way to ask for 8×f32. A
surface that exposes `f32x8` must be lowered by VL as *two* `v128`s, by hand.

### A2. Linear-memory-only — this is why SIMD is a `Buffer` feature, not a `string`/array feature

`v128.load` / `v128.store` read and write 16 bytes of **linear memory** at a computed address. There
is **no** instruction that reads a `v128` out of a WasmGC `(array i8)` / `(array f32)` — GC arrays are
opaque managed objects with no addressable bytes. VL's collections (`T[]`, `string`) are WasmGC; VL's
`Buffer` (`std:buffer`, a `Buf = { base, length }` over linear memory) is the **one place a `v128` can
come from or go to.** So SIMD is structurally a member of the `Buffer` tier — the same "one deliberate
escape to linear memory" `DECISIONS.md` already rules is the sole self-managed memory model. This is
settled by the target, not a choice.

A `flat`-record array *is* addressable bytes in a `Buffer` (`flat-records-design.md`), so a `flat`
struct laid out as four contiguous `f32` (a 16-byte `vec4` row) **can** be read as one `f32x4` — see
§D5. That interop is the reason `flat` and SIMD are co-designed.

### A3. The instruction families (the emit budget)

WASM SIMD is ~236 opcodes; relaxed-SIMD adds ~18. Grouped by what a surface needs:

- **Construct** — `v128.const` (16 immediate bytes); `iNxM.splat` / `fNxM.splat` (one scalar → all
  lanes).
- **Lane access** — `extract_lane` (ints carry a signedness: `i8x16.extract_lane_s/_u`),
  `replace_lane`. **The lane index is an immediate byte, not a stack operand** — a *runtime* lane
  index has no instruction and must spill to memory and re-index. This constraint drives §D4/§F.
- **Arithmetic** — `add` `sub` `mul` `neg`; floats add `div` `min` `max` `pmin` `pmax` `sqrt` `abs`
  `ceil` `floor` `trunc` `nearest`; ints add `min_s/u` `max_s/u` `avgr_u` `abs`, shifts (`shl`
  `shr_s/u`), `extmul`/`extadd_pairwise`, and the one horizontal primitive `i32x4.dot_i16x8_s`.
- **Compare → mask** — `eq` `ne` `lt` `le` `gt` `ge` (ints carry signedness) produce a **lane mask**:
  a `v128` whose lane is all-ones (`-1`) where true, all-zeros where false. There is no separate mask
  type in wasm — a mask *is* a `v128`.
- **Bitwise / blend** — `v128.and` `or` `xor` `not` `andnot`, and `v128.bitselect(a, b, mask)` (the
  `select` primitive).
- **Boolean reductions** — `v128.any_true`, `iNxM.all_true`, `iNxM.bitmask` (→ i32, one bit/lane).
  **These are the only horizontal ops.** A horizontal `sum`/`min`/`max` is built from shuffle + lane
  op by hand.
- **Shuffle / swizzle** — `i8x16.shuffle` (16 **immediate** lane indices, compile-time constant) and
  `i8x16.swizzle` (a dynamic index vector). Again the static form needs a compile-time immediate.
- **Convert / narrow / widen** — `f32x4.convert_i32x4_s/u`, `i32x4.trunc_sat_f32x4_s/u`,
  `f64x2.promote_low_f32x4`, `f32x4.demote_f64x2_zero`, `iNxM.narrow_*`, `extend_low/high_s/u`,
  widening loads (`v128.load8x8_s`, `v128.load32_zero`, `load*_splat`, `load*_lane`).

**Encoding shape** (for §D6): every SIMD instruction is `0xFD <LEB u32 sub-opcode> <immediates>`.
Unlike the `0xfc` misc prefix already in the emitter (whose 10/11 sub-opcodes fit one byte), SIMD
sub-opcodes run past 127 (`f32x4.add` is 228), so a **true multi-byte LEB** is required. Loads/stores
carry a memarg; lane ops carry a 1-byte lane immediate; `shuffle` carries 16 immediate bytes. The
emitter already writes two prefixed families (`0xfb` GC, `0xfc` misc) — SIMD is a third of the same
shape.

### A4. Relaxed SIMD — one flag, because it is non-deterministic

Relaxed SIMD (standardized 2024, **part of Wasm 3.0**) adds the instructions hardware can do faster
but not identically: **FMA** (`f32x4.relaxed_madd`), relaxed swizzle, relaxed trunc, relaxed dot,
relaxed min/max. They are **non-deterministic** — the same inputs may give different results on
different hardware (FMA single- vs double-rounds; an out-of-range swizzle lane is
implementation-defined). And they are **not universally enabled** (Firefox unflagged in 2025, Safari
still behind a flag). For a solver, FMA is the single biggest win *and* the single correctness
hazard — a determinism gap is exactly what a physics engine's replay/netcode cannot have silently. So
relaxed SIMD is a **separately-gated, opt-in tier**, never the default (§D7, §F O6).

**This is a different hazard than standard-op NaN nondeterminism, not a bigger dose of it.**
The WASM spec also permits an implementation-defined bit pattern for a *freshly-produced* NaN
from an ordinary (non-relaxed) float op — that is real and separate from relaxed SIMD, and this
section should not be read as claiming standard ops are deterministic *by spec*. What makes
relaxed SIMD the one gated tier is that its nondeterminism changes actual **finite** results
based on the executing hardware (FMA's single- vs. double-rounding), with no observed
convergence across engines the way NaN bit patterns have — see
`docs/internals/numeric-determinism-rulings.md` §4 for the measurement (`serde-design.md` OQ-3)
showing VL's two target engines agree on NaN bit patterns today, and for why that is treated as
a verified engineering commitment rather than a spec guarantee.

### A5. Availability — fixed 128-bit SIMD is baseline, so v1 can require it

Fixed-width SIMD reached phase 5 in 2021 and ships unflagged in every engine veldt targets — all
browsers' WASM, wasmtime, Deno, Node. It is part of Wasm 3.0's core. **VL can therefore require it**
(a module that uses SIMD simply declares the feature; a host without it is a non-target), and does not
owe a portable scalar fallback in v1 the way a native compiler targeting a 2012 CPU would. The
fallback story still matters as a *possibility* (§D7) and as the thing that lets the surface be
tested against a scalar oracle — but it is not on the critical path.

---

## B. The survey — how a wide gamut of languages expose SIMD

Read the table for the shape of each design; the prose picks out what VL can borrow. **"Width"** is
the pivotal column: fixed-width models map to `v128` 1:1, width-agnostic models push a legalization
burden onto the compiler, SPMD hides lanes entirely.

| language | surface | type spelling | width model | mask / reduce / swizzle | portability / fallback | what VL borrows |
| --- | --- | --- | --- | --- | --- | --- |
| **WASM SIMD** | the target | `v128` | **fixed 128-bit** | mask = a `v128`; `bitmask`/`all_true`; `shuffle`/`swizzle` | it *is* the portable layer; scalar lowering is the toolchain's job | the whole instruction budget; the linear-memory constraint |
| **Zig** | language builtin | `@Vector(N, T)` | **arbitrary N**, compiler legalizes | ops overload (`+`,`==`→bool vector); `@reduce`, `@shuffle`, `@select`, `@splat` | LLVM splits wide vectors to target width | operators overload elementwise; `@reduce(.Add, v)` naming; `@splat` |
| **Mojo** | core numeric type | `SIMD[dtype, size]`; `Scalar=SIMD[_,1]` | **arbitrary size** (power of two) | `.reduce_add()`, `.select()`, `.shuffle()`, comparisons → `SIMD[bool,N]` | maps to target width; `size` is a compile-time param | *scalars are 1-lane vectors* is the boldest idea; methods over a value type |
| **Rust** | two libraries | `core::arch` intrinsics **vs** `std::simd::Simd<T,N>` + `Mask<T,N>` | intrinsics fixed; portable `Simd<T,N>` arbitrary N | `Mask<T,N>` distinct type; `.reduce_sum()`; `simd_swizzle!` | portable-simd **still nightly in 2026** — masks & swizzle API are the blockers | a **distinct `Mask` type**; the two-tier (raw intrinsic + portable) split |
| **C / C++** | many | `__m128`; GCC/Clang `vector_size`; `std::experimental::simd`; `#pragma omp simd`; **Google Highway** | fixed per intrinsic; Highway **scalable** (`ScalableTag`) | Highway `Mask`, `ReduceSum`, `TableLookupLanes` | Highway dispatches per-target at runtime; intrinsics don't port | Highway proves a *portable library* over fixed ISAs is viable; `vector_size` = elementwise operators |
| **C#** | two-tier library | `Vector<T>` (agnostic width) **vs** `Vector128<T>` (fixed) | one agnostic + one fixed, side by side | `Vector.ConditionalSelect`, `Vector.Dot`, `Shuffle` | JIT picks width for `Vector<T>`; `Vector128` is exact | **the two-tier model** — an agnostic tier for portable loops, a fixed tier for exact control |
| **Swift** | stdlib types | `SIMD2/3/4/8/16<T>`, `simd_float4x4` | **fixed small N (2–16)** | `.max()`, `pointwiseMin`, `SIMDMask`, `.replacing(with:where:)`, `.x/.y/.z/.w` + swizzles | scalar fallback in the stdlib; graphics-tuned | **fixed named types + `.xyzw` swizzles** — closest to veldt's `vec4` model |
| **ISPC** | SPMD-on-SIMD | `uniform` / `varying`; `programCount`/`programIndex` | implicit — the compiler runs N program instances across lanes | lanes are implicit; `reduce_add`, `shuffle`; masks are control flow | one source, many ISA targets compiled ahead | the *contrast*: implicit lanes are powerful but alien to VL's explicit-value model |
| **WGSL / HLSL / GLSL** | first-class vectors | `vec4<f32>` / `float4` / `vec4` | **fixed 2/3/4** | `.xyzw`/`.rgba` swizzles, `dot`, `cross`, `mix`, comparisons → `vecN<bool>` | it's the GPU's native width; no fallback needed | **veldt already thinks in these** — swizzles, `dot`, componentwise ops are the ergonomic bar |
| **Julia** | auto + library | `@simd for`; `SIMD.jl` `Vec{N,T}` | agnostic (`@simd` hint) / fixed (`Vec{N,T}`) | `SIMD.jl` `vifelse`, `sum(v)`, `shufflevector` | LLVM vectorizer; `@simd` is advisory | `@simd`-as-a-hint is the auto-vectorize model to *contrast* with explicit vectors |
| **Go** | two-tier (new) | `simd/archsimd` (fixed, arch) **+** `simd` (portable, agnostic) — Go 1.26/1.27, `GOEXPERIMENT=simd` | arch tier fixed; portable tier agnostic; **1.27 added WASM 128-bit** | portable package; masks/reductions per the new API | experimental; portable tier "vector-size-agnostic" | a *fresh* two-tier design landing in 2026 with a WASM 128-bit target — direct prior art |
| **Futhark / Halide / APL/J** | whole-array data-parallel | no vector type — `map`/`reduce` over arrays | the compiler chooses vector width during codegen | reductions are language primitives (`reduce (+) 0 xs`) | Futhark→multiple backends; Halide schedules `vectorize(x, 8)` | the *auto-vectorize-a-whole-op* model — VL's `T[]` map could vectorize, but not over `Buffer` |
| **ARM SVE / RISC-V RVV** | scalable vectors | `svfloat32_t` / RVV `vsetvl` + length-agnostic loops | **length-agnostic** — width unknown at compile time; a loop asks "how many lanes this iteration?" | predicate registers (first-class masks); scalable reductions | one binary runs on any vector length | the *cautionary* contrast: a length-agnostic surface is **wrong for a fixed-128 target** — don't bake in "unknown width" VL can never honour |

### B1. WASM SIMD (the target)

Covered in §A. The point for the survey: WASM SIMD is itself a *portability layer* — it is the "one
fixed width" every source language legalizes *down to*. VL is unusual in that its target already fixes
the width, so VL does not need the legalization machinery Zig/Mojo/LLVM carry. That is a
simplification VL should *keep*, not spend.

### B2. Zig — `@Vector(N, T)`, operators overload, three builtins do the rest

Zig makes vectors a builtin type: `@Vector(4, f32)`. Arithmetic operators work elementwise (`a + b`),
comparisons yield a bool vector, and three builtins cover the rest: `@reduce(.Add, v)`, `@shuffle(T,
a, b, mask)`, `@splat(v)`. `N` is arbitrary; LLVM legalizes to target width. **Borrow:** the operator
overloading and the tiny, orthogonal builtin set (`reduce`/`shuffle`/`splat`) — VL should not invent a
sprawling method surface when three named operations plus operators cover most kernels.

### B3. Mojo — SIMD is *the* scalar type

Mojo's most radical idea: `SIMD[dtype, size]` is the fundamental numeric type, and a **scalar is
`SIMD[dtype, 1]`** — `Float32` literally *is* `SIMD[DType.float32, 1]`. There is no separate scalar/
vector distinction; a `size`-parameterised value with elementwise ops, `.reduce_add()`, `.select()`,
comparisons yielding `SIMD[bool, N]`. **Borrow (carefully):** the *conceptual unification* is elegant
but it depends on `size` being a compile-time value parameter — Mojo has const/value generics, VL does
not (`A10 const generics` is unresolved). Collapsing VL's scalars into 1-lane vectors would be a
language-defining move far beyond veldt's ask. **Do not adopt the unification; do borrow the "a vector
is a value with elementwise operators and a reduce" ergonomic.**

### B4. Rust — the two-tier split, and a distinct `Mask` type

Rust has `core::arch` (raw, per-ISA, `unsafe`-ish intrinsics) and `std::simd` (portable `Simd<T, N>`
with a **distinct `Mask<T, N>` type**). portable-simd exists precisely because raw intrinsics don't
port and are miserable to write. It is **still nightly-only in February 2026**, and the named blockers
are instructive: *mask element types* (should `Mask` for `Simd<f32,N>` be `i32`-shaped?) and *swizzle
API* (compile-time lane indices are hard to make ergonomic). **Borrow:** (1) a **distinct mask type**
rather than "a mask is just another vector" — it prevents a lane mask being used as data and matches
VL's `F32View`/`I32View` brand discipline; (2) heed the warning — masks and static swizzle are the two
places a SIMD surface goes wrong, so design them first, not last.

### B5. C / C++ — intrinsics, vector extensions, and Highway

Four surfaces coexist: `__m128` + `_mm_*` intrinsics (fixed, per-ISA), GCC/Clang `__attribute__((vector_size(16)))`
(operators overload, compiler legalizes), `std::experimental::simd` (a portable `simd<T, Abi>`), and
`#pragma omp simd` (auto-vectorize a loop). The one worth studying is **Google Highway**: a portable
*library* that expresses a kernel once over an abstract `Vec<D>` and dispatches to the best available
ISA at runtime, with `Mask`, `ReduceSum`, `TableLookupLanes`. **Borrow:** Highway is the proof that a
**library** surface over a fixed-instruction target is not a compromise — it is a widely-shipped,
performant design. VL's target is *singular* (one ISA: wasm SIMD), so VL needs none of Highway's
runtime dispatch — which makes VL's library job *strictly easier* than Highway's.

### B6. C# — the two-tier model, stated cleanly

C# ships `System.Numerics.Vector<T>` (**width chosen by the JIT** — write a loop, it runs at the
machine's width) *and* `System.Runtime.Intrinsics.Vector128<T>`/`Vector256<T>` (**fixed**, exact
control). The two tiers answer two needs: a portable "just vectorize my loop" tier and a "I know the
ISA and want this exact shuffle" tier. **Borrow / reject for VL:** the model is instructive, but VL's
target has **one** width — an agnostic `Vector<T>` tier would *always* resolve to 128 bits, so it buys
nothing over a fixed `F32x4` except a false promise of portability across widths VL can never emit.
**VL should ship only the fixed tier**, and this is the sharpest lesson in the survey: *the two-tier
model is a response to variable hardware width VL does not have.*

### B7. Swift — fixed named types with `.xyzw` swizzles (closest to veldt)

Swift's stdlib has `SIMD2/3/4/8/16<T>` and the graphics-tuned `simd` module (`simd_float4x4`, `dot`,
`cross`, `normalize`). Element access is `.x/.y/.z/.w` (and `.r/.g/.b/.a`), with swizzles, `pointwiseMin`,
`.replacing(with:where:)` and a `SIMDMask`. This is **the closest existing design to veldt's mental
model** — fixed small vectors, componentwise ops, named lanes. **Borrow:** the fixed-named-type family
(`F32x4` is Swift's `SIMD4<Float>`), the distinct mask, and — as a *graphics layer on top*, not the
SIMD core — the `.xyz`/`dot`/`cross` vocabulary veldt actually writes.

### B8. ISPC — the SPMD contrast (implicit lanes)

ISPC compiles one "kernel" as if many program instances run in parallel, one per SIMD lane:
`uniform`/`varying` qualify whether a value is shared across lanes or per-lane, and `programCount`/
`programIndex` expose the lane geometry. Masks are *control flow* — an `if` over a `varying` condition
masks lanes automatically. This is a genuinely different and powerful model (write scalar-looking
code, get vector execution). **Reject for VL, but state why:** SPMD requires the compiler to
vectorize control flow and to make every value implicitly lane-wide — a whole-language execution model,
not a type. It is the opposite of VL's explicit-value, "you can see the wasm" aesthetic, and it is
enormously more compiler work than veldt's ask. Named here so the option is on the record as
*considered and declined*.

### B9. GPU shading languages — the ergonomic bar veldt already lives at

WGSL (`vec4<f32>`), HLSL (`float4`), GLSL (`vec4`) treat 2/3/4-vectors as first-class with `.xyzw`/
`.rgba` swizzles, componentwise arithmetic, and `dot`/`cross`/`mix`/comparisons yielding boolean
vectors. veldt's meshing and CSG passes are WGSL; **its authors already think in `vec4`.** **Borrow:**
match this vocabulary in the *graphics layer* so the CPU-side and GPU-side code read alike — but keep
it a library on top of the SIMD core (a `vec3` is 3 lanes of a 4-lane `f32x4` with `w` ignored;
swizzles on the CPU are `shuffle` immediates).

### B10. Julia / Go / data-parallel

- **Julia** — `@simd for` is an *advisory hint* to LLVM's vectorizer (reorder-associative-reductions
  permitted); `SIMD.jl` adds explicit `Vec{N,T}`. The hint model is the auto-vectorize school: cheap
  to write, unpredictable to reason about. VL's ethos ("you can see the wasm") argues **against** an
  advisory hint as the *primary* surface — but a `@simd`-style hint on a `Buffer` loop is a plausible
  *future* second tier once explicit vectors exist.
- **Go (2026)** — the freshest prior art: Go 1.26 shipped `simd/archsimd` (fixed, arch-specific,
  `GOEXPERIMENT=simd`); Go 1.27 added a **portable, vector-size-agnostic `simd` package** *and a WASM
  128-bit target*. Go independently arrived at the two-tier (arch + portable) shape — and is adding a
  wasm 128-bit lowering, the exact thing VL emits. Worth tracking as a live reference implementation.
- **Futhark / Halide / APL/J** — no vector *type*; you write `map`/`reduce` over whole arrays and the
  compiler vectorizes. This is the "vectorize a whole array op" model. It *could* apply to VL's `T[]`
  (a `map` over a WasmGC array), but **not** to `Buffer` — and SIMD in VL is a `Buffer` feature, so
  auto-vectorizing `T[]` is a different, GC-side project, not this one.

### B11. Scalable vectors (SVE / RVV) — the cautionary contrast

ARM SVE and RISC-V RVV are **length-agnostic**: the vector width is unknown at compile time, and a
loop asks the hardware "how many lanes this iteration?" (`svcntw`, `vsetvl`), with first-class
predicate registers as masks. One binary runs on any width. **This is exactly the wrong shape to bake
into a fixed-128 target.** A width-agnostic VL surface would promise the program cannot see the width —
but VL's *only* width is 4×f32, and hiding that helps no one while costing the ability to write a
`shuffle` immediate or a 4-lane literal. The survey's scalable end confirms the recommendation from
the other direction: **VL should bake in the fixed width WASM gives it, not abstract over a width it
cannot vary.**

---

## C. The design axes

The seven axes the recommendation must settle, each with where the survey lands.

1. **First-class TYPE vs library type vs intrinsics-only.** Zig/Mojo make it a language type; Rust/
   C#/Highway/SIMD.jl make it a library; raw `core::arch`/`__m128` are intrinsics. **VL's own
   precedent is decisive:** `std:buffer` puts the *nominal types* (`Buf`, `F32View`, `F32Base`) and
   the whole method surface in **std**, over a thin family of compiler intrinsics — *"I don't want
   buffer built into the compiler; I want it in std"* (owner ruling, `buffer-design.md` O1). SIMD is
   the identical shape: a thin intrinsic family + a `std:simd` type surface. → **Library types over a
   new intrinsic family.**

2. **Explicit vectors vs auto-vectorize hints vs SPMD.** Explicit (Zig/Mojo/Rust/Swift/C#) vs hints
   (Julia `@simd`, OpenMP) vs SPMD (ISPC). VL's "you can see the wasm" ethos and the need for a
   *predictable* solver rule out an advisory hint as the primary surface, and SPMD is a whole
   execution model. → **Explicit vectors.** (A `@simd` loop hint stays open as a future second tier.)

3. **Fixed width vs width-agnostic.** WASM has one width; C#'s agnostic `Vector<T>` and SVE/RVV's
   length-agnosticism answer variable *hardware* VL does not have; every agnostic surface would resolve
   to 128 bits and promise a portability VL cannot deliver. → **Fixed width, matching `v128`'s six
   lane shapes.**

4. **Load/store from `Buffer`, and `flat` interop.** `v128.load`/`store` are the only path, and they
   read/write 16 bytes of linear memory — which is exactly a `Buf` sub-range and exactly a 16-byte
   `flat` row. → **Load/store are `Buf`-based; a `flat` array of a 16-byte record reads as a vector.**
   (§D5.)

5. **The minimum op set.** From the survey's intersection: construct (`splat`, lane-literal, load),
   lane extract/replace, elementwise arithmetic + min/max/abs/sqrt, compare→mask + `select`,
   horizontal reductions + `dot`, and shuffle/swizzle. → **§D4 fixes the exact list.**

6. **Portability / fallback.** Fixed SIMD is baseline (§A5), so v1 requires it; relaxed SIMD is
   non-deterministic and flagged, so it is opt-in with a strict fallback. → **Require base SIMD;
   gate relaxed SIMD.**

7. **Fit with VL's aesthetic.** Tight nominal types (distinct `F32x4` vs `I32x4`, distinct `Mask`, so
   lanes cannot be reinterpreted by accident — the exact argument that made `F32View` and `I32View`
   separate types); `std:*` library conventions; operators where VL already overloads them (`"[]"`,
   and now `"+"`/`"-"`/`"*"`/`"/"` per receiver type since #3003 — A13's separate question, whether
   a `"+"`-named struct FIELD is spellable, is unrelated and still open). → **Nominal fixed types
   in `std:simd`, with vector arithmetic and geometry operators defined directly on those types
   under the general receiver-keyed mechanism (O4).**

---

## D. The recommended surface

**One-line ruling (O1, O9, O10): a fixed-width, nominally-typed SIMD *library* (`std:simd`) — a closed
family of `new`-newtype vector types matching WASM's `v128` lane shapes, built on a thin new
`__…_v128__` intrinsic family in the emitter, mirroring exactly how `std:buffer` wraps the memory
intrinsics.** Not a language-level generic `SIMD[T, N]` / `@Vector(N, T)` — WASM's single fixed width
makes a generic low-value, and it is blocked on const-generics (A10) regardless.

This is the ruled direction — §F O1 records the reasoning and the two places (O4, O7) the
owner's ruling moved past this section's own recommendation.

### D1. The type family

A closed set of nominal vector types, each a branded newtype over the opaque 128-bit value — distinct
types so an `f32x4` can never read `i32x4` bytes, the same reasoning that keeps `F32View` and `I32View`
apart in `std:buffer`:

```vl
export type F32x4 = new v128     // 4 × f32   — the workhorse
export type F64x2 = new v128     // 2 × f64
export type I32x4 = new v128     // 4 × i32
export type U32x4 = new v128     // 4 × u32
export type I16x8 = new v128     // 8 × i16
export type I8x16 = new v128     // 16 × i8
export type U8x16 = new v128     // 16 × u8   — voxel bytes
export type I64x2 = new v128     // 2 × i64

export type Mask32x4 = new v128  // a lane mask over a 4-lane vector
export type Mask8x16 = new v128  // a lane mask over a 16-lane vector
```

`v128` is a **new primitive scalar type** the compiler knows (declared beside `i32`/`f32` in
`typecheck.vl`, one WasmGC-invisible scalar the way `i64` is), never spelled by users directly — it is
the substrate the newtypes brand. Users only ever hold `F32x4` and friends. **Ruled (O2):**
`F32x4` is the spelling; a `vec4f` alias may be added later purely for WGSL familiarity, but
`F32x4` stays canonical — every other API in this doc, including O7's geometry methods, is defined
against it.

### D2. Construction

```vl
export function splatF32(x: f32): F32x4           // f32x4.splat — all four lanes = x
export function f32x4(a: f32, b: f32, c: f32, d: f32): F32x4   // build from four lanes
export function splatU8(x: i32): U8x16            // u8x16.splat
// … one splat per shape, one lane-literal constructor per shape
```

`f32x4(a,b,c,d)` lowers to `splat a` then three `replace_lane`; when all four are compile-time
constants it folds to a single `v128.const`.

### D3. Load / store from a `Buf` (the only I/O path)

Loads and stores live in `std:simd` (importing `Buf` from `std:buffer`), so `std:buffer` stays
width-agnostic and SIMD is one import:

```vl
export function loadF32x4(self: Buf, off: i32): F32x4          // v128.load  at base+off
export function storeF32x4(self: Buf, off: i32, v: F32x4)      // v128.store at base+off
export function loadU8x16(self: Buf, off: i32): U8x16
export function storeU8x16(self: Buf, off: i32, v: U8x16)
// … per shape; plus the specials:
export function loadF32Splat(self: Buf, off: i32): F32x4       // v128.load32_splat
export function loadU8x8Widen(self: Buf, off: i32): I16x8      // v128.load8x8_u — 8 bytes → 8×i16
```

**Alignment: unaligned by default (align exponent 0).** WASM alignment is a hint, never a constraint,
and x86/arm64 run unaligned `v128.load` at full speed. This lets a vector be read at *any* `Buf`
offset — veldt's 2-byte voxel records are not 16-aligned — matching `std:buffer`'s existing "correct
at every address" stance for its narrow stores. A future `loadF32x4Aligned` (align 4) is a pure
performance option, not a correctness one. (§F O5.)

**Bounds:** like `std:buffer`'s raw loads, `loadF32x4` reads 16 bytes past `base+off` with no bounds
check (a read past a `Buf` is still inside the memory and nothing would catch it); a checked
`v128view` mirroring `f32view` — one range check at view creation, then unchecked lane loads — is the
safe wrapper, and is the same descriptor shape `buffer-design.md` §L already ships for scalars.

### D4. The op set (minimum viable, fixed here)

Grouped as §A3. Operators overload under the general receiver-keyed, orphan-rule-gated
mechanism (§F O4, shipped as #3003) — not a SIMD-specific carve-out; every op also has a named
function so the surface reads the same whether a kernel prefers `a*b + c` or
`addF32x4(mulF32x4(a,b), c)`.

- **Arithmetic** — `"+"` `"-"` `"*"` `"/"` (or `addF32x4`/… ), `minF32x4` `maxF32x4` `absF32x4`
  `sqrtF32x4` `negF32x4`; integer shapes add `min_s/u`, `max_s/u`, shifts, `avgrU8x16`.
- **Lane access** — `laneF32x4(v, i)` (extract) / `withLaneF32x4(v, i, x)` (replace). **`i` must be a
  compile-time constant** (the wasm lane immediate — `extract_lane`/`replace_lane` take a byte
  immediate, not a stack operand); a non-constant index is a checker error naming the constraint
  (§F O3, ruled). **Ruled addition:** named `.x`/`.y`/`.z`/`.w` accessors on the 4-lane shapes cover
  the common case with no index at all, so a numeric `laneF32x4` call is rarely needed in practice.
  A runtime-index fallback (spill to memory, index the spill) stays DEFERRED, not designed away — it
  answers a genuinely-dynamic-index kernel once one shows up, without holding up v1.
- **Compare → mask** — `ltF32x4(a, b): Mask32x4`, `eq`/`ne`/`le`/`gt`/`ge`; then
  `selectF32x4(m: Mask32x4, a: F32x4, b: F32x4): F32x4` (`v128.bitselect`), `anyTrue(m): bool`,
  `allTrue(m): bool`, `bitmaskF32x4(m): i32` (one bit per lane, for a scalar branch).
- **Reductions** — `reduceAddF32x4(v): f32`, `reduceMin`/`reduceMax` (lowered as `shuffle`+op, since
  WASM has no horizontal reduce), and `dotI16x8(a, b): I32x4` (the one hardware horizontal,
  `i32x4.dot_i16x8_s`).
- **Shuffle / swizzle** — `swizzleU8x16(v, idx: U8x16): U8x16` (dynamic, `i8x16.swizzle`) plus a small
  set of **named** static shuffles (`reverseF32x4`, `rotateF32x4`, `interleaveLowF32x4`/`High`),
  because a *general* static `shuffle<i0,i1,i2,i3>` needs a compile-time immediate VL cannot yet
  spell without const-generics (§F O3/O10). Arbitrary static shuffle stays deferred — **ruled
  permanently optional, not a placeholder for const-generics** (O10): the fixed named family is the
  permanent surface, not a stand-in for a future generic one.
- **Convert / widen / narrow** — `convertI32x4ToF32x4`, `truncF32x4ToI32x4`, `widenLowU8x16` →
  `I16x8`, `narrowI16x8` → `U8x16`, `promoteF32x4Low` → `F64x2`, `demoteF64x2` → `F32x4`.

### D5. `flat` interop, and why there is no separate `std:vec` (O7, ruled)

A `flat` record laid out as four contiguous `f32` is a 16-byte `vec4` row in a `Buffer`, so a `flat`
array (`buf.rows<T>` from `flat-records-design.md`) of such rows reads as `F32x4` with no copy:

```vl
flat type Vec4 = { x: f32, y: f32, z: f32, w: f32 }   // 16 bytes, offsets 0/4/8/12
// rows: Rows<Vec4> over a Buf
const v = loadF32x4(buf, rowByteAddr(rows, i))         // one v128.load of row i
```

This is the reason `flat` and SIMD are co-designed, and it is exactly veldt's SoA solver columns and
its `vec4` math. The narrow shapes tie to veldt ask #3 (byte/sub-byte `flat` fields): a `flat` array
of the 2-byte voxel record, read 8 rows at a time as an `I16x8`/two `U8x16`, is the voxel pass that is
"~4x off" today.

**Ruled (O7): unify, don't layer.** The owner declined this document's own "separate `std:vec`"
recommendation (§F O7) — graphics and compute are the SAME type family. `F32x4` *is* the graphics
`vec4`: `dot`, `cross`, `normalize` and swizzle (via the named `.x/.y/.z/.w` accessors, O3) are
METHODS on the vector types themselves, not a separate `Vec3`/`Vec4`/`Mat4` layer built on top.
`vec3` values are represented as an `F32x4` with the fourth lane padded and ignored — the GPU
convention (the same layout WGSL rounds a `vec3<f32>` up to inside a uniform buffer), so there is
one 16-byte value shape for 3- and 4-component vectors, not two. This matches both consumers'
mental model directly: veldt and sunsuz already think in `vec4`-shaped WGSL, and a CPU-side
`F32x4` and a GPU-side `vec4<f32>` now share one bit layout, so a `flat` row built for
`queue.writeBuffer` needs no repacking on the way out. (The `flat type Vec4` above is a
*storage-layout* record for a `Buf`'s rows — unrelated to this question; the in-register value a
program computes with is `F32x4` itself, not a second `Vec4` value type.)

### D6. Lowering to `v128`

The emitter learns a third prefixed instruction family, structurally identical to the `0xfb` (GC) and
`0xfc` (misc) families it already writes:

- **A new scalar rep** `REP_SCAL_V128` (beside `REP_SCAL_I64`/`F64`/`F32` in `emit_rep.vl`), so a
  vector value flows through locals/params/returns as a `v128` wasm type. WasmGC-invisible, exactly
  like `i64`.
- **New intrinsics** declared in `typecheck.vl` (the `declare(...)` block that holds `__load_f32__`
  et al.): `__load_v128__` / `__store_v128__`, `__splat_f32x4__`, `__add_f32x4__`, `__extract_lane_f32x4__`,
  `__cmp_lt_f32x4__`, `__bitselect__`, `__shuffle_*__`, … one per instruction the surface needs (~60
  for the shapes above).
- **A `0xFD`-prefix byte-writer** in `emit_bytes.vl`/`wasmEmit.vl`: `fbSimd(subOp, immediates...)`
  writing `0xFD <wULEB subOp> <memarg|lane|shuffle-bytes>`. **The sub-opcode is a real LEB** (past
  127) — the one difference from the `0xfc` writer, whose 10/11 fit a byte.
- **Opcode tables** mirroring `memLoadOpcode`/`memStoreOpcode`: name → `0xFD` sub-opcode + immediate
  shape.
- **The memory gate** (`memUsed`, §`emit_state.vl`) already forces the module's memory for
  `__load_i32__`; the v128 load/store hooks the same gate, and the host `--enable-simd` flag joins
  `--enable-bulk-memory` in `optimize_in_place`/`disassemble_to_wat` (mirroring `buffer-design.md`
  S0), so `vl build -O` and `wasm-dis` handle the new opcodes.

`std:simd` (ordinary VL, zero further compiler lines) then wraps each intrinsic in the typed,
brand-checked function — the `buffer.vl` pattern exactly.

### D7. Scalar fallback

v1 **requires** base SIMD (§A5) — no portable fallback, because every engine veldt targets has it.
The fallback is designed but **not built**, kept as the option that (a) lets `std:simd` be validated
against a scalar oracle and (b) answers a future non-SIMD target:

- A `-mno-simd` build would lower each vector intrinsic to a **4-lane (or 16-lane) scalar loop** over a
  16-byte scratch spill: `splatF32` becomes four `f32.store`s; `"+"(a,b)` spills both, adds
  lane-by-lane, reloads. Correct, ~4× slower — i.e. exactly the "~4x off" veldt has today, which is
  the honest floor.
- **Relaxed SIMD is the live gate, not this one.** FMA/relaxed-dot land behind opt-in `-mrelaxed-simd`;
  without the flag, `fmaF32x4(a,b,c)` lowers to the *strict* `mul` then `add` (deterministic, one
  extra rounding), so a program is correct with or without the flag and only its last-bit results and
  speed change. A physics solver that needs bit-identical replay leaves the flag off.

---

## E. What each decision forecloses

Stated so a reversal's cost is on the record (the `buffer-design.md` §E discipline).

- **Library over language builtin (D, O1)** — forecloses nothing at the ABI: the intrinsic family and
  the lowering are identical whether the types live in `std` or the compiler. It *is* reversible into a
  compiler-known type later (the `buffer` O1(c) pattern), and a program may define its own vector
  newtypes over `v128` if it wants. What it forecloses is a *generic* `SIMD[T, N]` reading as one type —
  that needs const-generics (A10) and is a separate future.
- **Fixed width (D1)** — forecloses a width-agnostic `Vector<T>` surface. This is *intended*: WASM has
  one width, and the survey (C#, SVE/RVV) shows agnosticism answers hardware VL does not have. If WASM
  ever gets `v256` (no proposal today), new named shapes (`F32x8`) are added beside these, not a rework.
- **Distinct `Mask` types (D1)** — forecloses using a comparison result directly as data. Intended,
  and the Rust blocker-list is the evidence it is the right call. A program that wants the raw bits
  uses `bitmask`.
- **Unifying graphics and compute in one type family, not a `std:vec` layer (D5, O7)** —
  forecloses giving the graphics vocabulary its own abstraction boundary: a future graphics-only
  representation choice (an unpadded 12-byte `vec3`, say) is no longer available, because `vec3` IS
  an `F32x4` with a padded fourth lane, warts included. What it buys back: named `.x/.y/.z/.w`
  accessors (O3) and geometry methods (`dot`/`cross`/`normalize`) are ordinary methods on the SIMD
  types, so there is one type to learn, one value to hand `queue.writeBuffer`, and no repacking
  between the compute core and the graphics vocabulary.
- **Broad operator overloading via one general mechanism, not a SIMD-only carve-out (O4)** —
  forecloses treating `F32x4`'s `+ - * /` as a special case; the receiver-keyed, orphan-rule-gated
  mechanism (#3003) is available to any nominal type in its own declaring module, and SIMD's
  operators are an ordinary use of it, not a bespoke exception `DECISIONS.md` has to carry twice.
- **Requiring base SIMD (D7)** — forecloses running on a hypothetical no-SIMD host without a
  `-mno-simd` rebuild. Costs veldt nothing (all its targets have SIMD); the fallback is designed so
  the door is not welded.
- **Compile-time lane index (D4, O3)** — forecloses a runtime `laneF32x4(v, i)` with a variable `i`
  until the library offers a spill-and-index helper (deferred, not designed away — O3, ruled). This
  is a WASM encoding fact, not a VL choice, and naming it in the checker is more honest than silently
  emitting a spill. The common case doesn't need that door open: named `.x/.y/.z/.w` accessors
  (also ruled under O3) cover 4-lane access with a literal, compile-time-checked name instead.

---

## F. Resolved: the owner's rulings

Numbered as filed, so each can still be traced back to its recommendation. All ten are now ruled;
two (O4, O7) landed broader than this document's own recommendation, and both are called out
inline. The reasoning below is kept where the ruling agrees with the recommendation, and replaced
where it does not.

**O1 — Library, not a language builtin.** RULED: `std:simd`, on the `buffer` O1 precedent (types in
std, thin intrinsics in the compiler). A language builtin would buy a generic surface WASM's single
width makes low-value, and it is blocked on const-generics (A10) regardless — see O10, which rules
that dependency out entirely rather than deferring it. Reopen only if a measured kernel shows the
std wrappers cost something the `-O3 --closed-world` inliner does not remove — the same bar
`buffer` O1 set.

**O2 — `F32x4`.** RULED: the nominal, `PascalCase` spelling — it is a nominal std type, so it
follows VL's type-name convention (`Buf`, `F32View`), leaving `vec4`/`float4` free rather than
colliding with them. A `vec4f` alias MAY be added later purely for WGSL familiarity; it would be a
spelling, not a second type — `F32x4` stays canonical.

**O3 — Compile-time literal lane index, plus named accessors.** RULED: the lane index for
`lane`/`withLane` MUST be a compile-time literal — WASM encodes `extract_lane`/`replace_lane` as an
instruction immediate, not a stack operand, so a runtime index is not expressible as one
instruction, and a non-literal is a checker error naming the constraint. Named `.x`/`.y`/`.z`/`.w`
accessors are ADDED for the common 4-lane case, so a numeric index is rarely needed at all. A
runtime-index fallback (spill to memory, index the spill — slower, always works) is DEFERRED, not
designed away: it answers a genuinely-dynamic-index kernel once one shows up, without holding up v1.

**O4 — Operator overloading: BROAD, under the orphan rule.** RULED, and broader than the
recommendation: any nominal type may overload operators in its OWN declaring module, gated by the
orphan rule (only the declaring module defines a type's operators, so two declarations for the same
`(symbol, receiver)` pair collide and different receivers never conflict). This is not a SIMD-only
carve-out — the owner overrode the "closed `std:simd` family specifically" recommendation — and it
is already BUILT: the receiver-keyed operator mechanism merged as **#3003**, generalizing B14's
existing `[]`/`[]=` receiver-keyed exception to binary arithmetic and relational operators (`+ - *
/ % ^ > >= < <=`). Equality (`==`/`!=`) is a separate, deliberately non-overloadable case (D46,
refused at the parser) and #3003 does not touch it — consistent with §D4's compare ops being named
functions (`ltF32x4`, …), never `==`. So `F32x4`'s `+ - * /` ride the general mechanism, not a
special case, and `DECISIONS.md` B14/B16 are updated to match. A13's separate question — whether a
`"+"`-named struct FIELD is spellable — is unrelated and still open.

**O5 — Unaligned by default.** RULED: `align 0`, works at any `Buf` offset (veldt's records are not
16-aligned; wasm alignment is a hint, not a constraint). A `…Aligned` variant (`align 4`) is a PURE
performance option for later, not a correctness axis.

**O6 — Relaxed SIMD: a gated, non-default opt-in tier.** RULED: FMA/relaxed-dot ship behind
`-mrelaxed-simd` with a strict deterministic fallback, OFF by default. Benefit: FMA (faster and more
accurate — one rounding instead of two) and faster swizzle/dot on some ISAs; cost: results that
differ across hardware, which is why this is deliberately the one opt-in non-deterministic surface
in VL — see `docs/internals/numeric-determinism-rulings.md`, which already carves out exactly this
exception against standard (non-relaxed) ops being a verified engineering commitment rather than a
spec guarantee. Determinism-critical consumers (veldt's replay, sunsuz's WGSL cross-host parity)
leave the flag off; a program is correct either way and only opts into non-determinism deliberately.

**O7 — Unify graphics and compute; no separate `std:vec`.** RULED, and the owner leaned AWAY from
this document's own "separate `std:vec` layer" recommendation: the SIMD `F32x4` type family IS the
graphics vector family. `dot`, `cross`, `normalize` and swizzle (via O3's named accessors) are
METHODS on the vector types directly; `vec3` is represented padded to 16 bytes (the GPU convention —
the wasted lane is standard, and it is the layout WGSL rounds a `vec3<f32>` up to). No separate
`std:vec` layer sits on top. This matches both consumers' WGSL mental model exactly, and it is the
place this document most needed revising — see §D5 and §E.

**O8 — Load/store live in `std:simd`.** RULED: importing `Buf` from `std:buffer`, so `std:buffer`
stays width-agnostic and a program that never touches SIMD imports none of it.

**O9 — `v128` stays an internal substrate.** RULED: users hold `F32x4`, never a bare `v128`; the
newtypes brand it, and the untyped `v128` is exactly the thing the survey's worst corners (raw
`__m128` reinterpreted freely) warn against.

**O10 — No reservation for const-generics; the fixed family is permanent.** RULED, firmly: the
fixed named family is the PERMANENT surface, not a placeholder awaiting `SIMD[T, N]`. WASM's single
128-bit width makes a generic `Vector<T, N>` low-value — a conclusion a compiler-architecture review
independently confirmed — and Swift has shipped exactly this fixed-family shape for a decade with no
generic behind it. A10/const-generics is not a v1 dependency and the fixed types are not awaiting
it; if WASM ever gets a wider vector width, new named shapes (`F32x8`) are added beside these, not a
rework (§E).

---

## G. Sequencing

The smallest slices, in dependency order (the `buffer-design.md` §F discipline).

- **S0 — host + toolchain flags.** Add `--enable-simd` to the host's `optimize_in_place` and
  `disassemble_to_wat` (one line each), so `vl build -O` and `wasm-dis` accept `0xFD`. Must land before
  any emitter change writes a SIMD opcode, exactly as bulk-memory's `0xfc` needed its flag first.
- **S1 — the `v128` scalar rep.** `REP_SCAL_V128` and the wasm value-type plumbing so a vector flows
  through locals/params/returns. No user surface yet; provable by an internal round-trip
  (`__splat_f32x4__` → `__store_v128__` → `__load_v128__`, read a lane back).
- **S2 — load/store + splat + one arithmetic op** (`__load_v128__`, `__store_v128__`,
  `__splat_f32x4__`, `__add_f32x4__`). The `0xFD` LEB byte-writer and the first opcode-table rows.
- **S3 — `std:simd`, the `F32x4` slice.** The newtype, `loadF32x4`/`storeF32x4`/`splatF32`/`f32x4()`,
  `+ - * /`, `min`/`max`/`abs`/`sqrt`, lane access plus the named `.x/.y/.z/.w` accessors (O3),
  compare→`Mask32x4`+`select`, `reduceAdd`, and the geometry methods `dot`/`cross`/`normalize` as
  ordinary methods on `F32x4` (O7 — no separate later layer). This is the whole rigid-body solver's
  need — the first thing that lets veldt measure the 4×.
- **S4 — the integer + narrow shapes** (`I32x4`, `I16x8`, `U8x16`, widening loads, `dot`, `swizzle`).
  This is the voxel-pass need and the `flat`-record interop (§D5).
- **S5 — relaxed SIMD (gated).** `-mrelaxed-simd`, FMA + relaxed dot, strict fallback (O6).
- **Later, separable:** a checked `v128view`, aligned loads (O5), a `@simd`-loop hint (axis 2). A
  general static `shuffle<…>` stays unplanned rather than merely deferred — O10 rules the fixed
  family permanent, so this is only revisited if WASM itself grows a wider vector width. (No
  separate `std:vec` slice — O7 folded its methods into S3/S4 directly.)

**The first slice that gives veldt something real: S0–S3** — `F32x4` load/store/arith/compare over a
`Buf`. It is the rigid-body solver's entire surface, and it lets veldt retire the "~4x off" number
against a real kernel while S4's voxel shapes are built.

### Where the code would go

- `compiler/typecheck.vl` — the `declare(...)` intrinsic block (beside `__load_f32__`), the new `v128`
  primitive, the compile-time-lane-index check (O3).
- `compiler/emit_rep.vl` — `REP_SCAL_V128` and its mask.
- `compiler/emit_bytes.vl` / `compiler/wasmEmit.vl` — the `0xFD` LEB byte-writer and the
  `simdOpcode`/`simdImmShape` tables (mirroring `memLoadOpcode`/`memStoreOpcode`).
- `compiler/emit_state.vl` — hook `memUsed` for `__load_v128__`/`__store_v128__`.
- `scripts/vl-host/src` — the `--enable-simd` flag on the optimize/disassemble paths (S0).
- `std/simd.vl` — the entire type + op surface, zero further compiler lines (the `std:buffer` proof).

---

## H. What could not be determined here

- **The actual speedup on veldt's kernels.** "~4x" is veldt's estimate; the real number is S3-gated —
  it needs `F32x4` over the solver's real data, benchmarked against the scalar path, and it must be
  taken on the `-O3 --closed-world` profile veldt ships (the same caveat `buffer-design.md` §G raises,
  since that profile inlines the std wrappers whose per-call cost is otherwise real).
- ~~Whether operator overloading (O4) is cheap in the checker.~~ **Resolved, and answered
  sharper than asked:** `docs/internals/type-bound-ufcs-design.md` (#3001) found that operators
  already resolved through a single whole-program name slot, so two receiver types collided
  outright (`redeclared +`) independent of ergonomics — and **#3003** shipped the fix, generalizing
  B14's receiver-keyed exception. Cheap in the end: byte-identical on every existing program
  (tests/cases, the distilled corpus, and the compiler's own 31 modules), additive only.
- **The exact intrinsic count.** ~60 is an estimate over the shapes in §D; the precise list falls out
  of the op set the owner has now ruled on — O4's broadened scope and O7's added geometry
  methods both move it up from the ~60 estimate.

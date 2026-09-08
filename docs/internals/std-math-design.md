# `std:math` — design for deterministic transcendentals

**The ask.** Three external consumers and one internal review converge on the same missing
module. veldt (voxel/rigid-body, WebGPU/WGSL) and sunsuz (a real-time coastal sim with a CPU/GPU
parity harness) both need `atan2`/`hypot` for bearing and vector-length math that today has no
VL spelling; glean (a WC3 replay player reconstructing deterministic game logic from a binary
protocol) needs the same class of function to reproduce fixed-point-adjacent trigonometry
exactly. An internal numerics review separately flagged that **the module does not exist at
all** — confirmed live against `dist/vl` (2026-09-07): `sin`, `cos`, `hypot`, `atan2`, `exp`,
`pow` and `PI` are all `undeclared identifier`. This document is the design; no code lands with
it.

This is a **design pass. No compiler or std source is touched, and no `std/*.vl` export is
added.** `docs/internals/numeric-intrinsics.md` §"What is deliberately absent" already
anticipated this module — *"No wasm opcode computes [a transcendental]... A future `std:math`
for other users is a separate question and nothing here forecloses it"* — written when the only
consumer on record (webcraft, the WC3-replay-adjacent sim whose ask motivated the opcode
intrinsics) explicitly did NOT want one (§B). That is not a contradiction to resolve; it is the
predicted shape arriving with a different set of consumers who need it. The **build** goes
through `std-api-reviewer` per `CLAUDE.md`'s `std:*` review requirement, same as any other std
change — this doc exists so that review has a determinism contract to hold the implementation
to, rather than relitigating it per-function.

---

## A. Why this is a language-boundary problem, not a library nicety

VL emits wasm directly. Wasm has no transcendental instruction — `sin`, `cos`, `atan2`, `exp`,
`pow` are library code in every wasm toolchain, and the library each host's runtime falls back
to (V8's `Math.sin`, wasmtime's Rust `f64::sin`, a native libm) is **not the same algorithm on
every platform**: glibc, musl, macOS's libm and V8's fdlibm-derived intrinsics disagree in the
last few bits of `sin`/`cos`/`pow` for the same input, a long-documented cross-platform
JavaScript hazard. A VL program that called a host's math function would silently inherit that:
the same `.wasm`, run on Chrome vs. Node vs. wasmtime vs. a future host, could print a different
number. That is exactly the guarantee `docs/internals/numeric-determinism-rulings.md` states as
first-class for VL's standard numeric operations, so `std:math` cannot be a thin wrapper around
whatever the host provides — it has to carry its own algorithm, in VL, computed from the
opcode-level float intrinsics `numeric-intrinsics.md` already ships (`sqrt`, `abs`, `min`, `max`,
`copysign`, …), so the *only* source of cross-host variance is IEEE 754 arithmetic itself, which
`numeric-determinism-rulings.md` §4 already establishes is uniform across VL's target engines.

**A documented 4-ULP approximation that is identical on every host beats a 0.5-ULP one that
drifts by platform.** This is the spine of the whole design (§C) — it is also why this cannot be
answered by "just call the fastest correctly-rounded routine available": correctness in the
single-host sense and determinism in the cross-host sense are different properties, and VL has
never had the second one for transcendentals because it has never had the functions at all.

---

## B. The three consumers, and why webcraft's non-ask does not conflict

| consumer | what it needs | why |
| --- | --- | --- |
| **veldt** (`docs/internals/simd-design.md`'s "ask #1" filer) | vector length / normalize (`hypot`, or `sqrt(dot(v,v))`), bearing/angle math for its rigid-body solver | CPU-side physics mirrors WGSL, which has `atan2`, `length`, `pow` as builtins — the CPU side has had nothing |
| **sunsuz** | `atan2` for bearing computation (`turnOf`, `~/sunsuz/src/world/coast.ts`), currently JS-only with no VL equivalent to port to; a CPU/GPU parity harness that already tests this exact function | its whole harness design is "run the actual code both sides run" — porting `coast.ts`'s math to VL is blocked on VL having `atan2` at all |
| **glean** | deterministic trig for a WC3 replay engine reconstructing another program's arithmetic exactly | a replay is only correct if the reconstructed math matches bit-for-bit **on every host a replay is watched from**, which is the determinism contract, not just having *a* `sin` |

`docs/webcraft-requirements.md` §P0.4 states webcraft's own math needs are fully served by the
opcode intrinsics and that webcraft will **not** import `std:math` even once it exists — its
transcendentals (matching a specific game's binary-exact tables) are "extracted from real WC3
via probe maps," a different determinism problem (bit-matching a THIRD PARTY'S implementation)
that a general-purpose polynomial cannot solve by construction. `numeric-intrinsics.md` already
recorded this as compatible: *"A future `std:math` for other users is a separate question."*
Nothing here asks webcraft to adopt it; the module is for the three consumers above, and
`std-api-review.md`'s no-speculative-surface rule is satisfied because all three have a filed,
concrete need today, not a hypothetical future one.

---

## C. The determinism contract — the spine every op is built to

1. **Deterministic polynomial (or rational, or table+polynomial) approximation, never a host
   call.** No `Math.*` op, no libm call, no `extern` of any kind. Every op is VL source, built
   from the float opcode intrinsics (`numeric-intrinsics.md`) and `+`/`-`/`*`/`/`, so its result
   is a pure function of IEEE 754 arithmetic on the input bits — the one thing
   `numeric-determinism-rulings.md` §4 already establishes is uniform across VL's supported
   engines (V8 family, wasmtime).
2. **The error bound is PUBLISHED, per op, per width, and it is a promise, not a
   characteristic.** A caller building a parity harness (sunsuz's is the worked case, §G) needs
   a number to assert against, not "should be pretty close." The bound ships in the export's
   doc comment (1–4 lines, `std-comment-audience`'s budget) and in this design's table (§E) for
   the build to be graded against.
3. **The bound's UNIT is stated, and it is ABSOLUTE unless a function says otherwise.** Absolute
   and relative error diverge sharply near zero (a relative bound is meaningless at `atan2`'s
   own zero crossings, and sunsuz's parity gate — *"1e-4 absolute on `[0,1)`"* — is itself
   absolute). Every bound in §E names the unit and the domain it holds over; there is no bound
   in this document that means "roughly right" without a number attached.
4. **Never trades width for determinism.** An f32 implementation is not "compute in f64, cast
   down" (§D) — that would be a different, more-accurate function than the one the error bound
   describes, and worse, an f64 host op that happens to be exact for common cases can mask a
   real f32 divergence until a consumer hits the input that doesn't cast the same way twice.
5. **Never delegates to a "close enough" approximation the standard library already has.**
   There isn't one — this is the first `std:math`-shaped module VL has ever had, so there is no
   precedent to be consistent with beyond the intrinsics' own naming/width conventions
   (`numeric-intrinsics.md` §"The four decisions").

---

## D. f32-first is a hard requirement, not f64-with-a-cast

**Both widths are first-class exports; f32 is not derived from f64 by casting down.** Three
facts make this both required and feasible:

- **WGSL, veldt's other language, is f32 throughout.** `vec4<f32>`, `atan2`, `length` and `pow`
  in WGSL all operate at f32. A VL `std:math` that only offered f64 would force every veldt call
  site to widen, call, and narrow — reintroducing exactly the "every constant is a cast" friction
  `docs/internals/contextual-f32-literals-design.md` was built to remove from f32 *literals*, now
  showing up at f32 *call sites* instead.
- **VL already has the machinery.** The opcode intrinsics are width-inferred per operand
  (`numeric-intrinsics.md` §"Overloading: by operand width, not by a second declaration" —
  `sqrt`, `min`, `max`, `abs` all compute at f32 when the operand genuinely is f32), and
  contextual f32 literals (shipped, `contextual-f32-literals-design.md`) mean a constant written
  inside an f32 algorithm's body does not need `as f32` noise. Both prerequisites `std:math`
  needs are already built; this module is the first thing that exercises them at scale.
- **A narrowed f64 result is a different function than a native f32 one**, not a cheaper
  spelling of the same function — computing `atan2` in f64 and casting the result to f32 rounds
  once at the end; computing it natively in f32 rounds at every intermediate step, and the two
  can disagree by more than a ULP on inputs near a polynomial's segment boundary. A consumer
  whose whole pipeline is f32 (veldt's solver, WGSL's shaders) needs the function that behaves
  like ITS arithmetic, not f64's.

**Naming: a width-suffixed pair per op**, following the established `std:buffer` convention
(`loadI8`/`loadU8`/…/`loadF32`/`loadF64`, cited as convention evidence in
`std-api-review.md` §1) rather than one generic name overloaded by argument type. Concretely:
`atan2F64`/`atan2F32`, `hypotF64`/`hypotF32`, `sinF64`/`sinF32`, and so on; `PI` (f64) and a
distinctly-named f32 constant (`PI_F32`, exact spelling for the build to pick) for the constant.

**A considered alternative, flagged rather than chosen (see O1):** VL's generic functions
already monomorphize an unbounded `<T>` per concrete instantiation, and an *unbounded* generic
using only operators picks up the implicit operator constraint automatically —
`tests/cases/arith/float-remainder.vl`'s `pinned<T>(a: T, b: T): T { return a % b }` runs
correctly at both `f32` and `f64` with no width-specific code. A single `sin<T>(x: T): T` reads
closer to math notation and would collapse the pair into one name. Whether the *numeric opcode
intrinsics* (`sqrt`, `min`, `copysign`, …) participate in that same implicit-constraint
inference inside a generic body the way user-written operators do is **not verified here** —
this document does not touch the compiler — and is exactly the kind of question worth a
half-day spike before the build commits to a naming convention. §H O1 files it.

---

## E. The op list — slice 1 first, slice 2 the same contract

### Slice 1 — `hypot`, `atan2`, `PI`

The cheapest high-value slice: between them, `hypot` and `atan2` unblock vector length and
bearing math, which is most of what veldt and sunsuz asked for, with no dependency on a harder
range-reduction problem (§ slice 2's `sin`/`cos` do).

| op | domain | bound | unit | notes |
| --- | --- | --- | --- | --- |
| `hypotF64(x, y): f64` | all finite `x, y` | not a fixed bound — see below | — | **naive**: `sqrt(x*x + y*y)`. Each step (`*`, `+`, `sqrt`) is IEEE-correctly-rounded, so the composed error is a few ULP at most — the real limitation is **overflow**: `x*x` overflows to `Infinity` once `|x|` exceeds ~1.3e154, well inside `f64`'s own range (~1.8e308), giving a wrong `Infinity` for a legitimately representable hypot. Documented as a known v1 limitation, not silently accepted. |
| `hypotF32(x, y): f32` | all finite `x, y` | same shape | — | overflows around `|x| ≈ 1.8e19`, far inside f32's ~3.4e38 range — the naive limitation bites sooner at f32, and the doc comment says so |
| `atan2F64(y, x): f64` | all finite `(x, y)`, `(0, 0)` defined as `0` | ≤ **1e-7 absolute** (target) | absolute, over the full domain | quadrant reduction (sign of `x`/`y`) to a `[0, 1]` ratio, then a minimax polynomial in that ratio — a well-studied shape (comparable published minimax `atan` approximations reach single-digit-ULP `f64` accuracy at degree ~11); exact coefficients are a build-time artifact, not a design decision |
| `atan2F32(y, x): f32` | same domain | ≤ **1e-6 absolute** (target) | absolute, over the full domain | same algorithm at f32 precision — the bound is looser than f64's because it is stated relative to f32's own ULP floor near the polynomial's worst segment, not because the algorithm is worse |
| `PI: f64` | — | exact (nearest representable `f64` to π) | — | rides along with `atan2` since any angle consumer needs it |
| `PI_F32: f32` | — | exact (nearest representable `f32` to π) | — | the f32 twin — naming is a build-time detail, not settled here |

sunsuz's own harness needs exactly `atan2` — its `1e-4` absolute gate on `[0,1)` (§G) is two
orders of magnitude looser than the `atan2F32` target above, so slice 1 is designed with margin
to spare against the one real cross-host acceptance test that exists today.

**`hypot`'s naive form is an explicit, documented v1 decision, not an oversight.** An
overflow-safe variant (`a = max(|x|,|y|); b = min(|x|,|y|); a * sqrt(1 + (b/a)^2)`, the standard
scaled form) is deferred — it costs a comparison and a division on every call for a case none
of the three consumers' filed needs require (veldt's voxel-space coordinates and sunsuz's
world-space bearings are nowhere near f64's overflow threshold), and shipping it later is
purely additive (a new function, or the existing one's body swapped with an unchanged
signature and a *tighter* doc comment — never a breaking change).

### Slice 2 — `sin`, `cos`, `exp`, `pow` (same contract, different domains)

Same rules as slice 1 — deterministic polynomial, published absolute bound, f32 and f64 both,
never a host call — with domains that are harder to state briefly, so this table gives targets
and flags the open sub-problem rather than final numbers:

| op | domain | bound (target) | notes |
| --- | --- | --- | --- |
| `sinF64`/`cosF64` | a documented bounded range (e.g. `|x| ≤ 2^20`) at v1 | ≤ **1e-9 absolute** within the documented range | full-range argument reduction for arbitrarily large `|x|` (Payne–Hanek-style) is its own sub-project — none of the three consumers' filed needs require huge-magnitude inputs, so v1 documents the domain it covers rather than silently mishandling what it does not |
| `sinF32`/`cosF32` | same shape, narrower documented range | ≤ **1e-6 absolute** | |
| `expF64` | all finite `x` up to overflow (`x` too large to represent `e^x` in `f64`) | ≤ **1e-9 relative** | relative, not absolute — `exp` spans many orders of magnitude, where an absolute bound is meaningless near the top of the range and vacuous near the bottom |
| `expF32` | same shape | ≤ **1e-6 relative** | |
| `powF64(x, y)` | integer `y`: all finite `x`; non-integer `y`: `x > 0` | integer exponent: exact within rounding (repeated squaring); general case: ≤ **1e-8 relative**, inherited from `exp(y * ln(x))` | `pow`'s general case depends on a `ln`, which is not separately named in the ask — §H O2 |
| `powF32` | same shape | integer exponent: exact within rounding; general case ≤ **1e-6 relative** | |

**Sequencing within slice 2 is not "all four together."** The integer-exponent fast path for
`pow` has no dependency on `exp`/`ln` and can ship first; the general real-exponent case depends
on a deterministic `ln`, which is new work slice 2's own table does not currently name as an
export — recommend building `expF64`/`expF32` and an (perhaps unexported) `ln` together, then
`pow`'s general case, then `sin`/`cos` last, since their range-reduction question is the
slice's least-scoped piece.

---

## F. Slice ordering and what unblocks what

1. **Slice 0 (this doc + `numeric-determinism-rulings.md`):** the contract, reviewed and
   settled before a line of `std:math` exists.
2. **Slice 1 — `hypot`, `atan2`, `PI`:** cheapest, highest-value, and validates the acceptance
   harness (§G) end-to-end with a real cross-host consumer before slice 2's harder range-
   reduction problems are attempted.
3. **Slice 2 — `sin`, `cos`, `exp`, `pow`:** same contract, applied to harder domains; ship
   `exp`/`pow`'s integer path before `sin`/`cos`, per §E's sequencing note.
4. **Deferred, not scoped here:** `hypot`'s overflow-safe variant; a full-range `sin`/`cos`;
   inverse-hyperbolic or any op no consumer has asked for (`std-api-review.md`'s
   no-speculative-surface rule applies to this module exactly as it does to every other).

Every slice goes through `std-api-reviewer` before merging, per `CLAUDE.md`'s standing rule —
this document does not substitute for that review, it gives the review a contract (§C) and a
per-op bound table (§E) to check the implementation against, which is the concrete thing a
reviewer can verify a PR meets or does not.

---

## G. The acceptance harness — sunsuz already has one

**`~/sunsuz/tools/headless/coast.mjs`** is a real, running, cross-host parity harness — not a
proposed one — built for exactly this problem (mirroring a TypeScript function against its WGSL
shader twin) and reusable almost unchanged for grading `atan2F64`/`atan2F32` once they exist:

- It sweeps **2003 bearings × 9 islands** (`BEARINGS = 2003`, `SHORES` names 8 radii and the
  sweep adds a 9th at `800000`) through `coastAt`, asserting the TypeScript and the (interpreted,
  no-GPU) WGSL shader agree to **1e-6 absolute at f64** and drift **< 1e-4 absolute at f32** —
  the f32 gate is the one this design's `atan2F32` target (1e-7) already clears with a 1000×
  margin.
- **`turnOf`** is the `atan2`-shaped function in the harness (`gpu("turnOf", [x, -y], "f64")`,
  compared against a TypeScript `Math.atan2`-based mirror `coastTurn`) — swapping VL's
  `atan2F64`/`atan2F32` in as a third mode (VL vs. the existing TS/WGSL pair) is additive to a
  harness that already runs in ~20 seconds and already asserts a real perturbation-sensitivity
  control (a one-character change to either mirror is asserted to be CAUGHT, not just that the
  three agree) — the exact "a test that cannot fail is a decoration" discipline `coast.mjs`'s
  own header states.
- This is the concrete acceptance test slice 1 is designed against: **grading `atan2F64` and
  `atan2F32` through `coast.mjs`'s existing sweep, not a bespoke new one**, is both cheaper to
  build and a stronger claim than a fresh VL-only test, because it is the same harness a real
  consumer already trusts for its own shipping decisions.

---

## H. Open questions for the owner

**O1 — Naming: width-suffixed pair vs. a single generic name.** §D recommends
`atan2F64`/`atan2F32` (matches `std:buffer`'s precedent) over a single `atan2<T>` relying on
generic width inference. → **Recommend the suffixed pair for v1** — it is unconditionally safe
(no dependency on unverified generic/intrinsic interaction), matches an existing convention a
reviewer already accepts, and is no harder for a caller to read than `loadF32`/`loadF64`
already are. Revisit only if a build-time spike confirms the generic form works cleanly and the
review prefers the single name.

**O2 — Does `pow`'s general case need a public `ln`?** §E's `pow` table depends on
`exp(y * ln(x))` for non-integer exponents, and `ln` is not in the original ask. → **Recommend
building `ln` as an internal (non-exported) helper for `pow`'s sake in slice 2**, and exporting
it only if a consumer files a need — `std-api-review.md`'s no-speculative-surface rule argues
against shipping a fourth name nobody asked for yet.

**O3 — `sin`/`cos`'s documented input range.** §E proposes shipping a bounded-domain v1
(`|x| ≤ 2^20` or similar) rather than full Payne–Hanek reduction. → **Recommend shipping the
bounded version first, stated explicitly in the doc comment** (matching `std:fmt`'s "no radix
but ten" precedent for an honestly-scoped v1), since none of the three filed consumer needs
require unbounded-magnitude trig arguments — a full reduction is a clean additive follow-up,
never a breaking one, if a fourth consumer needs it.

**O4 — Should `TAU` (`2π`) ship alongside `PI`?** sunsuz's own bearing code divides by `TAU`
(`~/sunsuz/src/world/coast.ts`: `Math.atan2(-y, x) / TAU + 0.5`). → **Recommend deferring** —
it is one multiplication away from `PI` and shipping both a `PI` and a `TAU` for every future
constant a caller could derive would restart the speculative-surface question `std-api-review.md`
exists to catch; a caller writes `PI * 2.0` today, and `TAU` can be added later without
affecting anything.

**O5 — Should `hypot`'s doc comment name the overflow threshold as a number, or just "naive"?**
→ **Recommend naming the actual threshold** (`~1.3e154` for f64, `~1.8e19` for f32) in the 1–4
line export comment — `std-comment-audience`'s budget allows it, and "naive" alone forces a
caller to derive the threshold themselves before trusting the function near the edge of a large
coordinate space.

---

## I. What this document does not settle

- Exact polynomial coefficients, degree, or the argument-reduction algorithm for any op — those
  are build-time artifacts, verified against the error bounds in §E and against `coast.mjs`
  (§G), not design-time commitments.
- The internal module layout (one `std/math.vl` vs. split files) — a std-api-reviewer call at
  build time, not a design question.
- Whether `std:math`'s saturating/checked-arithmetic helpers from
  `numeric-determinism-rulings.md` §2–3 live in this module or a separate one — flagged there,
  not resolved here, since it is a scope question for whoever builds first.
- Any export, of any kind — this document adds zero lines to `std/*.vl`. The build that follows
  it goes through `std-api-reviewer` per `CLAUDE.md`'s standing rule, checked against §C's
  contract and §E's per-op bounds.

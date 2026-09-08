# VL numeric/SIMD model — adversarial review

Reviewer stance: I write SIMD kernels and inference loops for a living. I ran every claim
below against the shipped compiler (`dist/vl run`, commit `58a7f5b0fc47`, embedded seed) —
scratch programs live beside this file (`n1`–`n16_*.vl`). This is not a survey of intent;
it is a report on what a numerical programmer hits today. Findings are ranked by how badly
they block real numerical/ML code, not by how interesting they are to fix.

---

## 1. [CRITICAL] There is no SIMD. At all. It is a design document, not a feature.

The brief's own framing ("fixed 128-bit SIMD... 4x behind AVX-512") is too generous — it
assumes SIMD exists to be behind anything. It does not.

- `grep -rn "v128" compiler/*.vl` → **0 hits**. No `REP_SCAL_V128`, no `__…_v128__`
  intrinsics, no `0xFD` opcode writer.
- `std/simd.vl` does not exist (`ls std/` lists 14 modules, none of them SIMD).
- `docs/internals/simd-design.md` is exactly what it says: **"a design pass. No compiler
  source is touched"** (line 19), gated on **ten open owner rulings** (§F, O1–O10) before
  the first buildable slice (S0–S3) even starts.
- `ROADMAP.md` row 32 lists it as *"DESIGNED, gated on owner rulings"*, estimate "days (per
  slice)" — i.e., not started.

**What this means for a numerical kernel today.** Every "vectorizable" loop — a matmul
inner product, a softmax reduction, a quantization pass over a tensor — compiles to pure
scalar wasm, through one of two paths, both of which I exercised:

- `T[]` (WasmGC array): each element access is a managed-object load plus an array bounds
  check, one element at a time (`n15_matmul.vl` — a 2×2 `f64[][]` matmul runs, but every
  `a[i][p]` is two indirections + two bounds checks).
- `std:buffer`'s `F32View`/`I32View`: `getF32`/`setF32` are one scalar `f32.load`/`f32.store`
  per call (`std/buffer.vl:275-296`) — no bulk load, no `v128`, nothing wider than 4 or 8
  bytes per call.

So the honest comparison is not "VL SIMD is 4x behind AVX-512's 16-wide f32." It is **"VL
has no vector ISA at all, so a scalar VL loop is ~16x behind a 16-wide AVX-512 FMA loop, and
still ~4x behind a 4-wide SSE/NEON loop that every other WASM-targeting toolchain (Rust,
C/Emscripten, AssemblyScript) already emits by default via `v128` today.** VL is not "SIMD,
but narrower than native." It is scalar.

**What's needed.** Ship S0–S3 of `simd-design.md` (host flag, `v128` rep, `std:simd` with
`F32x4` load/store/arith/compare/reduce) as a real, gated priority — not because the design
is wrong (it is one of the more careful docs in this repo — see finding 6 for its one real
gap), but because right now the "SIMD story" is a 600-line proposal and the actual
throughput ceiling for any data-parallel VL program is scalar wasm. Any claim that VL is
viable for CPU-side numerical work should be evaluated against *that* ceiling, not against
the design doc's aspirational one.

---

## 2. [CRITICAL for ML/scientific code] No transcendental math functions exist, anywhere, by explicit design ruling — and there is no `std:math`.

Verified directly:

```
$ dist/vl run exp.vl    # print(exp(1.0))
Error: type error … undeclared identifier 'exp'
$ dist/vl run pow.vl    # print(pow(2.0, 10.0))
Error: type error … undeclared identifier 'pow'
$ dist/vl run sin.vl    # print(sin(1.0))
Error: type error … undeclared identifier 'sin'
```

The **entire** numeric intrinsic surface is: `sqrt abs floor ceil trunc nearest min max
copysign` (float) and `clz ctz popcnt rotl rotr divU remU ltU leU gtU geU` (integer) —
literally the wasm opcode list, nothing more (`compiler/typecheck.vl:22603-22610`,
`docs/internals/numeric-intrinsics.md`). That doc is admirably honest about *why*:

> "`sin`, `cos`, `atan2`, `pow`, `exp` and every other transcendental. **No wasm opcode
> computes one**, so any implementation is a library whose last bit is a policy choice...
> Providing one would not save such a program work; it would give it a trap to avoid."

That is a coherent position for a compiler that refuses to own an approximation's last-bit
behavior. It is also a **complete non-starter for ML/scientific code**, which lives on
these functions:

- **Softmax** needs `exp`. Cannot be written.
- **Sigmoid, tanh, GELU, swish** — every activation function past ReLU — needs `exp` or
  `tanh`. Cannot be written.
- **Any normalization beyond L2** (log-likelihood, cross-entropy, log-sum-exp for numerical
  stability) needs `log`/`exp`. Cannot be written.
- **Any RNG worth using** (Box-Muller for Gaussian sampling, weight initialization) needs
  `log`/`sin`/`sqrt` together. There is also **no RNG in std at all** — `std/seed.vl` is a
  literal smoke-test stub (`stdSmoke() { return 7 }`), not a generator.
- **Rotation, trigonometric interpolation, FFT** — anything with `sin`/`cos` — cannot be
  written.

The only escape hatch is to hand-roll a polynomial/rational approximation of `exp`/`log` in
pure VL arithmetic (`+ - * / sqrt`), which is exactly the trap `numeric-intrinsics.md` says
it is declining to hand you — except now *every VL program that needs softmax* re-derives
and re-validates that policy independently, with **no package ecosystem** to share one good
implementation (CLAUDE.md is explicit that std has no deprecation story and there is no
package registry to route around a gap). This is not a paper cut; it disqualifies VL from
"write a real numerical/ML kernel" as stated in the brief, full stop, until either `std:math`
ships or VL gets an FFI to a host libm.

**What's needed.** A `std:math` with at minimum `exp`, `log`, `pow`, `sin`, `cos`, `tanh`,
plus a PRNG (`std:random` or similar, xorshift/PCG is enough) in `std`. The design doc
correctly notes this is "a separate question" it doesn't foreclose — it just hasn't been
asked yet, and every day it isn't is a day VL cannot run a softmax.

---

## 3. [HIGH] The exact-or-fail cast is correctness-strong and genuinely usable for the *common* case, but it makes hot elementwise numeric code slower to write, more trap-prone, and missing an ergonomic primitive (`clamp`) that every neighboring idiom needs.

The idiom (`trunc(x) as! i32`, `floor`/`ceil`/`nearest` for the other roundings) works and
I don't think it's "off the language" — `docs/guide/operators.md` documents it clearly, and
`DECISIONS.md`'s 2026-09-02 ruling gives a real cross-language survey (Julia is the one
prior art with the same default, and VL follows it deliberately). The four rounding modes
cost exactly one intrinsic call each — cheap syntactically, and the emitter peepholes
`trunc(d) as! i32` to a single `i32.trunc_f64_s` (confirmed by the ruling's own text, and
consistent with the trap message I got back — see below).

But run the idiom on the numeric kernel it's actually for — int8 quantization, the daily
grind of inference — and the friction shows up immediately. I wrote the obvious version:

```vl
function clampF(x: f64, lo: f64, hi: f64): f64 {
  if x < lo { return lo }
  if x > hi { return hi }
  return x
}
function quantizeI8(x: f64): i32 {
  const clamped = clampF(x * 127.0, -128.0, 127.0)
  return nearest(clamped) as! i32
}
```

This runs and is correct (`quantizeI8(0.5) == 64`, `quantizeI8(1.5) == 127`). But:

- **There is no `clamp` in std** (`grep -rn clamp std/ compiler/` finds only comments about
  index clamping — nothing numeric). Every quantization/histogram/normalization kernel
  hand-rolls it, and `min`/`max` are 2-argument only (confirmed: `min(max(x, lo), hi)` works
  but is the *only* spelling — no 3-arg `clamp`).
- **A forgotten clamp is a hard trap, not a saturated value.** I forced this: an i32 value
  one past range traps the whole program —

  ```
  wasm trap: integer overflow
  note: a float→integer conversion (`as i32` / `as i64`) whose value lies outside the
        target integer's range, or `i32.MIN / -1`.
        VL truncates toward zero and TRAPS out of range — it does not saturate (as Rust
        does) or wrap (as JS does). Guard the range before converting.
  ```

  In a real inference loop, activations spike outside `[-1, 1]` routinely (that's what
  clamping is *for*). Every single quantized output value therefore needs a guard the
  language does not supply and does not check for you at the type level — a missed guard
  doesn't corrupt one value, it **aborts the process**, mid-batch, with no recovery. `as?`
  gets you a `null` instead of a crash, but then every downstream consumer of that quantized
  value has to thread `| null` through the rest of the kernel just to avoid the trap on rare
  out-of-range inputs — which is exactly the "friction pushes you to `as?` and you lose
  errors" the brief predicted, except what you lose is not errors, it's **ergonomics**: a
  hot loop now allocates a null check per element for a condition (a training-time activation
  outlier) that is not actually a bug.
- **Four call spellings for one concept.** `trunc`/`floor`/`ceil`/`nearest` are four
  separate free functions with no shared naming or grouping (`std:math`-shaped, but living
  as bare compiler intrinsics — see finding 2's naming point) — a caller has to already know
  which of the four they want and get the *cast suffix* right too (`as!` vs `as?` vs bare
  `as`), so a single "round-and-narrow to int8" operation is minimum three tokens
  (`nearest(...) as! i32`) with two independent failure axes (wrong rounding mode picked
  silently gives a wrong-but-non-crashing answer; wrong cast suffix picked gives a trap or a
  silent null).

**What's needed.** (a) `clamp(x, lo, hi)` in `std:math` (or wherever finding 2's module
lands) — this is missing regardless of the cast story. (b) Consider a saturating cast
spelling for the numeric-kernel case specifically — not a retreat from exact-or-fail as the
*default*, but the honest fact is that saturating quantization is not an edge case in ML
code, it is the normal path, and today it costs a hand-written `clampF` plus a full
trap-vs-null decision every call site. `as%`'s own justification ("a fourth suffix costs
one parser arm... a builtin costs a name in the global scope forever") is a good argument
that could apply here too if the owner decides saturation earns its own suffix.

---

## 4. [MEDIUM-HIGH] No unsigned 32/64-bit type, and the natural-looking fix (mask) is a silent no-op if you apply it before widening.

`compiler/typecheck.vl`'s `PrimName` union is exactly `i32 | i64 | f32 | f64 | u8`
(line 269-281) — there is no `u16`/`u32`/`u64` value type anywhere, by deliberate ruling
(`numeric-intrinsics.md`: *"An `i32` **is** signed in VL... `divU`/`ltU` are that decision
continued"*). That's a defensible design (VL already committed to `>>>` over a `u32` type),
but it has real teeth for numerical/hashing-adjacent code:

- Hash mixing, CRC, PRNG state, MPQ/Storm-style checksums, packed quantized weight formats —
  all routinely unsigned 32/64-bit — live entirely in i32's *signed* interpretation. Every
  comparison needs `ltU`/`gtU` instead of `<`/`>`; every division needs `divU`/`remU`
  instead of `/`/`%`. This is workable but is a second, parallel arithmetic vocabulary a
  numerical programmer has to remember to reach for, with no type-level reminder — write
  `<` where you meant `ltU` and the checker will not tell you, because both are legal i32
  comparisons.
- **The "widen then mask" idiom is a documented footgun, self-confirmed in the guide.**
  `docs/guide/bytes.md` states it outright:

  ```vl
  print(b.i32le(0) & 0xffffffff)            // -1          — the mask did NOTHING
  print((b.i32le(0) as i64) & 0xffffffff)   // 4294967295  — the widen is what works
  ```

  `0xffffffff` at `i32` width is all-ones, so masking an i32 with it is the identity — a
  silent no-op, not a compile error, not a runtime warning. I confirmed this is exactly the
  trap it looks like: the *only* signal is a paragraph in the guide, not the type system. A
  32-bit-unsigned quantity (a file size, a hash, a color as packed RGBA, an unsigned loop
  count past 2^31) that a numerical programmer wants to treat as "a number" has no
  non-negative spelling below i64, and getting there requires widen-*then*-mask in that
  exact order or the bug is silent.
- **There is no non-negative spelling for values ≥ 2^63 at all** (`docs/guide/bytes.md`:
  *"There is nowhere wider than i64, so a 64-bit field at or above 2^63 has no non-negative
  spelling"*). A 64-bit hash or a large monotonic counter is stuck doing unsigned compares
  by hand forever; there is no `u64`, and `i64`'s own `ltU`/`gtU` twins exist but there's no
  print path that renders one as an unsigned decimal.

**What's needed.** At minimum, a `printU`/`toStringU` for the i32/i64 unsigned case (the
current situation is "no way to even *display* the unsigned value you just computed with
`ltU`" — I did not find one in `std/fmt.vl`), and a lint for the "mask before widen" pattern
(`std-comment-audience`-style tooling already exists in this repo for narrower classes of
footgun; this one has an even sharper signature: `<intN> & <all-ones-literal-of-same-width>`).

---

## 5. [HIGH, but architecturally expected] No tensor/matrix story: `T[][]` is jagged WasmGC with double indirection, and reductions are minimal.

I wrote and ran a real (tiny) matmul:

```vl
function matmul(a: f64[][], b: f64[][], n: i32, m: i32, k: i32): f64[][] {
  const result: f64[][] = []
  for i in 0 until n {
    const row: f64[] = []
    for j in 0 until k {
      let sum = 0.0
      for p in 0 until m { sum = sum + a[i][p] * b[p][j] }
      row.push(sum)
    }
    result.push(row)
  }
  return result
}
```

This runs and is correct. But it is the *only* shape available, and it is the worst shape
for throughput:

- `f64[][]` is an array of independently-heap-allocated `f64[]` rows (WasmGC), not a
  contiguous buffer — no row-major/column-major layout guarantee, no way to get a
  cache-friendly stride, and `a[i][p]` is two managed-object dereferences plus **two**
  bounds checks per scalar multiply-add, inside the hottest loop a numerical program has.
- `std:buffer`'s `F32View`/`I32View` (the one place VL has contiguous storage) is **1-D
  only** — `getF32(self, i)`/`setF32(self, i, v)` (`std/buffer.vl:275-296`), one element at
  a time, with the caller doing all stride/row-offset arithmetic by hand. There is no 2-D
  view, no strided view, no "matrix" nominal type anywhere in std.
- `std:array`'s generic helpers (`reduce`, `mapIndexed`, `sort`, …) are the only reduction
  vocabulary and they are all closure-based (`reduce<T,A>(self: T[], f: (A,T)=>A, init: A)`)
  — there is no specialized `sum`/`dot`/`mean`/`any`/`all` for the numeric case, so a dot
  product either goes through a per-element closure call (real overhead absent inlining) or
  gets hand-written as a loop every time. There is no BLAS-shaped primitive (`axpy`, `gemv`,
  `gemm`) anywhere, designed or shipped.
- No fixed-size (stack-shaped) numeric array exists either — `docs/guide/collections-design.md`
  §LS.4 explicitly chose growable `T[]` as the *only* meaning of `[...]`; a Rust-`[T;N]`/
  Go-`[N]T` equivalent is "the substrate," never a user-facing type. Every small fixed-arity
  vector (a `vec3`, a `vec4`, a 4×4 transform) has no stack-allocated home; it's either a
  struct-of-fields (fine for `vec4`, dead for `mat4`) or a heap `T[]`.

None of this is a surprise given `simd-design.md` and `ROADMAP.md` both frame SIMD/`flat`/
`Buffer` as the future home for exactly this — but "future home" is doing the work today.
**Concretely: nobody can write a competitive matmul or a competitive quantized inference
loop in VL today** — not "4x slower than optimal," but bounds-checked scalar
double-indirection with no way to lay out data contiguously except manual byte arithmetic
over `Buffer`, which itself has no bulk/strided helpers.

**What's needed.** `flat` record arrays over `Buffer` (already designed per
`flat-records-design.md`, referenced in `simd-design.md` §D5) shipped and packaged as an
actual 2-D/strided view type, plus `sum`/`dot`/`axpy`-shaped functions in whatever
`std:math`/`std:linalg` eventually exists. This is the same gap as finding 1 from a
different angle — SIMD without contiguous, strided storage to feed it is much less useful,
so the two should probably be graded and shipped together.

---

## 6. [MEDIUM] IEEE-754 corners are mostly right, but under-documented in the user-facing guide, and the SIMD design doesn't yet commit to the one thing that matters most (reduction determinism).

What I verified as **correct and IEEE-compliant** (good news, stated plainly so it isn't
lost in the rest of this review):

- `1.0/0.0 = Infinity`, `-1.0/0.0 = -Infinity`, `0.0/0.0 = NaN`, `1.0/-0.0 = -Infinity` —
  signed zero is correctly tracked through arithmetic.
- Subnormals are not flushed to zero: `5e-324` (the smallest f64 denormal) prints exactly,
  and round-off at the subnormal boundary (`5e-324 / 2.0 == 0`) is correct gradual-underflow
  rounding, not an FTZ bug.
- `min`/`max` propagate NaN the way wasm's own `f64.min`/`f64.max` do (verified:
  `min(1.0, NaN) = NaN`, `max(1.0, NaN) = NaN`), and NaN payload bits survive a
  `f64bits`/`f64fromBits` round trip untouched.
- `%` over floats is specified in detail in `operators.md` and in `DECISIONS.md` (truncated
  remainder, dividend's sign, exact via scaled-subtraction rather than the naive
  `a - b*trunc(a/b)` identity that drifts past 2^53) — this is the one corner of the numeric
  model that got a genuinely careful, cross-checked ruling (20/20 agreement against Python's
  `math.fmod` on adversarial vectors, per `DECISIONS.md`).
- `f32` arithmetic actually computes at f32 precision, not silently promoted to f64:
  `(1.0f32 + 1.0e-8f32) == 1.0f32` is `true`, confirming real single-precision rounding —
  this matters a lot for anyone porting an ML kernel that depends on f32 vs f64 giving
  different (and both "correct") answers.
- `-2147483648 / -1` (the classic `INT_MIN / -1` UB-in-C case) **traps**, with an
  unusually good diagnostic naming the exact hazard and telling you to guard the range —
  better than most systems languages do here.

What is **missing from the user-facing docs**, not from the implementation:

- `docs/guide/operators.md` documents `/` and `%` rounding/rounding-mode behavior in detail
  but says **nothing about `+`/`-`/`*` overflow**. I had to run `2147483647 + 1` myself to
  learn it silently wraps to `-2147483648` (confirmed: wasm `i32.add` semantics, no trap, no
  saturate) — and the only place this is *measured* in the repo is an internal perf
  micro-benchmark (`docs/internals/identity-critique-perf.md`, about an unrelated identity
  proposal), not the numeric guide. For a language that otherwise trumpets "traps loudly
  on lossy conversions" as its numeric identity, **silent 2^31 wraparound on `+` being the
  one arithmetic op with zero specification is the single sharpest inconsistency in the
  whole numeric story**: a fraction lost by a *cast* (`2.5 as! i32`) is a hard trap;
  2^31 lost by a *plain add* is silent and undocumented. A running counter, checksum, or
  histogram bucket accumulated in `i32` gets silently corrupted with no signal whatsoever,
  while the exact-cast machinery traps loudly on far more benign inputs. Document it, at
  minimum; consider whether it deserves a debug-mode overflow check the way some languages
  ship (Rust's debug-mode overflow panics are the obvious precedent, and VL's own cast
  philosophy is the same instinct applied inconsistently).
- **The SIMD design doesn't yet specify horizontal-reduce determinism/associativity.**
  `simd-design.md` §D4 states `reduceAddF32x4` is "lowered as shuffle+op, since WASM has no
  horizontal reduce" but does not say whether the shuffle-tree's specific pairing order is
  part of the contract (it changes the result under floating-point non-associativity) or
  left as an emitter implementation detail free to change. Since it's unbuilt this is not
  yet a live bug, but it's the exact kind of gap that becomes a silent behavior-changing
  refactor later if it's not pinned down before S3 ships — the doc is careful about the
  relaxed-SIMD non-determinism hazard (§A4/§O6/§D7, genuinely well-handled) but hasn't yet
  extended the same care to the *base*-SIMD reduction order, which is just as capable of
  making a "deterministic" build produce a different bit-pattern than its scalar reference
  after a reduction-tree-shape change.
- **Minor:** `print` collapses `-0.0` to the string `"0"` (verified: `print(-0.0)` prints
  `0`, even though the value's sign is correctly preserved for computation —
  `1.0 / -0.0 == -Infinity`). This is a debugging/introspection gap, not a computation
  defect (the bits are recoverable via `f64bits`), but it will cost someone an afternoon the
  first time they're trying to find a signed-zero-dependent bug by printing values.

**What's needed.** Extend `operators.md` with an overflow section for `+ - *` (one sentence
per type would do: "wraps, matching the underlying wasm instruction, no trap"). Pin the
reduction-order contract in `simd-design.md` before S3 ships, not after. Consider whether
`print(-0.0)` should render `-0` the way most numeric-aware languages do (JS, Python,
Rust's `Debug` all print `-0`).

---

## Bottom line

**Could I write a real numerical kernel in VL today?** A dot product, a naive matmul, a
histogram, an integer-only hash — yes, and the parts of the numeric model that exist
(casts, integer/float semantics, `%`, subnormals, f32 precision) are unusually carefully
specified for the parts they cover. **A softmax, a sigmoid, anything with a normalization
layer, anything needing a PRNG, or anything that needs to be fast (SIMD, contiguous
tensors, FMA)** — no. Not "harder than it should be" — **not expressible or not
competitive**, full stop, as of this commit.

The numeric model reads as built for a *systems/scripting* language that occasionally does
arithmetic, then stress-tested hard on the *cast* boundary (which is genuinely excellent —
the exact-or-fail ruling, the `%` truncation proof, the `as%` bit-pattern escape hatch are
all better-argued than most languages' equivalent). It has not yet been stress-tested on the
*numerical-throughput* boundary at all — SIMD and math functions are both explicitly,
deliberately deferred rather than accidentally missing, which is the right process, but the
result today is: correctness-first to the point that the numerical programmer's actual job
(closed-form nonlinear functions, saturating quantization, vectorized inner loops) has no
home yet.

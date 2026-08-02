# str-eq — root cause

**Verdict: compiler-fixable (2.2x, one function), sitting on top of a
language-design representation ceiling (a further ~13x).**
`__str_eq__` is 43x slower than what wasmtime can actually do on this box, and I
measured every rung of the ladder between the two.

Box: 24-core i9-12900KF, all runs `taskset -c 2`, min-of-5, exclusive use.
Commit `1dd3d6a2`. VL always measured from a **prebuilt** `.wasm`
(`vl build` … then `vl run <out.wasm>`), so no compile time is inside any number.

---

## 1. Reproduced

| runtime | time | vs VL |
|---|---|---|
| VL `main.vl` (idiomatic `==`) | **2014 ms** | 1.00x |
| VL `-O3` | 1919 ms | 1.05x — confirms the audit's "‑O3 does nothing" |
| VL `opt.vl` (user-space unrolled compare) | 1259 ms | 1.60x |
| VL + **emitter prototype** (unrolled `__str_eq__`) | **927 ms** | **2.17x** |
| deno / V8 | 157 ms | 12.8x faster than VL |
| python3 (REPS/8, ×8 → 704 ms normalized) | 88 ms raw | 2.9x faster than VL |
| rustc ‑O | 38 ms | 53x faster than VL |

Reproduces exactly as flagged, including losing to CPython by ~2.9x.
Empty-program startup on this box: `vl run <prebuilt>` 8 ms — noise at this scale.

### Where the 2014 ms goes (per-phase, built as four single-phase programs)

| phase | what it measures | time | net ns / comparison |
|---|---|---|---|
| A identity (`ref.eq` hits) | 6M | 32 ms | 5.3 ns (loop + list index + call) |
| B distinct, equal content | 6M full 64-char scans | 748 ms | **124 ns** |
| C differ at index 0 | 3M full + 3M 1-char | 400 ms | consistent with B |
| D differ at last index | 6M full scans | 783 ms | **125 ns** |

Sum 1963 ms ≈ the 2014 ms whole program. **97% of the benchmark is the content
compare loop.** The `ref.eq` identity fast path is fine and is not the problem.

---

## 2. What the emitted code actually is

`wasm-dis` of the built module. Strings are `(type $0 (array (mut i32)))` — a
**UTF-32 code-point array**, 4 bytes per ASCII character. `a == b` lowers to
`call $4` (`__str_eq__`), emitted once per module by
**`compiler/emit_sections.vl` → `emitStrEqFnCode` (line 1814)**:

```wat
(func $4 (param $0 (ref $0)) (param $1 (ref $0)) (result i32)
 (block $block (result i32)
  (if (ref.eq (local.get $0) (local.get $1)) (then (br $block (i32.const 1))))
  (local.set $2 (array.len (local.get $0)))
  (if (i32.ne (local.get $2) (array.len (local.get $1))) (then (br $block (i32.const 0))))
  (local.set $3 (i32.const 0))
  (loop $label
   (if (i32.ge_s (local.get $3) (local.get $2))
    (then)                                        ;; empty then-arm
    (else
     (if (i32.ne (array.get $0 (local.get $0) (local.get $3))
                 (array.get $0 (local.get $1) (local.get $3)))
         (then (br $block (i32.const 0))))
     (local.set $3 (i32.add (local.get $3) (i32.const 1)))
     (br $label))))
  (i32.const 1)))
```

Nothing is *wrong* with it: no allocation in the loop, no `global.get`, no
`ref.cast`, no boxing, the length is hoisted into a local. It is the obvious
scalar loop. **One code point, one compare, one branch, two bounds checks — per
character.** That is the whole finding: at 64 chars that is 64 iterations, 128
bounds-checked GC loads and 64 unpredictable-ish branches to answer a question
Rust answers with two `vpcmpeqb`.

Things I checked and **ruled out**:
- **`i % GROUPS` where `GROUPS` is a `const` lowered to a `(mut i32)` global.**
  It looked like a real per-iteration `idiv`, but replacing it with the literal
  `i % 8` moved phase A 35 ms → 33 ms. Cranelift already handles it. Not a finding.
- **`__str_eq__` not being inlined.** Whole per-comparison fixed cost (call +
  `ref.eq` + 2 `array.len` + two bounds-checked list reads + loop) is 5.3 ns,
  0.3% of the run.
- **wasm-opt.** `-O3 --gufa` is 1.05x. Binaryen cannot unroll this either.

---

## 3. The ladder — every rung measured, not theorised

All rungs are the *same benchmark shape*: 60M comparisons of two distinct
64-character equal-content strings, hand-written `.wat`, assembled with
`wasm-as`, run under the same `vl run` host. (The GC-array rung reproduces the
compiler's emitted `__str_eq__` byte-for-byte in structure, and lands at 124.7 ns
against the compiler's measured 124 ns — the probe is faithful.)

| # | representation + loop | ns / 64-char compare | speedup over VL today |
|---|---|---|---|
| 0 | **VL today** — WasmGC `(array (mut i32))`, 1 element/iter | **124.7** | 1.0x |
| 1 | same array, element loop **unrolled 8x**, xor/or accumulator | **59.0** | **2.1x** |
| 2 | linear memory, `i32.load`, 1 element/iter | 23.0 | 5.4x |
| 3 | linear memory, `i32.load`, unrolled 8x | 16.0 | 7.8x |
| 4 | linear memory, `i64.load`, **8 bytes/iter** (UTF-8 rep) | **4.5** | **27.7x** |
| 5 | linear memory, `v128` `i8x16.eq`/`all_true`, 16 bytes/iter | **2.9** | **43x** |
| — | rustc ‑O (`String == String`, SIMD memcmp) | ~1.9 | 66x |
| — | V8 (one-byte string, word memcmp) | ~11 | 11x |

Two clean separations fall out:

- **Rung 0 → 1 (2.1x) is pure loop shape.** Identical memory traffic, identical
  bounds checks, identical representation. The only difference is one branch per
  8 elements instead of one per element.
- **Rung 1 → 3 (3.7x) is pure WasmGC array-access overhead.** Rung 3 is the same
  unrolled loop over the same 4-byte elements — only the container changed from a
  GC array to linear memory. Cranelift emits a length load from the object header
  + compare + trap-branch for **every** `array.get` and hoists none of them out of
  the loop, even though the loop bound *is* `array.len` in a local. 128 of these
  per comparison.
- **Rung 3 → 5 (5.5x) is bulk compare.** WasmGC has no array-compare instruction
  and no way to read more than one element at a time. Linear memory does.

Rung 4 (4.5 ns) is a plain scalar `i64` memcmp with no SIMD — **2.4x faster than
V8 and within 2.4x of rustc**. So the ceiling here is *not* wasmtime.

---

## 4. Bisection on the real benchmark

I patched **only** `func $4` in the built `main.wasm` (dis → edit → `wasm-as`),
leaving all four phases and the rest of the module untouched. Output byte-identical.

| phase | emitted `__str_eq__` | unrolled-8 `__str_eq__` | |
|---|---|---|---|
| A identity | 32 ms | 34 ms | −6% (noise; `ref.eq` still short-circuits) |
| B equal content | 748 ms | **347 ms** | **2.16x** |
| C differ at index 0 | 400 ms | **212 ms** | **1.89x** |
| D differ at last index | 783 ms | **358 ms** | **2.19x** |
| **whole benchmark** | **2014 ms** | **927 ms** | **2.17x** |

Note phase **C improves too** (1.89x), which was the one thing that could have
gone wrong: unrolling reads 8 elements before testing, so an early mismatch does
7 wasted loads — and it is *still* far cheaper than the branch-per-element loop.
No phase regresses.

### The user-space version proves it is not a runtime artifact

`opt.vl` is `main.vl` with `a == b` replaced by a **pure-VL** `streq8()` that is
literally the same unroll written in VL source (`self[i] ^ o[i]` or-accumulated
8 at a time). Phase B alone: idiomatic `==` **735 ms** → `streq8` **344 ms**, which
matches the emitter prototype's 346 ms to within noise. A VL *user* can reach the
same win by hand; the compiler simply is not doing it for them.

Whole-benchmark `opt.vl` is 1259 ms, not 927 ms, because a user-space compare
**cannot** reproduce the `ref.eq` identity fast path — VL exposes no
reference-identity operator — so `opt.vl` pays a full 64-element scan on phase A.
That asymmetry is the point: the hack wins on 3 of 4 phases and loses on the
fourth, and only the compiler can have both.

---

## 5. Classification

**compiler-fixable — worth 2.17x today, for one function.**

`compiler/emit_sections.vl` → `emitStrEqFnCode` should emit an 8x-unrolled
element loop with an xor/or accumulator plus a scalar remainder loop, instead of
the branch-per-code-point loop. Keep the `ref.eq` and length gates exactly as
they are. Prototyped at the `.wat` level and measured at **2014 ms → 927 ms** on
this benchmark with byte-identical output; the same body written in VL source
reproduces the win, so it is not a wasm-encoding accident. `__str_eq__` is also
one of the compiler's own hottest helpers (its `ref.eq` fast path was worth −3.8%
of a self-compile per the comment at emit_sections.vl:1804), so this should show
up on the self-compile ladder too.

Cheap and worth doing at the same time: the loop is currently
`if (i>=n) then {} else { … br }` — an if/else with an **empty then-arm** wrapped
around a `br` back to the loop header. A bottom-tested `br_if $done` loop is the
idiomatic shape; it measured the same (821 ms vs 838 ms, inside noise) so it is a
readability fix, not a perf one.

**Underneath it, language-design — the remaining ~13x.** After the unroll, VL is
still 59 ns where wasmtime can do 4.5 ns, and it still loses to V8 (5.4x) and to
normalized CPython. Cause: VL strings are `(array (mut i32))` — one WasmGC array
element per code point. That costs twice over: 4 bytes of traffic per ASCII
character, and a non-hoisted bounds check per element with **no instruction in
WasmGC that compares more than one element at a time**. No emitter change can fix
that; it needs a representation change (UTF-8 bytes in linear memory, which VL
already has machinery for in `std/buffer.vl`). Rung 4 says the payoff is 27.7x
over today and 13x over the unrolled version, with `i64` loads alone.

**Not runtime-engine.** wasmtime does a 64-byte string compare in 2.9–4.5 ns in
this exact process. The engine is not the limit; the representation is.

**Not a benchmark artifact.** Scaling holds (REPS×2 → time×2 on the linear-memory
probes; the audit's own REPS/2 and LEN 64→1024 checks stand), all four runtimes
print the same four numbers, and the per-phase decomposition sums to the whole.

---

## 6. Files

- `bench/strings/str-eq/opt.vl` — hand-optimised VL (added by this
  investigation). `vl fmt --check` clean, output matches `expect`.
- Prototype `.wat` variants and probe modules live outside the repo in the
  session scratchpad; they are reproducible from §3's descriptions.

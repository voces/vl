# Numeric determinism — the rulings `std:math` builds on

**The ask.** Three external consumers (veldt, sunsuz, glean) and an internal numerics review
converge on the same requirement: a VL program's numeric result must be the same on every host
that runs it. `docs/internals/std-math-design.md` is the surface that answer needs
(`sin`/`cos`/`atan2`/`hypot`/`exp`/`pow`); this doc is the language-level ground it stands on —
what the existing cast operators and integer arithmetic already do, formalized and verified
against the shipped compiler, plus the single determinism rule that reconciles two documents
that currently disagree about it.

This is a **design/ruling pass. No compiler or std source is touched.** Every claim below was
re-run against `dist/vl` (built 2026-09-07) rather than taken from an existing doc; where a
ruling as drafted did not match the verified behavior, that is called out in §5 rather than
silently corrected.

---

## 1. The overarching principle

**Determinism — the same `.wasm` produces the same bits on every host (Chrome, Node, wasmtime,
and every other conforming engine) — is a first-class VL guarantee for all standard numeric
operations.** It is not a std feature or an opt-in mode; it is a property of the language's
arithmetic and casts, and it is why `std:math` (design: `std-math-design.md`) will ship
deterministic polynomial approximations rather than delegating to a host's `Math.*` or libm.
The only surface that trades this guarantee away is **relaxed SIMD**, and only when a program
opts into it explicitly (§4, §D of `simd-design.md`).

Three rulings make this concrete: what a float→int cast does out of range (§2), what integer
arithmetic does on overflow (§3), and what "deterministic" means for a float op that produces
NaN (§4).

---

## 2. Float → int out of range: `as!` traps, `as?` yields null, saturation is a std helper

**Verified against `dist/vl`:**

```vl
print(2.5 as! i32)     // traps: "as! i32 at 1:15: not exact"  (rc 1)
print(2.5 as? i32)     // null
```

This matches `docs/guide/operators.md` exactly and needed no correction — the exact-or-fail
trio (bare `as` propagates null, `as?` yields null, `as!` traps) already covers "float target
rounds and cannot fail; integer target is exact-or-fail" (DECISIONS.md §"Numeric `as` to an
INTEGER target is exact-or-fail under the trio").

**Ruling: saturation (clamp-to-range) is not a fourth cast operator.** The operator surface is
closed at four spellings — `as`, `as?`, `as!`, `as%` — each with one meaning (propagate / null /
trap / wrap). A fifth suffix meaning "clamp to range" would (a) be needed by only a minority of
call sites (audio/graphics code that wants a saturating convert, not most numeric code), (b)
duplicate what a two-line std function already expresses without new grammar, and (c) start the
precedent that every new failure policy gets a keyboard symbol, which does not scale past four.
Confirmed live: `as%` stays integer-width-only —

```vl
print(2.5 as% i32)
// as% wraps between integer widths, and f64 is a float
// — use the exact family (as! traps, as? yields null)
```

so there is no float-accepting cast left for saturation to overload either.

**Where it will live: `std:math`, not `std:num`.** `std:num` does not exist as a module today
(`ls std/` — no `num.vl`); the numeric-adjacent surface that does exist is the opcode-intrinsic
family in `docs/internals/numeric-intrinsics.md` (`min`, `max`, `abs`, `sqrt`, …), which is
compiler-resident because those are single wasm instructions. A saturating convert is not one
instruction (it is a compare-and-clamp), so it belongs beside `hypot`/`atan2` in `std:math` as
an ordinary function, most likely `saturate(x: f64, lo: T, hi: T): T`-shaped or a pair of named
per-target functions (`saturateI32(x: f64): i32`) — the exact spelling is `std:math`'s to decide
at build time, reviewed by `std-api-reviewer` like every other std export.

---

## 3. Integer overflow: silent two's-complement wrap stays the default, now documented

**Verified against `dist/vl`** (`function addI32/subI32/mulI32(a: i32, b: i32): i32`, forcing
i32 width — a bare literal over i32's range infers `i64`, so the width has to be pinned by an
annotated parameter or the type check refuses it):

```vl
addI32(2147483647, 1)     // -2147483648   (i32 wraps: INT32_MAX + 1)
subI32(-2147483648, 1)    // 2147483647    (wraps the other way)
mulI32(2147483647, 2)     // -2            (wraps)
```

and at i64:

```vl
const a: i64 = 9223372036854775807
print(a + 1)               // -9223372036854775808
```

**Ruling: wrap stays the default for `+`/`-`/`*` on both `i32` and `i64`, signed only** (VL has
no unsigned integer type — `docs/internals/numeric-intrinsics.md` §"Unsigned integer ops:
operations, not a type"). This matches the wasm instructions VL emits directly
(`i32.add`/`i32.sub`/`i32.mul` and the i64 twins have no separate trapping form) and systems-
language convention (Rust release-mode arithmetic, C unsigned overflow). **The defect was never
the behavior — it is that `docs/guide/operators.md` did not say so while the cast operators
right below it are documented as loud.** Fixed in this PR: a new "Integer overflow wraps" note
in the Arithmetic section (see the operators.md diff), plus a build item for explicit checked/
saturating integer helpers in `std:math` alongside the float-cast saturation helper from §2, for
code that needs to detect or clamp rather than wrap.

**A verified exception that the wrap rule does not cover, and operators.md now states:**
`i32.MIN / -1` and `i64.MIN / -1` — the one input pair whose mathematical quotient does not fit
back in the source width — **trap**, exactly like division by zero, rather than wrapping:

```vl
divI32(-2147483648, -1)
// wasm trap: integer overflow
// note: a float→integer conversion (as i32 / as i64) whose value lies outside the
// target integer's range, or i32.MIN / -1.
```

This is `i32.div_s`/`i64.div_s`'s own trap (wasm has no wrapping division instruction), so `/`
and `%` are **not** part of the "wraps silently" rule at all — they already trap on the one
input that would overflow, the same way they trap on a zero divisor. The ruling adds nothing
here; it names what the emitted instruction already does, because operators.md's `/`/`%` rows
did not previously call out this corner.

---

## 4. NaN determinism — the rule, the contradiction, and the reconciliation

### 4.1 What was asked

Formalize: VL matches WASM's deterministic NaN canonicalization for all standard float ops;
relaxed SIMD (non-deterministic: FMA, relaxed dot) is the only exception, opt-in, with a
deterministic fallback.

### 4.2 The contradiction

Three documents make three different claims about the same bits, and they do not all agree:

| doc | claim |
| --- | --- |
| `docs/internals/simd-design.md` §A4 | Relaxed SIMD is non-deterministic "because" it is the flagged exception — the section's own framing (and the rest of the doc) treats every *non*-relaxed float op as simply deterministic, full stop. |
| `docs/serde-design.md` OQ-3 | "The wasm spec does permit [nondeterminism]... an arithmetic NaN result may carry any payload with the quiet bit set" for **standard** (non-relaxed) float ops — then measures, live on VL's two engines, that the payload agrees anyway. |
| `docs/webcraft-requirements.md` §P0.3 | Lists "NaN canonicalization (the WASM NaN-payload nondeterminism mitigation)" as a *reason the bitcast intrinsics are a hard requirement* — i.e., treats standard-op NaN nondeterminism as a real, present hazard a program must actively mitigate. |

`simd-design.md` is the odd one out: **the wasm specification itself, not just relaxed SIMD,
permits an implementation-defined NaN bit pattern for any arithmetic op that produces a fresh
NaN** (a binary op with no NaN operand that nonetheless yields one — `0.0/0.0`, `sqrt(-1)`,
`Infinity - Infinity`). That is a real, named, spec-level nondeterminism source distinct from
relaxed SIMD, and `simd-design.md` §A4's "one flag, because it is non-deterministic" framing
reads as though relaxed SIMD were the *only* such source in the language, which is not what the
spec says and not what `serde-design.md`'s own measurement is built to test.

A second, narrower tension was already caught by an earlier review and never fixed:
`docs/internals/serde-critique-crosslang.md` §(c) flags that `serde-design.md` OQ-3
recommends bits-verbatim NaN encoding (right answer for VLB's round-trip contract) while
`webcraft-requirements.md` calls NaN canonicalization a hard requirement (right answer for a
content-addressing/hashing consumer) — "two documents... give opposite advice about the same
bits," with the fix being one sentence pointing OQ-3 at `canonicalize<T>` (OQ-4) as the
*hashing* answer rather than the *encoding* one. That sentence is applied in this PR too (§4.4),
since it is the same underlying confusion (a canonicalization concern misread as an encoding or
a language-guarantee concern) surfacing a second place.

### 4.3 What is actually true (measured)

`serde-design.md` OQ-3 already ran the control that matters — the premise it opens with
("computed-NaN payload bits are engine-nondeterministic") was unverified, and the doc measured
it on 2026-09-01, on the same built module, across wasmtime and V8:

| value | wasmtime | V8 | agree? |
| --- | --- | --- | --- |
| `0.0 / 0.0` | `0xFFF8000000000000` | same | yes |
| `f64fromBits(0x7FF8…0005)` | round-trips exactly | same | yes |
| that value `+ 1.0` | payload propagated, bits unchanged | same | yes |
| `-1.0 * 0.0 / 0.0` | `0xFFF8000000000000` | same | yes |

Re-confirmed in this pass (`dist/vl`, 2026-09-07): `f64bits(0.0 / 0.0)` and
`f64bits(0.0 - (0.0/0.0))` both print `-2251799813685248` (`0xFFF8000000000000`) — a fresh NaN
and a propagated one land on the same bits, consistent with the convention every wasm engine VL
targets actually follows (a fresh NaN gets the canonical quiet-NaN pattern with the sign bit of
the operation; an operand that is already NaN has its bits propagated unchanged through further
ops). **The spec permits divergence here; VL's target engines do not exhibit it.**

Relaxed SIMD's nondeterminism (`simd-design.md` §A4, §D) is a different *kind* of hazard, not a
bigger dose of the same one: `f32x4.relaxed_madd` (FMA) and relaxed min/max/dot can produce
**different finite numeric results** on different hardware (single- vs. double-rounding is a
property of the FPU executing the instruction, not a choice an engine's software makes), and no
engine choice or measurement window closes that gap the way it closed the NaN-payload one — the
non-relaxed fallback (`mul` then `add`, one extra rounding) is the only deterministic path, which
is exactly why `simd-design.md` §D already keeps it strict-by-default and gates the fast path.

### 4.4 The rule (reconciled)

**VL's determinism guarantee for standard (non-relaxed) numeric operations is a verified
engineering commitment across VL's supported host matrix, not a claim about what the WASM
specification mandates.** Stated precisely:

1. The WASM spec names **two** sources of cross-engine nondeterminism: (a) the exact bit
   pattern of a freshly-produced NaN from a standard float op, and (b) relaxed SIMD's
   hardware-dependent rounding.
2. VL has measured (a) across its two target engine families — V8 (Chrome/Node/Deno) and
   wasmtime — and found **zero observed divergence**: every engine VL ships on canonicalizes a
   fresh NaN the same way and propagates an existing NaN's payload unchanged. This is a checked
   invariant, re-verified whenever a new engine joins VL's support matrix or a target engine
   changes its float unit — not an assumption inherited from the spec.
3. (b) is not offered the same treatment, because it is not the same hazard: it changes actual
   finite results based on the executing hardware, has no observed convergence the way (a) does,
   and is why it stays a separately-gated, opt-in tier (`simd-design.md` §A4/§D/§O6) rather than
   something VL treats as "deterministic in practice."
4. Consequence for `std:math`: a deterministic polynomial approximation built from standard
   scalar float ops inherits VL's measured determinism guarantee (point 2). It must **never**
   use relaxed SIMD internally, and never delegate to a host's `Math.*`/libm, whose *algorithm*
   choice (not just NaN bits) is unspecified and does vary by host — see
   `docs/internals/std-math-design.md` §"The determinism contract."

### 4.5 The reconciliation edits made in this PR

- `docs/internals/simd-design.md` §A4 — add a paragraph distinguishing relaxed SIMD's
  finite-value nondeterminism from the spec-permitted-but-unobserved NaN-bit-pattern
  nondeterminism of standard ops, pointing here for the full rule and to `serde-design.md`
  OQ-3 for the measurement it rests on.
- `docs/serde-design.md` OQ-3 — the one-sentence fix `serde-critique-crosslang.md` §(c) already
  specified: point at `webcraft-requirements.md`'s mitigation and note that canonicalization is
  the *hashing* answer (OQ-4's `canonicalize<T>`), not a reason to change the *encoding* default.

---

## 5. Where the drafted rulings needed correction

Verification changed the wording of one ruling and left two unchanged:

- **Ruling 1 (float→int casts) and Ruling 2 (integer overflow wraps) are confirmed exactly as
  drafted** — every behavior tested against `dist/vl` matched the proposed ruling with no
  surprises, beyond the `i32.MIN / -1` trap corner in §3, which the draft did not mention and
  which is worth stating explicitly since it is the one place `/`/`%` look like they might wrap
  but instead trap.
- **Ruling 3 (NaN determinism) as drafted — "VL matches WASM's deterministic NaN
  canonicalization for all standard float ops" — overstates what WASM guarantees.** The spec
  does not make standard-op NaN bit patterns deterministic; it permits them to vary, and VL's
  actual guarantee is an empirically-verified property of the two engines VL ships on today
  (§4.3), not a property inherited from the spec. The corrected version (§4.4) keeps the
  practical conclusion the draft wanted — standard ops are deterministic in practice, relaxed
  SIMD is the deliberate opt-in exception — but grounds it in measurement with an explicit
  re-verification obligation as the host matrix grows, rather than in a spec guarantee that does
  not exist. This distinction matters operationally: it is the difference between "never check
  this again" and "re-run `serde-design.md` OQ-3's measurement before adding a third target
  engine," and only the second is actually safe to promise sunsuz's parity harness.

---

## 6. What this doc does not settle

- The exact `std:math` saturating-cast and checked-arithmetic helper names and signatures —
  `std-math-design.md`'s job, reviewed by `std-api-reviewer` at build time (nothing here adds an
  export).
- A source-located diagnostic for `as!`'s trap message — open in
  `docs/internals/open-rulings.md` ("Out-of-range `f64 as i32`"), unaffected by this doc since
  that filing already assumed trap-stays-the-default and only priced the diagnostic.
- Whether VL ever adds a third target engine class (e.g. a non-V8, non-Cranelift engine); §4.4
  point 2 is the re-verification obligation that decision would trigger.

# Contextual f32 literals (webcraft P2) — the ruling, and what was actually missing

Status: **shipped**. The spec asked for `let x: f32 = 0.5` and f32-typed call sites to
accept bare literals "without `as f32` noise", on the grounds that "today's
`.`-literal-defaults-to-f64 + lossy-rejection rules make every constant a cast".

The first thing this slice did was **measure that claim**, and it is half true. The
`.`-literal half was already shipped, across every position the spec names and several it
does not. The **integer**-literal half was missing in all eighteen positions measured. So
the deliverable is not the feature the spec describes — it is the other half of it, plus
the ruling that says why the two halves take *different* rules.

---

## 1. The ruling

> **A literal is admitted into an f32 context exactly when f32 holds the best
> representation of what the author WROTE.**

That one sentence resolves to two different mechanisms, and the split is forced by
measurement rather than chosen for symmetry:

| literal | design | rule | rationale |
| --- | --- | --- | --- |
| `0.5`, `0.1`, `-3.14` | **(a) context-typing** | the literal IS f32 from birth; `ieeeBytes` rounds ONCE at 24-bit precision | writing the `.` is the author asking for a real number, so rounding is the contract |
| `1`, `0`, `-2`, `0x10` | **(b) exact-representability gate** | admitted iff f32 holds the value exactly (`intLexemeIsExactF32`) | an integer literal denotes an exact integer; silently changing it is the lossy implicit conversion VL forbids |

### Why not (a) for both

`const x: f32 = 16777217` would silently become `16777216`. That is exactly the
"lossless-only implicit widening" violation the language's posture exists to prevent, and
unlike a decimal fraction it is a value the author can reasonably expect to survive. C
takes design (a) here and loses the digit without a word; VL does not.

### Why not (b) for both

An exactness gate on `.` literals rejects `0.1`, `0.2`, `3.14` — essentially every
constant anyone writes. Almost no decimal fraction is exactly representable in binary
floating point, so gate (b) applied to the float half would leave the feature with nothing
to admit. This is the measured argument, not an aesthetic one.

### The escape hatches, and why the rejection is about silence rather than reach

An inexact integer constant keeps two, both one token:

- `16777217.0` — context-typed, ONE rounding, performed at f32;
- `16777217 as f32` — an explicit convert.

Nothing is unreachable. The gate only removes the *silent* path.

---

## 2. Double rounding — the stance, and the witness

Design (a) is only sound if the literal is genuinely parsed **at** f32. Rounding a decimal
to f64 and then demoting to f32 is **not** the same function as rounding it to f32, and
"they agree for the literals people write" is false in general.

`compiler/emit_bignum.vl`'s `ieeeBytes` already does the right thing and says so: sign and
mantissa parse into a bignum, align to `sigBits + 1`, one divmod, one
round-to-nearest-ties-to-even at the target precision. `f64Bytes` and `f32Bytes` are the
same function at `sigBits` 53 and 24. **There is no f64 intermediate anywhere on the
literal path.**

The witness is `tests/cases/numerics/f32-literal-single-round.vl`:

```
1.00000017881393432617187
```

sits just below the f32 midpoint between `1 + 2^-23` (`0x3F800001`, odd significand) and
`1 + 2^-22` (`0x3F800002`, even).

| path | result |
| --- | --- |
| round once at f32 | rounds DOWN → `0x3F800001` = **1065353217** |
| round to f64, then demote | lands exactly ON the midpoint, then ties-to-EVEN rounds UP → `0x3F800002` = **1065353218** |

Both numbers are read out of a real build with `f32bits`. For `0.1` the two paths agree —
which is precisely why the disagreement needs a constructed witness and not a convenient
one.

### The consequence for the acceptance criterion

It is tempting to accept the sugar by requiring the bare literal to lower **byte-identically
to its `as f32` cast twin**. That criterion is **wrong**, and this measurement refutes it:

- for the witness above the two spellings are *different numbers*, so byte-identity would
  mean adopting the double-rounded one — a regression, not a proof;
- even for agreeing values the two do not lower alike. `const x: f32 = 0.5` folds to a
  global initialized `f32.const 0.5`; `const x: f32 = 0.5 as f32` emits a global
  initialized to **0.0** plus `f64.const 0.5` + `f32.demote_f64` + `global.set` in the
  start function, because a cast is a runtime conversion and not a constexpr.

`as f32` is not the oracle. It is the *slower, lossier* spelling the feature exists to
delete. The acceptance criterion used instead is per-position behavioural: every f32 cell
runs and prints the right value, every f64 cell is untouched, and value-exactness cells
assert STORED BITS via `f32bits`.

---

## 3. What was measured, and what was actually missing

Three grids, run against a build of master (`ac28983a`) and again against the branch.

**Grid 1 — 32 positions, bare literal vs its `as f32` cast twin.** Every `.`-literal
position already passed on master: bindings (global/local/const/let), call arguments
(first, later, multiple), return + implicit tail + lambda return, struct field init +
field assign, array literal element + element store + push, binary `+ - * /` and
comparison, negative literals, nullable, the `"[]="` index operator, nested fields, arrays
of structs. **The `.`-literal half of P2 needed no work.**

**Grid 2 — 54 positions × {f32, f64}.** The f64 twin is the swallow control. Six cells
failed on f32 while their f64 twin passed, and every one of the six had an INTEGER literal
in it.

**Grid 3 — 18 integer-literal positions + 7 exactness boundaries + 11 controls.**
**18 of 18 rejected on master**, uniformly, with the "i32 doesn't fit in f32 — the
conversion is lossy" message. All 18 pass on the branch; all 11 controls are unchanged.

| boundary | master | branch |
| --- | --- | --- |
| `16777216` (2^24) | reject | accept, `0x4B800000` |
| `16777217` (2^24+1) | reject | **reject** (inexact) |
| `33554432` (2^25) | reject | accept, `0x4C000000` — exact, its bit rides the exponent |
| `33554433` (2^25+1) | reject | **reject** |
| `4294967040` ((2^24−1)·2^8) | reject | accept — 24 significant bits, 8 trailing zeros, and PAST i32 |
| `9000000000` | reject | **reject** (2^9 · 17578125, and 17578125 needs 25 bits) |

Note what the middle rows rule out: the admitted set is **not** "magnitude ≤ 2^24" (that
would wrongly reject every large power of two) and **not** "any i32" (unsound).

---

## 4. The implementation

### `intLexemeIsExactF32` (`compiler/emit_bignum.vl`) — the one home of the gate

A closed-form BIT test, not a re-encode. An integer `v != 0` is exactly an f32 iff

```
bitlen(v) <= 128     and     bitlen(v) - trailingZeros(v) <= 24
```

The `<= 128` bound is **exact, not a slack prescreen**: the largest finite f32 is
`(2 − 2^-23)·2^127 = 2^128 − 2^104`, and the largest 128-bit integer with ≤ 24 significant
bits is `(2^24 − 1)·2^104` — the same number. The two conditions together admit precisely
the finite f32 integers.

Digits fold at the lexeme's own base through the same bignum helpers `ieeeBytes` uses, so
`0x1000` and `4096` get one answer.

**Why it is not routed through `ieeeBytes`.** That encoder folds decimal digits with a
hard-coded `* 10`, so it cannot read a radix-prefixed lexeme at all (see §5), and the
question here — does an exact integer survive? — is not the question it answers — how does
a decimal *fraction* round?

### `isExactF32IntLitExpr` / `isF32AdoptingLitExpr` (`compiler/typecheck.vl`)

`isFloatLitExpr` already existed with five grant sites. Rather than add a sixth predicate
at each, both halves now funnel through one `isF32AdoptingLitExpr`, so the float and
integer halves **cannot drift apart position by position** — which is the defect the float
half itself shipped through (it reached bindings before arguments, and arguments before
returns). Sites: `assignableExpr` (the main seam — bindings, arguments, returns, fields,
elements, stores, pushes all reach it), the object-literal field-widening arm, the
lambda-inferred-return arm, the `??` inner-type arm, and `binOpType`'s literal-adopt arm.

A sixth site was **added**: ordering comparison. `binOpType`'s arm covers arithmetic, but a
comparison yields `TY_BOOL` and never consults `widerNumeric`, so `fv > 1` rejected while
`fv + 1` was accepted. `cmpF32LitAdopts` closes that.

**The mixed-arithmetic lattice is untouched.** The literal RETYPES before the lattice runs;
`mixesNumeric` / `widerNumeric` / `binMixHardF64` see exactly the pairs they saw before,
because the only pairs the arm intercepts (an f32 beside a LITERAL) were already an
f32-typed result (float literal) or a hard error (integer literal).

### `emitExprAsF32` (`compiler/wasmEmit.vl`)

Its integer-literal arm emitted `i32.const N` + `f32.convert_i32_s`. That is now a direct
`f32.const`, which is strictly better on three counts:

- it is a **constexpr**, so an integer literal reaches an f32 field / element of a `const`
  global — the convert pair made those `constant expression required: non-constant`;
- it survives past the i32 range, where `parseI32` silently **wrapped**;
- it is two bytes shorter.

The value is identical wherever the old path was correct: `f32Bytes` rounds to
nearest-even, exactly what `f32.convert_i32_s` computes.

---

## 5. Three PRE-EXISTING defects the sweep turned up

All three reproduced on master before being fixed here. None is caused by the feature; all
were found by widening the grid, and each had to be fixed because the new grant routes far
more literals through the affected code.

### (i) A radix literal in a FLOAT context was a silent wrong value

```vl
const x: f64 = 0x10    // printed 7210
const x: f64 = 0b101   // printed 50101
```

rc 0, `vl check` clean, no diagnostic. `ieeeBytes` folded mantissa digits with a
hard-coded `* 10` and `c - '0'`, walking straight over the `0x` prefix: 0, then
`'x' - '0'` = 72, then 721, then 7210.

Only the **constexpr** path was wrong — a float context lowers an integer literal directly
as `f64.const`/`f32.const` so a `const` global initializer stays a valid wasm constant
expression, whereas the call-ARGUMENT spelling `f(0x10)` converts from i32 and was always
right. That asymmetry is why it hid. Fixed in the encoder, so both widths and every
position take it at once. Pin: `tests/cases/numerics/float-literal-radix-constexpr.vl`.

### (ii) An integer literal boxed into a float-only union was invalid wasm

```vl
const x: f64 | null = 1   // "type mismatch: expected anyref, found i32"
```

`vl check` clean, in the GLOBAL, LOCAL and ARGUMENT positions alike.

This is the **"classifier taught HALF a set"** shape. `emitUnionCoerce` settles a value-atom
code for the payload; its i32 default promotes to `i64` when the union has no i32 atom —
but the LIST arm of the very same ladder promotes an i32-element list to `i64[]` / `f64[]`
/ `f32[]`, **three** targets, on identical reasoning. The scalar arm had been taught only
the first, so an integer flowing into a float-only union kept the i32 code and boxed an i32
into the float value box.

The two spellings that WORKED localize it exactly: `i64 | null = 1` took the taught half,
and `f64 | null = 1.0` classifies as a float up the ladder and never reaches the default.
Both are controls in the pin: `tests/cases/unions/nullable-float-integer-literal.vl`.

### (iii) A doubly-signed literal in an f32 context was invalid wasm

```vl
const x: f32 = -(-1.5)      // WebAssembly translation error
const x: f32 = -(-(-1.5))   // the same
```

`vl check` clean; the f64 twins ran fine.

This is the defect shape the whole family keeps taking: **the checker granted more shapes
than the emitter could lower.** `isFloatLitExpr` recurses through unary minus when deciding
that an expression is a literal eligible for the f32 context; `emitExprAsF32` matched
exactly ONE minus. So a doubly-signed literal was admitted by the checker, not recognized as
a literal by the emitter, and lowered through the f64 path into an f32 slot.

It was found by an **edge sweep run after the main grids were already green** — worth
recording, because the three position grids all passed while this sat one syntactic step
outside every one of them.

The integer twin is why it had to be fixed rather than noted: without it the P2 grant would
have turned `const x: f32 = -(-1)` from a clean type-error reject on master into invalid
wasm — a regression in failure MODE, which is not shippable even for a program that was
never valid. Both sides now share one peel, `signedNumLitText`, which folds any number of
signs into the literal's text. Pin:
`tests/cases/numerics/f32-nested-sign-literal.vl`.

---

## 6. Evidence

| channel | result |
| --- | --- |
| fixpoint | `compile(next) == next` at 2 compiles, from a freshly fetched published seed |
| native-fixpoint | stage3 == stage4 byte-for-byte |
| suite (`SELFHOST_NATIVE_ALIGN=1`) | **3480 / 0 / 8** (master 3466 / 0 / 8; +14 = 7 new fixtures × 2 tiers), ignored SET unchanged |
| lint-self + fmt-check | clean |
| rep-fuzz-check | exact, 1 baselined failure, 0 new / 0 stale |
| corpus A/B (6 channels, 1,657 files) | **1 pre-existing file** differs, +2 bytes, all 18 of its logged values identical — the `i32.const 7; f32.convert_i32_s` → `f32.const 7.0` swap, confirmed at the byte level |
| compiler byte delta | +1,126 B |

### The fuzz channel reads zero, and that zero is VACUOUS — do not bank it

25,200 programs/side, shapes identical in both batches, zero `.vl` divergences (the only
`.err` differences are the mktemp path).

That zero means nothing on its own, so it was calibrated with **two** sabotages on the same
harness — one calibration is not a calibration:

| probe | sabotage | grid witnesses | fuzz vs baseline |
| --- | --- | --- | --- |
| **P1** (null) | `intLexemeIsExactF32` always false — the P2 grant switched OFF | **40** | **IDENTICAL** (36 shapes / 3,600, same set) |
| **P2** (positive control) | `emitExprAsF32` emits `f32.const 99` for every literal | 30 | **405** shapes / 3,600 — **369 new MISMATCHes**, every one f32-shaped |

P2 proves the harness is live and reaches `emitExprAsF32`'s literal arm heavily, so P1's
zero is not a broken instrument. P1 proves the fuzz still cannot see the feature even with
it fully disabled and 40 grid cells visibly moving.

The mechanism is structural and checkable in the generator: `scripts/fuzzgen.vl`'s f32 leaf
always builds `d + ".0"` or `d + ".5"` — a `.` literal — and never a bare INTEGER in an f32
position, nor more than one leading sign. So the generator cannot produce a program this
change affects.

**The fuzz zero is an empty divergence population, not evidence of inertness.** The
load-bearing channels here are the three grids, the edge sweep, the corpus A/B and the pins.

---

## 7. Out of scope, and why

- **f32 inference without an annotation** (`const x = 0.5` alone). The literal's default is
  f64 by design and nothing in the spec asks for that to change.
- **A generic's inferred return flowing into f32** — `function id<T>(v: T): T` with
  `const r: f32 = id(0.5)` still rejects. By the time the call is typed, `T` has been bound
  to f64 and the value is a genuine f64 VALUE, not a literal. Rejecting a lossy demote there
  is the correct behaviour, not a gap.
- **`Map<string, f32>`** is `unknown type` — but so is `Map<string, f64>`. A general
  float-map gap, unrelated to literals.
- **`(f32 | null)[]` with `??` on an element** — `` `??` is only supported on a map index ``.
  Fails identically for f64; pre-existing and unrelated.

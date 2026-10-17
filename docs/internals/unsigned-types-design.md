# Unsigned integer types — `u32` and `u64`

**Status: U1–U4 ruled, U5–U14 open, nothing built.** The owner ruled (a) on U1–U3 on
2026-10-03 and on U4 on 2026-10-04. The rulings are recorded in `DECISIONS.md` §"`u32` and
`u64` are value types". U1 amends `DECISIONS.md` §"Types & semantics", *"Unsigned integer ops
are operations, not a `u32` type"*, and `numeric-intrinsics.md` §"Unsigned integer ops:
operations, not a type". Section 1.4 explains why the question was reopened.

**The idea in one sentence.** `u32` and `u64` are value types that share their wasm valtype with
`i32` and `i64`. The checker tracks signedness; the emitter uses it to choose the `_u`
instruction wherever wasm has an `_s`/`_u` pair. Wasm itself makes the same split: it has no
unsigned types, only unsigned instructions. VL's `u8` already does the same thing for storage.

Section 5 holds the questions for the owner, one per decision, each with a sample per option
and a recommendation; U5 to U14 are awaiting ruling. Sections 1 to 4 are the evidence behind
them. Section 6 is the smallest build that unblocks eardstap's EV-001 (splitmix64 over `u64`).

---

## 1. Survey

### 1.1 `u8` today: storage only, and arithmetic happens at `i32`

`u8` is a member of the checker's closed `PrimName` set (`compiler/typecheck.vl`, `PrimName`,
`TY_U8`). It is legal in only two places: as an array element (`u8[]`, which lowers to a WasmGC
`(array (mut i8))` behind a list wrapper, VKind `u8list`) and as a `flat` field. Everywhere else
it is refused: as a local, param, return, binding, map value, union member and generic argument.
`primTyOfName` declines it (the `TY_U8` comment also names a `tyVarMayBind`, a function that no longer exists under that name).

* **A read widens to `i32`.** `arrElemValueTy` maps an element type of `u8` to `TY_I32`, and the read
  is `array.get_u`, which zero-extends. So `xs[0] + 300` over `u8[]` is an `i32` sum
  (probe: prints `301`). A `u8` value never takes part in arithmetic.
* **A write truncates.** A computed `i32` stored into a `u8[]` keeps its low 8 bits (owner ruling
  of 2026-09-04: the implicit store stays). A literal over 255 is a check error (`u8LexValue`).
  D3428 asks whether a negative constant should also refuse there.
* **`as u8` is the exact-cast trio** with domain 0..255 and an `i32` result (D1587):
  `300 as? u8` is `null` and `300 as% u8` is `44`. `numCastDomainName` returns `"u8"` as the
  domain while the rep target is `i32`.
* **Why storage only.** The owner ruled on 2026-08-22: *"a type may brand, but it must not claim a
  value range it does not enforce"*. A `u8` value held in an `i32` would claim 0..255 with
  nothing enforcing it. A `u8` slot does enforce it, because the byte store truncates. The same
  rule is why `i8`, `u16` and `i16` exist only as `flat` field widths (`ROADMAP.md`, the
  byte-multiple field widths entry).

**What this means for `u32`/`u64`.** The "lying" objection does not apply to them. A `u32` held
in an `i32` local has exactly 2^32 values. Every bit pattern is a valid `u32`, and arithmetic
modulo 2^32 never leaves the range. The claim is enforced by the width. A `u16` value type would
still lie, because its i32 rep has values outside 0..65535.

### 1.2 Unsigned operations today: intrinsics and one operator

| spelling | home | i32 instruction | i64 instruction |
| --- | --- | --- | --- |
| `divU(a, b)` | compiler intrinsic | `i32.div_u` 0x6e | `i64.div_u` 0x80 |
| `remU(a, b)` | compiler intrinsic | `i32.rem_u` 0x70 | `i64.rem_u` 0x82 |
| `ltU` `gtU` `leU` `geU` | compiler intrinsic | `lt_u` 0x49 … `ge_u` 0x4f | 0x54 … 0x5a |
| `a >>> b` | operator | `i32.shr_u` 0x76 | `i64.shr_u` 0x88 |
| `__trunc_sat_f64_u_i32__` and the three siblings | raw-floor intrinsic | `i32.trunc_sat_f64_u` | `i64.trunc_sat_*_u` |
| `__load_u8__`, `__load_u16__` | raw-floor memory intrinsic | `i32.load8_u`, `i32.load16_u` (zero-extending) | — |
| `__load_u8_i64__`, `__load_u16_i64__`, `__load_u32_i64__` | raw-floor memory intrinsic | — | `i64.load8_u`, `i64.load16_u`, `i64.load32_u` (a u32 in memory read straight into an `i64`) |
| `__extend_low_i32x4_u__` | SIMD intrinsic (`v128`) | — | `i64x2.extend_low_i32x4_u` (u32 → i64, two lanes) |
| `__convert_i32x4_u__`, `__convert_low_i32x4_u__` | SIMD intrinsic (`v128`) | `f32x4.convert_i32x4_u` (u32 → f32) | `f64x2.convert_low_i32x4_u` (u32 → f64) |

The intrinsics are not in `std/`. They are bare-name, shadowable compiler intrinsics: the
checker's arm is `numIntrCallTy` in `typecheck.vl`, and the opcode tables are
`intIntrOpI32`/`intIntrOpI64` in `wasmEmit.vl`, emitted by `emitIntIntr`. They pick their width
from the operands (`i64` when either operand is `i64`) and return the operand width, or
`boolean` for the four compares. `>>>` is an ordinary entry in `binOpcode`/`binOpcodeI64`
(`emit_base.vl`). The signed instruction is the default everywhere: `/` is `div_s`, `%` is
`rem_s`, `<` is `lt_s`, `>>` is `shr_s`, `as f64` is `convert_*_s`, and `i32 → i64` widening is
`extend_i32_s`.

So unsigned *conversions* do exist, but only at the raw floor: a zero-extending load from
linear memory, a saturating float truncation, or a SIMD lane operation over a `v128`. What a
SCALAR value in a local cannot reach is any of `i64.extend_i32_u`, `f64.convert_i32_u`,
`f32.convert_i32_u` or `f64.convert_i64_u`, and there is no unsigned print. A program holding a
u32 in an `i32` local therefore widens it with `(x as i64) & 0xFFFFFFFF` (1.3), or stores it and
reloads it with `__load_u32_i64__`. The load and SIMD routes were probed during review of this document; this revision re-ran three
loads on the 2026-10-03 seed: after `__store_i32__(64, -1)`, `__load_u32_i64__(64)` prints
4294967295, `__load_u16_i64__(64)` prints 65535 and `__load_u8__(64)` prints 255.

### 1.3 How a program spells an unsigned quantity today

All of these were probed on the 2026-10-03 seed.

```vl
const a = 0xFFFFFFFF              // no context: an i32 bit pattern
print(a)                          // -1
print(divU(a, 3))                 // 1431655765
print(remU(a, 7))                 // 3
print(a >>> 28)                   // 15
let x = -1
print((x as i64) & 0xFFFFFFFF)    // 4294967295   — widen first, then mask
print(x as f64)                   // -1           — no scalar unsigned convert
const big: i64 = 0xFFFFFFFFFFFFFFFF
print(big)                        // -1, and no spelling prints 18446744073709551615
print(divU(big, 10))              // 1844674407370955161
let v: u32 = 5                    // check error: unknown type 'u32'; did you mean 'i32'?
```

`docs/guide/bytes.md` teaches the widen-then-mask idiom and explains why there is no `u32le`. It
also records that five files in the first consumer wrote the mask *before* the widen, where it
does nothing, and shipped it. That is the bug class a type would remove.

### 1.4 The earlier decision, and why it is being reopened

The recorded argument against `u32` is about cost: *"A `u32` would touch the type arena, every
rep table, every widening rule and every emitter kind code, to express something the operand
does not need to carry."* Two things have changed since it was written:

1. **The radix ruling (2026-09-30) moved signedness into the use.** A hex literal is a bit pattern
   at its use's width under every operator, so `0xFFFFFFFF % 7` is `-1`. The unsigned reading
   must be spelled `remU`. `DECISIONS.md` §"Exact constant arithmetic" (around line 9082) records
   it as *"an unsigned reading is spelled `divU`, `remU`, `ltU` or `>>>`"*, and the owner's ruling
   gave the reason as *"mirroring Wasm's `_s`/`_u` instruction pairs (Wasm has no u32/u64
   types)"*. **This proposal amends that sentence rather than contradicting it:** it stays true
   for every `i32`/`i64` use, and gains a second clause — at a `u32`/`u64` use, the plain
   operators are the unsigned reading. If adopted, the DECISIONS.md entry is edited to say so in
   the same PR as the type. The bit pattern is the same, but the program now has to choose the
   instruction at every operation instead of once, at the declaration. Section 4 counts how
   often consumers make that choice.
2. **"Every rep table" is mostly avoidable.** If `u32` shares `i32`'s valtype and rep, the rep
   tables do not change. What changes is the set of sites that pick an instruction by
   signedness, plus the union-box tags. Section 3 counts both.

The objection that "the operand need not carry it" still holds for code that mixes readings of
one word: hashes, carry chains and transliterated machine code. That is the reason section 2.10
keeps `divU` and its siblings.

### 1.5 How other languages do it

| | Rust | Go | Zig | C# | Swift | Kotlin | AssemblyScript |
| --- | --- | --- | --- | --- | --- | --- | --- |
| unsigned types | `u8`…`u128`, `usize` | `uint8`…`uint64`, `uint` | `u0`…`u65535` | `byte` `ushort` `uint` `ulong` | `UInt8`…`UInt64`, `UInt` | `UByte` `UShort` `UInt` `ULong` (value classes over the signed ones) | `u8` `u16` `u32` `u64` `usize` |
| implicit conversions | none, not even widening | none | lossless widening only (`u32 → i64` yes, `i32 → u32` no) | lossless widening (`uint → long`/`ulong`; `int → uint` no) | none | none *"where the full range of possible values can be represented in the target type, regardless of interpretation/signedness"*: so `i32 ↔ u32` and `i64 ↔ u64` are implicit (a reinterpretation), as are `i32/u32 → f32` and `i64/u64 → f64`, which round |
| explicit conversion | `as` wraps or truncates; `TryFrom` checks | `T(x)` wraps or truncates | `@intCast` checks, `@truncate`, `@bitCast` | cast; checked or unchecked context | `UInt32(x)` traps; `truncatingIfNeeded:`, `bitPattern:` | `.toUInt()` reinterprets | `<u32>x` |
| literal typing | inferred from context; out of range is a deny-by-default error | untyped constant, exact; error if it does not fit | `comptime_int` coerces if it fits | first of `int`, `uint`, `long`, `ulong` that fits; `0xFFFFFFFF` is `uint` | inferred from context; error if it does not fit | needs a `u` suffix (`42u`, `0xFFFFFFFFu`) | contextual |
| mixed `int` + `uint` | error | error | error (no peer type) | promoted to `long`; `ulong` + signed is an error | error | error (no operator) follows from the assignability rule: the same-width operand converts implicitly, so it compiles (the types page documents no separate rule for arithmetic); a relational compare is the exception and needs the same signedness, while `==`/`!=` need not |
| overflow | panics in debug, wraps in release; `wrapping_*`, `checked_*` | wraps | illegal behaviour (panics in safe modes); `+%` wraps | wraps unless in a `checked` context | traps; `&+` wraps | wraps | wraps |
| shift count | any integer type | any integer type, panics if negative | log2-width unsigned type | `int` | any `BinaryInteger` | `Int` | operand type |

Two shapes emerge:

* **The strict family (Rust, Go, Swift, Kotlin, Zig).** Signed and unsigned never meet implicitly.
  Zig, closest to VL's existing rule, still allows the lossless widenings.
* **The promoting family (C#, and C before it).** Mixed operands promote to a wider signed type,
  which works up to 32 bits and fails at 64. C#'s `ulong` + `int` is an error for exactly that
  reason.

VL already sits in Zig's position. `numWidensName` allows only lossless edges (`i32 → i64`,
`i32 → f64`, `f32 → f64`), and a mixed operator pair is legal only when one side widens to the
other (`mixesNumeric`). AssemblyScript is the only one on VL's substrate. Its rep is the same
one proposed here (signedness on the type, valtype shared), but its conversion rule is the
opposite of VL's: "the full range … regardless of interpretation/signedness" counts BITS, not
values, so `-1` passes into a `u32` as 4294967295 and an `i64` into an `f64` rounds, both with no
cast. That is the option section 2.1 rejects as (c). Its one signedness-strict rule is the
relational compare, for the reason section 2.7 gives.

---

## 2. Proposal

Each decision lists its alternatives and a recommendation. The question form is in section 5.

### 2.1 Conversions: implicit only where lossless, `as` otherwise

Add three edges to the widening lattice, each exact, plus one adaptation rule for `u8` reads
(2.9), which is not a lattice edge because a `u8` is never a value:

| from | to | instruction |
| --- | --- | --- |
| `u32` | `i64` | `i64.extend_i32_u` |
| `u32` | `u64` | `i64.extend_i32_u` |
| `u32` | `f64` | `f64.convert_i32_u` |
| `u8` element | `u32` | (already an `i32` read in 0..255; see 2.9) |

Every other pair is an explicit `as`, under the existing family:

* `as`, `as?`, `as!`: exact or fail. `-1 as? u32` is `null`, and `4000000000 as! i32` traps.
* `as%`: wrap to the target width. Between the 32-bit pair, and between the 64-bit pair, it
  reinterprets the bit pattern: `-1 as% u32` is 4294967295. From `i64`/`u64` to a 32-bit type,
  it keeps the low 32 bits.

**Alternatives.** (b) Rust/Swift: no implicit conversions at all. That would contradict VL's
existing `i32 → i64` edge. (c) AssemblyScript's rule: any conversion whose target has as many bits, "regardless of
interpretation/signedness", is implicit. That makes `i32 ↔ u32` a silent reinterpretation and
`i32 → f32` / `i64 → f64` a silent rounding, which are the kinds of conversion the owner's
"no silent loss" rulings reject.

**Recommendation: (a).** It is the existing lattice extended by its own rule.

### 2.2 Literal typing: literals adapt, and the radix ruling holds unchanged

* **A decimal literal is a number.** It adapts to `u32`/`u64` when its value fits:
  `let n: u32 = 4000000000` is fine, `let n: u32 = -1` is refused (`constant -1 overflows u32`),
  and `4294967296` at `u32` is refused. This is the exact-constant ruling applied to two more
  destinations.
* **A radix literal is a bit pattern at its use's width.** At `u32`, `0xFFFFFFFF` is 4294967295:
  for an unsigned type the pattern and the value are the same number. The *operator* is chosen by
  the use's type, so `0x80000000 / 2` at `u32` is 1073741824 (`div_u`) and at `i32` is
  -1073741824 (`div_s`). The radix ruling already says "at the use's width"; this adds "under the
  use's signedness".
* **With no context, nothing changes.** A literal with no typed use still defaults to `i32`, `i64`
  or `f64` as today, so `print(0xDEADBEEF)` still prints -559038737. `u32` is never a default.
* **Literal-initialised bindings (ruling B′/C).** A `let` initialised by an integer literal is
  re-typed by deliveries and stores to `u32`/`u64` when the value fits, exactly as it is re-typed
  to `i64` today. `let n = 0; total += n` with `total: u32` makes `n` a `u32`. A literal `const`
  takes `u32` at a `u32` use. So `const MASK = 0xFFFFFFFF` is -1 where it meets an `i32` and
  4294967295 where it meets a `u32`.

**Alternative for the no-context default (b).** A radix literal whose top bit is set and has no
context defaults to `u32`/`u64`, so `print(0xDEADBEEF)` prints 3735928559. That reverses the
2026-09-04 hex ruling's last row for programs with no context, and changes output for existing
programs: `tests/cases/literals/hex.vl` is the known one.

**Recommendation: (a).** No default changes, and `u32` arrives only where a program names it.

### 2.3 Mixed signed and unsigned operands: a check error, with two exceptions

`a op b` with `a: i32` and `b: u32` (or `i64` and `u64`) is refused, with a fix naming
`as`/`as%`. This takes no new rule: neither type widens to the other, so `mixesNumeric` is false
and the existing "operator is not defined for" path fires. `u32 + i64` is legal and is `i64`,
because `u32` widens to `i64`.

Two exceptions:

1. **A literal operand adapts**, as it does today. `x + 1`, `x * 0x9E3779B9` and `x < 10` over a
   `u32` are `u32` operations.
2. **A shift count may be any integer type.** The count is taken modulo the width, so its
   signedness does not affect the result's bits. Rust and Go both allow this. Without the
   exception, `h << k` with `h: u32` and `k: i32` would need a cast at almost every shift.

**Alternative (b): promote to `i64`, as C# does.** `i32 + u32` would be an `i64`. It is exact at
32 bits and impossible at 64 (`i64` + `u64` has no common type), so the rule would apply to one
width and not the other. It also adds an implicit conversion between types that do not widen
into each other.

**Recommendation: (a), with both exceptions.**

### 2.4 Numeric-join unions: `u32` and `u64` join like every other number

Under the numeric-join ruling, runtime values of different numeric types join as a union:
`if c { u } else { i }` with `u: u32` and `i: i32` is `i32 | u32`. `r is u32` works. Arithmetic
over the union dispatches per member, and each member pair takes 2.3's rule. So
`(i32 | u32) + 1` is `i32 | u32`, and `(i32 | u32) + someI32` is refused, because the
`(u32, i32)` pair has no rule. Delivering the union into `i64` converts, because every member
widens to `i64` exactly. Delivering it into `i32` or `u32` is refused with an `as` fix.

That requires the union box to tell a `u32` from an `i32` holding the same bits, so `u32` and
`u64` each need their own value-atom kind code (section 3.3). Newtypes cannot do this today:
`U | i32` with `type U = new i32` is refused as *"the same runtime representation, so `is`
cannot tell them apart"*. `u32` must not inherit that refusal.

**Alternative (b): join to the widest exact type.** `i32` with `u32` joins to `i64`. This
contradicts the ruling's own example, where `i32` with `f64` joins to `i32 | f64` and not to
`f64`, and it changes what `is i32` answers depending on which arm ran.

**Recommendation: (a).** It is the existing ruling with two more members.

### 2.5 Overflow: wrap, as `i32` and `i64` do

`+`, `-` and `*` on `u32`/`u64` wrap modulo 2^32 or 2^64. Wasm's `add`/`sub`/`mul` are
sign-agnostic, and `numeric-determinism-rulings.md` already rules wrap as the default for `i32`
and `i64`. `u32` division by zero traps, as `i32` division does.

**Unary minus on an unsigned operand.** (a) Refuse it, as Rust does, and point at `0 - x`, which
wraps. (b) Allow it as `0 - x`, as Go does. **Recommendation: (a).** A negated unsigned value is
nearly always a mistake, and the deliberate spelling stays one token longer.

**Alternatives for overflow itself.** (b) trap, as Swift does. (c) trap in a debug build, as Rust
does. Both contradict the existing wrap ruling and would make `u32` slower than `i32`.

**Recommendation: (a), wrap.** The checked and saturating helpers that the determinism ruling
filed for `std:math` would cover `u32`/`u64` once they exist.

### 2.6 Printing and `std:fmt`

* **`print(u)` for a `u32`** lowers to `i64.extend_i32_u` followed by the existing
  `__print_i64__` import. It needs no host change.
* **`print(u)` for a `u64`** has no existing import that renders it. Three options:
  * (a) A new host import, `__print_u64__`. This changes the ABI of the native host, the JS
    runtime and the playground.
  * (b) An emitted helper. When the value is non-negative as an `i64`, print it as one. Otherwise
    print `divU(u, 10)` (always below 2^63) and then the last digit. This needs the print stream
    to accept two writes for one line, which is unverified (`__print_char__` and
    `__print_str_flush__` exist).
  * (c) Lower `print(u64)` to `print` of the decimal string that 2.12's `toString` produces.
  **Recommendation: (c).** It adds no host ABI, reuses one rendering path, and interpolation
  already depends on `std:fmt`.
* **`toString`.** Widen its domain from `i32 | i64 | boolean | f64` to
  `i32 | i64 | u32 | u64 | boolean | f64`, so `"\{u}"` works. This adds no new name.
* **Parsing.** Add `parseU32` and `parseU64` beside `parseI32` and `parseI64`.

Both std changes go to `std-api-reviewer` (2.12).

### 2.7 Comparisons: same signedness, or a literal

`<`, `>`, `<=` and `>=` on two `u32` operands lower to `lt_u` and its siblings. `==` and `!=` are
sign-agnostic. `u32 < i32` is refused under 2.3's rule. That is also AssemblyScript's rule, and
it exists because wasm has separate signed and unsigned compares. `min`/`max` over `u32` must use
the unsigned compare inside `emitIntMinMax`, which today hard-codes `lt_s`/`gt_s`.

**Alternative (b): mixed comparisons are exact**, as C++20's `std::cmp_less` is. `i32 < u32`
compares as `i64`, and `i64 < u64` emits `a < 0 || (a as u64) < b`. This gives the right answer
where Rust and Go give an error, but it makes comparisons the one place 2.3 does not apply.

**Lint.** `u < 0` is always false and `u >= 0` is always true. A `warning`-tier lint, named for
example `unsigned-compare-zero`, would catch them, as rustc's `unused_comparisons` does.

**Recommendation: (a), plus the lint.**

### 2.8 `as` to and from floats

* **To a float.** `u32 → f64` is implicit (2.1). `u32 as f32`, `u64 as f64` and `u64 as f32`
  round, as `i64 as f64` does today, and lower to `f32.convert_i32_u`, `f64.convert_i64_u` and
  so on.
* **From a float.** `f64 as u32` is the exact trio over the domain 0..2^32−1: the range test, then
  `i32.trunc_f64_u`. `as%` from a float stays refused (owner ruling: `as%` is integers only). The
  existing `__trunc_sat_*_u_*__` intrinsics already cover saturation, and their results could be
  typed `u32`/`u64` instead of `i32`/`i64`. That is a signature change, and it is left to the
  owner (section 5, U10).

### 2.9 Widening into `i64`/`u64`, and `u8` elements

The 2.1 edges cover `u32 → i64` and `u32 → u64`. One more question: should a `u8[]` element read
deliver into a `u32` without a cast? Today the read *is* an `i32`, and `i32 → u32` is not
implicit, so `let w: u32 = bytes[i]` would need `as u32`, even though the value is provably
0..255.

* (a) Treat a `u8` element read like a literal: it adapts to `u32`/`u64` as well as `i32`.
* (b) Require `as u32`. It always succeeds, so the trio's failure paths are dead code.

**Recommendation: (a).** The read is in range by construction, which is the property that made
`u8` storage honest in the first place.

`u64` widens to nothing implicitly. `u64 → f64` is lossy, and no wider integer exists.

### 2.10 `divU`, `remU`, `ltU`/`leU`/`gtU`/`geU` and `>>>`: they stay

* (a) **Keep them as the unsigned reading of signed bits.** On `i32`/`i64` operands they behave
  exactly as today. On `u32`/`u64` operands they are accepted, and an `info`-tier lint says
  `divU(a, b)` is `a / b` here.
* (b) **Deprecate them.** VL has no deprecation story, and the consumer evidence rules this out.
  plumb's code generator emits `ltU`, `leU`, `divU` and `remU` into every transliterated unit:
  809 `ltU` calls in a single synthetic unit (section 4). Its 64-bit registers are `i64`
  carrying both readings, so they could not become `u64` wholesale.
* (c) **Make them `u32`/`u64`-typed**, returning or requiring unsigned. That would break every
  current call site.

`>>>` stays an operator. On `u32` it is the same instruction as `>>`, and is harmless.

**Recommendation: (a).** They are compiler intrinsics, not std exports, so the std rule against
deprecation does not apply, but nothing is gained by removing them.

### 2.11 `u16`, `i8` and `i16`: out of scope as value types

They would be `i32`-repped, so a value would claim a range nothing enforces. The 2026-08-22
ruling refused that for `u8`, and nothing here changes it. They remain `flat` field widths.
Packed `u16[]`/`i16[]` arrays (WasmGC `i16` storage) would be honest, in the same way `u8[]` is.
They are a separate, storage-only proposal and are not on this document's path. `usize`/`isize`
are not proposed: wasm32 has no pointer-width type distinct from `i32`.

### 2.12 std-API impact

Every item below is a new export or a changed signature, so each goes to `std-api-reviewer`
before it merges. None is required for the language change to land. This proposal changes **no
existing std signature**: std has no deprecation story, and changing `i32le`'s return type would
break every caller.

| module | change | why |
| --- | --- | --- |
| `std:fmt` | `toString` domain gains `u32 \| u64`; new `parseU32` and `parseU64` | 2.6 |
| `std:bytes` | new `u32le`, `u32be`, `u64le`, `u64be` | the guide's "why there is no `u32le`" answer stops being true; glean's 231 widen-then-mask sites (section 4) are this function |
| `std:buffer` | possibly `loadU32` and `loadU64` | `loadU8`/`loadU16` already exist and return `i32`; the reviewer should weigh whether a `U32` twin is duplication |
| `std:math` | none now; the filed checked and saturating helpers grow unsigned forms | 2.5 |

The `std:bytes` and `std:fmt` module headers each state a deliberate absence ("no `u32le`",
"no unsigned parser"). Those lines must change in the same PR as the export.

---

## 3. Implementation sketch

### 3.1 The design choice that sets the cost: signedness on the type, rep from the valtype

`u32` and `u64` join `PrimName`, so they are distinct to the checker. Every rep decision then
asks a single normaliser, `repPrimOf(t)`, which maps `u32 → i32` and `u64 → i64` before
consulting any rep table. The rep layer, the VKinds (`"i32"`, `"i64"`, `"list"`, `"i64list"`
and the `nul*` niches), the struct-field valtypes and the list backings are then unchanged. A
`u32[]` *is* an `i32[]` backing.

The **alternative** is to give `u32` its own VKinds (`u32`, `u32list`, `nulu32list`, …), the way
`f32` got `f32`, `f32list` and `nulf32list`. The f32 precedent is the measure of what that costs:
the `f32` discriminators below appear in 312 functions. A separate VKind buys nothing, because
the valtype is identical.

The **risk** of the normaliser is the converse: any site that asks `primName == "i32"` *without*
going through it treats a `u32` as "not an i32" and falls to that site's default. That is
exactly the "ladder with a hole" family in `CLAUDE.md`. The mitigation is to make
`kind-ladder-incomplete`, plus a position matrix (`scripts/capability-matrix.vl`) with a
`u32` template *and* an un-annotated template, part of the first PR rather than a follow-up.

### 3.2 Where the compiler switches on numeric kinds

The counts below are grep counts at master `f6e17953b`. Comment text is excluded from the
function-level counts. They are an upper bound on sites to read, not a count of sites to change.
Under 3.1, most `"i64"` sites are rep sites that the normaliser handles.

**Every function that names a numeric kind** (a function counts once however many times it
names the kind):

| discriminator | functions | lines | the files with the most |
| --- | ---: | ---: | --- |
| `i64`: `"i64"`, `TY_I64`, `exprIsI64(`, `i64list`, `binOpcodeI64`, `intIntrOpI64` | **354** | 536 | emit_classify 103, typecheck 101, wasmEmit 80 |
| `f32`: the same set for f32 (the last kind added) | **312** | 470 | emit_classify 102, typecheck 89, wasmEmit 63 |
| `u8`: `"u8"`, `TY_U8`, `u8list` | **159** | 227 | emit_classify 62, typecheck 38, wasmEmit 30 |

**Sites where signedness chooses the instruction.** Every one of these must change, and this is
the real work:

| site | callers | file |
| --- | ---: | --- |
| `binOpcode` / `binOpcodeI64` (`/ % < > <= >= >>`) | 3 + 3 | `emit_base.vl`, `wasmEmit.vl` |
| `intIntrOpI32` / `intIntrOpI64` (the intrinsics accept unsigned operands) | 1 each | `wasmEmit.vl` |
| `emitIntMinMax` (hard-coded `lt_s`/`gt_s`) | 1 | `wasmEmit.vl` |
| `fbI64ExtendI32S` (widening; needs a `_U` twin) | 5 | `wasmEmit.vl` |
| `fbF64ConvertI32S` / `fbF32ConvertI32S` | 9 + 8 | `wasmEmit.vl` |
| `fbF64ConvertI64S` / `fbF32ConvertI64S` | 6 + 4 | `wasmEmit.vl` |
| `fbI32TruncF32S` / `F64S`, `fbI64TruncF32S` / `F64S` (float → int `as`) | 3 + 3 + 2 + 2 | `wasmEmit.vl` |
| `numCastCanFail`, `numCastDomainName` (the exact-cast domains) | 8 | `typecheck.vl`, `emit_classify.vl`, `wasmEmit.vl` |
| `emitConvertAtomKind` / `atomKindConvertible` / `emitNarrowStoredAtomKind` (box ↔ scalar) | 3 | `wasmEmit.vl` |
| `njConvert` (numeric-join member conversion) | 5 | `wasmEmit.vl` |
| print (`scanPrintUse`, the `__print_i64__` import selection) | — | `emit_sections.vl` |
| the constant fold's range tests (`const_exact.vl`, `u8LexValue`, `dstIntWidth`) | — | `typecheck.vl`, `const_exact.vl` |

That is about **75 call sites across about 15 helper families**. Each one adds an `_U` twin, and
the caller picks between the twins using the operand's signedness.

**The checker's numeric rules:**

| function | callers | change |
| --- | ---: | --- |
| `numWidensName` (the lattice) | 4 | three new edges (2.1); the `u8` read adaptation (2.9) lives at the element read, not here |
| `numWidens` | 10 | none; it reads the lattice |
| `mixesNumeric` / `widerNumeric` / `sameNumeric` | 6 / 4 / — | none; 2.3 falls out |
| `isNumeric` (`i32 i64 f32 f64` hard-listed) | 18 | add two names |
| `isNumericPrimTy` (hard-listed) | 15 | add two names; this is what admits them to numeric unions |
| `numLitIsInt` | 2 | add two names |
| `numPairOpTy` / `numUnionBinTy` / `numUnionResultTy` | — | none if the lattice is right; the shift-count exception (2.3) is new |
| `primTyOfName`, `builtinTyNames`, the generic-argument refusal | — | admit `u32`/`u64` everywhere `u8` is refused |
| the literal-binding inference pass (B′) and the exact-constant destination checks | — | two more integer destinations |

### 3.3 Union and join work

* **Value-atom kinds** (`valueAtomKind`, `typecheck.vl`). Codes are append-only, because each
  doubles as a box tag offset. Today: 0 `i32`, 1 `boolean`, 2 `string`, 3 `i64`, 4 `f64`, 5 `f32`,
  6 `null`, then lists 7–13, `v128` 14 and `boolean[]` 17. `u32` and `u64` need two new scalar
  codes, and `u32[]` and `u64[]` two new list codes, for the same reason `boolean[]` got 17: the
  backing is shared, so only the tag can tell the members apart. `valueAtomKindSpan` and
  `valueAtomNameOfKind` grow to match, and `uAtomBandTop` must lift.
* **Member-pair growth.** A numeric union dispatches over its member pairs, and the numeric
  member set grows from 4 to 6. The worst-case pair table for `numUnionBinTy` and
  `emitNumUnionBin` goes from 16 to 36 pairs. Under 2.3, many of the new ones are refused
  (of the 20 pairs that involve an unsigned member, 12 are refused: `i32`/`u32`, `i64`/`u64`,
  `i32`/`u64`, `u32`/`f32`, `u64`/`f32` and `u64`/`f64`, each in both orders), and that refusal
  is the most common new diagnostic to test. The conversion matrices `njConvert` and
  `atomKindConvertible` go from 4×4 to 6×6.
* **Generics.** `T` may bind `u32`/`u64`, unlike `u8`. Monomorphization keys on the type, so
  `f<u32>` and `f<i32>` are distinct instances with distinct opcodes. That is correct, and it is
  a second test axis: a generic body `a / b` must pick `div_u` in the `u32` instance.
* **Maps.** `{[u32]: V}` can share the `i32`-keyed map rep, because hashing reads bits. Anything
  that renders keys (debug print, JSON) must read the key type, not the rep.

### 3.4 Size and phasing

These are rough figures, by analogy with the `f32` landing and the `as%`/`u8` trio PRs.

| phase | content | estimate |
| --- | --- | --- |
| 1 | `u32`/`u64` scalars: the type, the lattice, literal adaptation, op selection, `as` family, print, the min/max fix; fixtures and a position matrix in both faces | checker ~400–600 lines, emitter ~500–800, ~30 fixtures |
| 2 | Unions and lists: atom codes, `u32[]`/`u64[]`, numeric-join members, map keys | ~400–700 lines, ~20 fixtures |
| 3 | std: `toString`/`parseU*`, `u32le`/…, behind std-api-review | ~150 lines of std, one review per module |
| 4 | Lints: `unsigned-compare-zero`, the `divU`-on-unsigned hint | ~100 lines |

That totals about 2–3k lines over four PRs. Phase 1 alone is usable and leaves no soundness hole,
provided phase 1 *refuses* `u32` in a union, list or map with a loud capability refusal. That
refusal is a clause-2 debt, recorded as such, and is not to be left as a silent fall-through.

### 3.5 Risks

1. **Holes in the normaliser** (3.1). A `primName == "i32"` site that never sees `u32` falls to
   its default. That default is a *signed* opcode, which produces **valid wasm with a wrong
   value**. This is the worst kind of defect, because the validator cannot see it. Every
   fixture must therefore print a value that only the unsigned instruction produces, such as
   `0xFFFFFFFF / 2` → 2147483647 rather than 0. It must also cover both the annotated and the
   un-annotated spelling, as `CLAUDE.md`'s fixture rules require.
2. **The tag ABI.** New atom codes move `uAtomBandTop`. The union member-set ABI rule (never
   dedupe a member set; tags are positional) applies, and `scripts/rep-fuzz-check.sh` is
   mandatory for phase 2.
3. **Seed size and self-compile cost.** The new twins and pair arms add emitter bytes. The seed
   size ratchet (+3%) and `scripts/self-compile-time.sh` gate it. The compiler itself would not
   use `u32`; it uses `>>>` 97 times.
4. **An existing defect on the same path, observed while surveying.** A join of a newtype and its
   own base is check-clean invalid wasm today:

   ```vl
   type U = new i32
   function f(c: boolean, a: U, b: i32) { if c { a } else { b } }
   const r = f(false, 5 as U, 7)
   print(r is U)
   ```

   `vl run` reports *"the emitted module failed to validate inside `f` … expected (ref $type),
   found i32"*. The equivalent annotated parameter `x: U | i32` is a loud check error instead.
   It is not filed: this lane is docs-only and has no row-id range. Whichever lane builds 2.4
   will meet this mechanism, which is a join whose two members share a valtype.
5. **plumb's generator.** It never names `u32` today, so nothing changes for it. If it later
   emits `u32` registers, the 2.3 refusal turns any arm-mixing it does into check errors, and
   that cost should be measured on its corpus first.

---

## 4. Consumer evidence

These are counts of `.vl` source on 2026-10-03, read-only, from a throwaway regex counter (not
committed): `\bdivU\s*\(`, `\bremU\s*\(`, `\b(ltU|leU|gtU|geU)\s*\(`, `>>>` not followed by `=`,
`&\s*0x[fF]{8}\b` (a hex 32-bit all-ones mask), `&\s*4294967295\b` (the same mask in decimal),
and for widen-then-mask, `as\s+i64\s*\)\s*&\s*<mask>` with either spelling of the mask.
Comments are not excluded.

| consumer | files | lines | `divU` | `remU` | `ltU`/`leU`/`gtU`/`geU` | `>>>` | hex mask | decimal mask | widen-then-mask (hex + decimal) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| glean (`~/glean`) | 319 | 22,927 | 0 | 0 | 0 | 242 | 297 | 17 | **231** (216 + 15) |
| plumb `src/` (hand-written) | 79 | 43,246 | 4 | 4 | 15 | 319 | 14 | **152** | 1 + 0 |
| plumb `tools/` | 80 | 24,794 | 0 | 2 | 0 | 301 | 1 | 3 | 1 + 0 |
| plumb `vl-probes/synth/s1.vl` (one generated unit) | 1 | — | — | — | 809 | — | 822 | — | — |
| sunpa (`~/sunpa`) | 15 | 4,741 | 0 | 0 | 0 | 15 | 0 | 1 | 0 + 1 (`unsigned`, below) |
| veldt `spike/` | 2 | 201 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sunsuz, webcraft `docs`/`backlog` | 0 `.vl` | | | | | | | | |

glean's other 2 decimal masks are the same idiom without parentheses
(`nextU32(r) as i64 & 4294967295`, in `src/rng.vl:138` and `tools/sloc-solve.vl:44`), so every
decimal mask in glean is a widen-then-mask. Note also the helper's name: `nextU32` returns an
`i32`.

The plumb `vl-probes/synth/` scaling probes (s200, s1000, s4000) are replicated copies of the
generator's output: 209,481 `ltU` and 208,811 masks in total. The table quotes one unit, because
the replicas measure size, not usage.

What the counts show:

* **glean has the strongest case for `u32`.** 231 parenthesised widen-then-mask sites (233 with
  the two unparenthesised ones). Most are one helper, copied between tools:
  `function le64(b, o) { ((le32(b,o) as i64) & 0xffffffff) | (((le32(b,o+4) as i64) & 0xffffffff) << 32) }`.
  Getting the order wrong is the silent bug that `bytes.md` describes. With `u32` and a
  `u32le`, the helper becomes `(b.u32le(o) as u64) | ((b.u32le(o + 4) as u64) << 32)`, with
  nothing to mask.
* **plumb names `u32` without having it.** It has five separate functions *named* `u32`
  (`src/pdb.vl`, `src/dxbc.vl`, `src/avi.vl`, `tools/dxbc-survey.vl`, `tools/pdb-dump.vl`), all
  returning `i32`, with 203 `u32(` call sites. Its 304 `u32` mentions in `src/` are mostly field
  comments (`// u32: nonzero = …`). The *generated* code uses `ltU`/`leU` for 64-bit x86 carry
  and compare (`emit.vl:2680`: `if s == 8 { "ltU(" … }`), and masks with `& 0xffffffff` and
  `& 4294967295` to model 32-bit sub-register writes into `i64` slots. A `u32` type would not
  remove those masks. They are x86 semantics, not a VL workaround, and they are the reason 2.10
  keeps the intrinsics.
* **sunpa has written the `u32 → f64` edge by hand.** `src/worldgen/noise.vl:14`:
  `function unsigned(x: i32): f64 { ((x as i64) & 4294967295) as f64 }` — "an i32's bits read as
  an unsigned 32-bit integer" — which its mulberry32 `rand()` divides by 2^32. That function is
  exactly the implicit `u32 → f64` edge of 2.1 (`f64.convert_i32_u`), spelled as a widen, a mask
  and a convert. Its 15 `>>>` sites split three ways: 9 are hash mixing (`world.vl:35-36,41`,
  `decor.vl:18-20`, `noise.vl:19-21`), 3 are the CRC-32 table and update (`png.vl:13` twice,
  `png.vl:22`, whose polynomial `0xEDB88320` is spelled as the decimal `-306674912`), and 3 are
  big-endian byte stores (`png.vl:73-75`, `store8(b, off, v >>> 24)` and so on), where `>>` would
  do equally well because `store8` keeps the low byte. `world.vl:41`'s `(hash2(…) >>> 8) as f64`
  is the same unsigned-to-float conversion in another form.
* **No consumer has filed an ask for a `u32` type.** Searching the issue logs (glean's and
  plumb's `vl-issues.md`, sunpa's docs, veldt's `vl-notes.md`) for "unsigned", `u32` and `u64`
  finds only field descriptions. The demand is in the idioms, not in the asks.

**In the VL repo itself:** `compiler/` uses `>>>` 97 times, with one `divU` and one `ltU`, both
in comments. `std/` has 41 `>>>` and 3 masks. `tests/cases/` has 191 `>>>`, 41 masks and 37
intrinsic calls. None of it would have to change.

---

## 5. Open questions for the owner

One question per decision, in the order to ask them. Each has a sample per option and a
recommendation. U1 is the gate: if the answer is "no type", the rest do not arise. Mapping to
section 2: U2 is 2.1, U3 is 2.2, U4 is 2.3, U5 is 2.4, U6 and U7 are 2.5, U8 is 2.6, U9 is 2.7,
U10 is 2.8, U11 is 2.9, U12 is 2.10, U13 is 2.11 and U14 is 2.12.

### U1. Add `u32` and `u64` as value types?

```vl
// (a) yes — signedness on the type, the instruction follows it
const n: u32 = 0xFFFFFFFF
print(n / 2)            // 2147483647   (div_u)

// (b) no — keep the operations on i32 bits
const n = 0xFFFFFFFF
print(divU(n, 2))       // 2147483647
```

**Ruled: (a), owner 2026-10-03.**

**Recommendation: (a).** u32/u64 do not break the 2026-08-22 "no small value types" rule
(1.1). glean's 231 widen-then-mask sites are the bug class this removes, and (b) stays
available alongside it (U12).

### U2. Implicit conversions: only the lossless ones?

```vl
// (a) lossless edges implicit, everything else `as`
function f(u: u32): i64 { u }          // ok — zero-extends
function g(i: i32): u32 { i }          // error — write `i as u32` or `i as% u32`

// (b) nothing implicit (Rust / Swift)
function f(u: u32): i64 { u as i64 }   // required

// (c) AssemblyScript: any target with as many bits, "regardless of interpretation/signedness"
function g(i: i32): u32 { i }          // ok — -1 becomes 4294967295 silently
function h(x: i64): f64 { x }          // ok — rounds silently
```

**Ruled: (a), owner 2026-10-03.**

**Recommendation: (a).** It is the existing lattice with three more edges (`u32 → i64`,
`u32 → u64`, `u32 → f64`).

### U3. With no context, what is `0xDEADBEEF`?

```vl
// (a) unchanged: no context means i32/i64; u32 only where a use names it
print(0xDEADBEEF)                      // -559038737
const k: u32 = 0xDEADBEEF; print(k)    // 3735928559

// (b) a top-bit radix literal with no context defaults to u32/u64
print(0xDEADBEEF)                      // 3735928559
```

**Ruled: (a), owner 2026-10-03.**

**Recommendation: (a).** It changes no existing program's output. (b) reverses the last row of
the 2026-09-04 hex ruling.

### U4. Mixed signed and unsigned operands?

```vl
// (a) an error, except literal operands and shift counts
u + i              // error: operator '+' is not defined for u32 and i32 — write `i as u32`
u + 1              // ok, u32
u << k             // ok for any integer k

// (b) promote to i64, as C# does (impossible at 64 bits)
u + i              // i64
U + I              // error anyway: u64 + i64 has no common type
```

**Ruled: (a), owner 2026-10-04.**

**Recommendation: (a).** It is Rust's, Go's and Zig's rule, and it already falls out of VL's
lattice.

### What the open questions build on: today's behaviour

U5 to U14 below are **awaiting ruling**. Each samples what a user would write under each option.
The block below is not an option: it was run on 2026-10-17 with `dist/vl run` (master
`15bd386db`), and each comment quotes what the line printed:

```vl
let b: i64 = 0x7FFFFFFFFFFFFFFF
print(b + 1)                       // -9223372036854775808   — i64 wraps
let q: i64 = -1
print(q >> 60)                     // -1                     — shr_s
print(q >>> 60)                    // 15                     — shr_u
print(divU(q, 3))                  // 6148914691236517205
print(q as% i32)                   // -1                     — low 32 bits
let big: i64 = 9007199254740993
print(big as f64)                  // 9007199254740992       — i64 → f64 rounds
print(big as? f64)                 // 9007199254740992       — and as? does not refuse it
function g(c: boolean, a: i32, x: i64) { if c { a } else { x } }
print(g(true, 1, 5) is i32)        // true                   — a mixed numeric join is a union
print(__trunc_sat_f64_u_i32__(3.0e9))   // -1294967296       — the u32 bits, typed i32
let i = 300
print(i as% u8)                    // 44
print(i as? u8)                    // null
type Rng = { state: u64 }          // unknown type 'u64' for field 'state'; did you mean 'i64'?
```

The Rust, Go and Zig rows in each recommendation come from section 1.5. "Consumers" names the
programs whose source today contains the idiom the question decides, from section 4's counts and
a read of `~/eardstap` and `~/diderven` on 2026-10-17. eardstap's `src/core/rng.vl` and
diderven's `src/rng.vl` both hash and xorshift over `i32` with `>>>`.

### U5. Does a join of a `u32` with a signed number make a union? — awaiting ruling

**Question.** When `if`/`match` arms, `??` or a list literal mix a runtime `u32`/`u64` with
a different number type, what is the result's type?

```vl
function pick(c: boolean, u: u32, i: i32) { if c { u } else { i } }

// (a) a union, as the numeric-join ruling does for i32 and f64 (and i32 and i64 today)
const r = pick(true, 7, 9)       // r: i32 | u32
print(r is u32)                  // true
const w: i64 = r                 // ok — every member widens to i64 exactly
const n: i32 = r                 // error: u32 does not convert to i32 exactly — write `as`

// (b) the widest exact type
const r = pick(true, 7, 9)       // r: i64
print(r is u32)                  // error: r is i64, not a union

// (c) refused, as Rust, Go and Zig refuse arms of different type
function pick(c: boolean, u: u32, i: i32) { if c { u } else { i } }
// error: the arms are u32 and i32 — write `i as u32` or annotate the result
```

**Recommended: (a).** It is the numeric-join ruling of 2026-09-30 with two more members, and
the probe above shows `i32` with `i64` already joins to a union today. (c) is the
Rust/Go/Zig answer (Zig's peer resolution does give `u32` with `i64` the type `i64`, and
refuses `u32` with `i32`), but the owner rejected "runtime values must agree" for VL because
it requires annotations. (b) makes `is u32` depend on which arm ran. The cost of (a) is two
new box tags (3.3), and a phase-1 build may refuse a mixed join loudly until phase 2.

**Consumers.** None today; no consumer names `u32`. plumb's generator would meet it first, if
it emits `u32` registers alongside `i64` (3.5, item 5). splitmix64 (EV-001) does not join.

### U6. What does overflow do in `u32`/`u64` arithmetic? — awaiting ruling

**Question.** What do `+`, `-`, `*` and `<<` on `u32`/`u64` produce when the true result
does not fit?

```vl
const u: u32 = 0
let x = u
// (a) wrap modulo 2^32 / 2^64, as i32 and i64 do today
print(x - 1)        // 4294967295
// (b) trap, as Swift does
print(x - 1)        // trap: unsigned overflow
// (c) trap in a debug build, wrap under -O, as Rust does
print(x - 1)        // trap without -O, 4294967295 with -O
```

**Recommended: (a), wrap.** The determinism rulings already make `i32`/`i64` wrap, and the
probe shows `i64` max + 1 wraps today. A `u32` that traps where `i32` wraps would make the
safer-looking type the slower one, and `add`/`sub`/`mul` are the same wasm instruction for
both. Go wraps. Rust wraps in release builds. Zig calls it illegal behaviour and spells wrap
`+%`; VL's `as%` is the nearest analogue, and VL has no `+%`. A checked form belongs in the
`std:math` checked helpers that the determinism ruling already filed, not in the operator.

**Consumers.** eardstap EV-001: splitmix64 is defined by wrapping `*` and `+` mod 2^64.
glean's RNG and hashes, sunpa's mulberry32 and noise hashes, and the `hash3`/xorshift in
eardstap and diderven all depend on wrapping multiplies; today they do it at `i32`.

### U7. Is unary minus allowed on an unsigned operand? — awaiting ruling

**Question.** Does `-u` with `u: u32` compile, and if so what does it mean?

```vl
let u: u32 = 5
// (a) refused, as Rust and Zig refuse it
print(-u)           // error: unary '-' is not defined for u32 — write `0 - u`, which wraps
// (b) allowed and wrapping, as Go does
print(-u)           // 4294967291
// (c) refused, with a wrapping negation as its own spelling, as Zig's `-%u` is
print(-u)           // error
print(-%u)          // 4294967291   (a new operator)
```

**Recommended: (a).** A negated unsigned value is nearly always a slip, and `0 - u` already
says "wrap" in one more token. (c) adds an operator for one use when `0 - u` does the same
thing. A negative literal is unaffected: `let u: u32 = -1` is already refused by U3's literal
rule (`constant -1 overflows u32`).

**Consumers.** None found. The idiom that would want it, `x & -x` (lowest set bit), does not
occur in any consumer listed in section 4, nor in eardstap or diderven.

### U8. How does `print` render a `u64`? — awaiting ruling

**Question.** `print(u32)` widens into the existing `__print_i64__`, but no host import renders
a value at or above 2^63. Which lowering prints a `u64`?

```vl
let m: u64 = 0xFFFFFFFFFFFFFFFF
print(m)            // every option prints 18446744073709551615; they differ in the lowering

// (a) a new host import:          __print_u64__(m)
//     the native host, the JS runtime and the playground each add it
// (b) an emitted helper over existing imports:
//     if (m as% i64) >= 0 { __print_i64__(m) } else { print divU(m, 10), then the last digit }
// (c) lowered through std:fmt:     print(toString(m))   — toString's domain gains u64 (U14)
// (d) refused until one of the above is built:
print(m)            // error: print of u64 is not built yet — print `m as% i64` or `"\{…}"`
```

**Recommended: (c).** It changes no host ABI and keeps one decimal renderer, and string
interpolation already depends on `std:fmt`. Rust, Go and Zig all format integers in their
library (`Display`, `fmt`, `std.fmt`); none asks the platform to. (b) needs two writes per
line, which the print stream is not verified to accept. (d) is acceptable only as a phase-1
stopgap, and it is a clause-2 refusal while it stands.

**Consumers.** eardstap, and any test that prints a hash or seed. glean's `le64` values would
print through it once they are `u64`. EV-001's slice can avoid it (section 6).

### U9. May a comparison mix signed and unsigned operands? — awaiting ruling

**Question.** Are `<`, `<=`, `>` and `>=` between a `u32` and an `i32` (or `u64` and `i64`)
refused like the other operators, or given exact meaning?

```vl
let u: u32 = 3000000000
let i: i32 = -1
// (a) U4's rule for every comparison, == included; a lint flags the always-true compares
print(u < i)        // error: '<' is not defined for u32 and i32 — write `i as u32` or `u as i32`
print(u == i)       // error, the same message
print(u < 10)       // false   (lt_u)
print(u >= 0)       // true, with warning: an unsigned value is always >= 0
// (b) mathematically exact, as Zig and C++20 `std::cmp_less` are
print(u < i)        // false   — compared as i64; at 64 bits, `i < 0 || i as% u64 > u`
print(u == i)       // false
// (c) relational compares refused, `==`/`!=` allowed on the bits, as AssemblyScript does
print(u < i)        // error
print(u == i)       // false here, but true when u is 4294967295 and i is -1
```

**Recommended: (a), with the lint.** It is U4 applied to one more family of operators,
including `==`. Rust and Go refuse every mixed compare, `==` too; Zig accepts them and answers
exactly, which is (b). (b) is defensible but makes comparisons the one exception to U4, and its
64-bit form costs a branch the user did not write. (c) is wasm's view (`eq` is sign-agnostic),
but it makes `==` the one operator that compares bits rather than values.

**Consumers.** plumb's hand-written parsers (15 `ltU`-family calls in `src/`) and its generated
carry compares (809 `ltU` in one unit), which stay on `i64` under U12. No consumer compares a
`u32` today.

### U10. Do the unsigned saturating truncations return `u32`/`u64`? — awaiting ruling

**Question.** `__trunc_sat_f64_u_i32__` and its three `_u` siblings return the unsigned
result as `i32`/`i64` bits. Should they be retyped to `u32`/`u64`?

```vl
let f = 3.0e9
// (a) unchanged — today it prints -1294967296
const a = __trunc_sat_f64_u_i32__(f)   // a: i32
const b = a as% u32                    // 3000000000
// (b) retyped
const a = __trunc_sat_f64_u_i32__(f)   // a: u32, prints 3000000000
// (c) unchanged, and the saturating u32 conversion is a std:math function
const a = truncSatU32(f)               // a: u32 (a new std export, through std-api-review)
```

**Recommended: (a).** It changes no signature, and `as% u32` recovers the unsigned reading
in one cast. (b) would turn any caller that mixes the result with an `i32` into a U4 error.
(c) is the Rust shape (`as` from a float saturates, since 1.45), but VL's `f64 as u32` is the
exact trio (2.8), and a saturating twin is a new std name with no consumer asking. Go leaves
an out-of-range float-to-int conversion implementation-defined, and Zig's `@intFromFloat` is
illegal behaviour out of range; neither has a saturating spelling in the operator.

**Consumers.** None. plumb is the only consumer that calls any `__trunc_sat_*__` intrinsic
(17 calls), and every one is a signed `_s` form.

### U11. May a `u8[]` element read deliver into `u32`/`u64` without a cast? — awaiting ruling

**Question.** A `u8[]` read is an `i32` in 0..255. Does it convert implicitly to `u32` and
`u64`, which `i32` does not (U2)?

```vl
const b: u8[] = [200, 1]
// (a) the read adapts to u32/u64 the way a literal does
let w: u32 = b[0]                       // ok
let x: u64 = (b[0] as u64) << 56        // the cast is still needed where nothing names u64
// (b) the read is i32, so it needs a cast that cannot fail
let w: u32 = b[0]                       // error: i32 does not convert to u32 — write `as u32`
let w: u32 = b[0] as u32                // ok
```

**Recommended: (a).** The value is in range by construction, which is what made `u8` storage
honest under the 2026-08-22 ruling, and the `as u32` in (b) would carry failure paths that
never run. Zig agrees: `u8` coerces to `u32` implicitly. Rust and Go need an explicit
conversion (`u32::from(b)`, `uint32(b)`), but they have no implicit widening at all, and
U2 already put VL on Zig's side.

**Consumers.** glean's byte readers (231 widen-then-mask sites, mostly the `le32`/`le64`
helpers), plumb's file parsers (`pdb.vl`, `dxbc.vl`, `avi.vl`, each with its own `u32`
function), and sunpa's PNG writer.

### U12. What happens to `divU`, `remU`, `ltU`/`leU`/`gtU`/`geU` and `>>>`? — awaiting ruling

**Question.** Once `u32`/`u64` exist, do the unsigned intrinsics stay as they are, go, or
change type?

```vl
let i: i32 = -1
let u: u32 = 7
// (a) kept for i32/i64; accepted on u32/u64 with an info-tier hint
print(divU(i, 3))   // 1431655765, as today
print(divU(u, 3))   // 2 — hint: on u32 this is `u / 3`
// (b) deprecated
print(divU(i, 3))   // warning: deprecated — write `(i as% u32) / 3`
// (c) retyped over the unsigned types
print(divU(i, 3))   // error: divU takes u32 — every current call breaks
```

**Recommended: (a).** They are the right tool for a word that carries both readings, which is
plumb's register model. They are compiler intrinsics, not std exports, but VL has no
deprecation story for either, and (c) breaks every caller. Rust, Go and Zig have no such
intrinsics: they cast to the unsigned type at each use, which is the `as% u32` spelling (b)
would force on every plumb unit. `>>>` stays an operator; on `u32` it is the same
instruction as `>>`.

**Consumers.** plumb: its generator emits `ltU`/`leU`/`divU`/`remU` into every unit (809 `ltU`
in one), and `src/` calls them 23 times. glean, sunpa, eardstap and diderven use `>>>` only.

### U13. Do `u16`, `i8` and `i16` become value types? — awaiting ruling

**Question.** Should the narrow widths, which exist today only as `flat` field widths, become
value types beside `u32`/`u64`?

```vl
// (a) out of scope: still flat-field widths only
flat type H = { kind: u16 }    // ok, as today
let x: u16 = 5                 // error, as today
// (b) value types that mask after every operation, as Rust, Go and Zig do
let x: u16 = 60000
print(x + 10000)               // 4464 — an extra `& 0xFFFF` after each operator
// (c) value types on an i32 rep with no masking
let x: u16 = 60000
print(x + 10000)               // 70000 — a u16 holding a value outside 0..65535
```

**Recommended: (a).** (c) is the value type that lies about its range, which the 2026-08-22
ruling refused. (b) is honest and is what Rust, Go and Zig do, but it adds a mask or sign
extension after every arithmetic operator and a third set of opcode choices, and no
consumer has asked for it. Packed `u16[]`/`i16[]` arrays (WasmGC `i16` storage) are honest the
way `u8[]` is, and are a separate storage-only proposal.

**Consumers.** plumb reads 16-bit quantities through `__load_u16__` or `loadU16` in 15 `src/`
files (`inflate.vl`, `crc.vl` and `render.vl` among them), and glean in 5 (`src/mpq.vl` among them). All of them
work at `i32` today, and neither declares a `u16`/`i16` `flat` field.

### U14. Which std additions follow, through std-api-review? — awaiting ruling

**Question.** Which new std exports, if any, ship with the type?

```vl
let u: u32 = 7
// (a) std:fmt and std:bytes together, each through std-api-review
import { u32le, u64le } from "std:bytes"     // new
import { parseU32, parseU64 } from "std:fmt" // new
print("\{u}")                                // toString's domain gains u32 | u64
// (b) only toString's domain, which interpolation and U8 (c) need; the rest waits for an ask
print("\{u}")                                // ok
import { u32le } from "std:bytes"            // error: no export u32le
// (c) leave std untouched until a consumer files an ask
const w = (b.i32le(0) as i64) & 0xFFFFFFFF   // the glean idiom stays the spelling
print("\{u}")                                // error: toString takes i32 | i64 | boolean | f64
```

**Recommended: (a).** Interpolation of a `u32` needs `std:fmt`, and the `std:bytes` helper is
the one glean wrote 231 times, whose absence `std:bytes`' header currently states as a rule.
Rust, Go and Zig all ship unsigned parse, format and byte-order reads in their standard
libraries. `std:buffer`'s `loadU32`/`loadU64` are the reviewer's call, because `loadU16`
already returns an `i32`. (b) is the narrowest order consistent with U8 = (c), if the owner
wants std to wait for asks.

**Consumers.** glean (`le32`/`le64`), plumb's five `u32` helpers, sunpa's `unsigned(x): f64`,
and every consumer that interpolates a `u32`.

---

## 6. Minimum slice for EV-001

eardstap's EV-001 is `type Rng = { state: u64 }` refused as an unknown type, for splitmix64.
The goal of this slice is that program, and nothing broader.

**Today's workaround runs.** splitmix64 needs only wrapping `+`, `*`, `^` and a logical right
shift, and `i64` with `>>>` has all four. This program, run the same way, prints the
reference sequence for seed 0 as signed bits (`0xE220A8397B1DCDAF`, `0x6E789E6AA1B965F4`):

```vl
type Rng = { state: i64 }
function next(r: Rng): i64 {
  r.state = r.state + 0x9E3779B97F4A7C15
  let z = r.state
  z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9
  z = (z ^ (z >>> 27)) * 0x94D049BB133111EB
  z ^ (z >>> 31)
}
const r: Rng = { state: 0 }
print(next(r))                                   // -2152535657050944081
print(next(r))                                   // 7960286522194355700
const v = next(r)
print((v >>> 11) as f64 / 9007199254740992.0)    // 0.026433771592597743
print(v as% i32)                                 // -2146876081
```

So the bits are already right. What `u64` adds is the spelling eardstap tried, `>>` instead of
`>>>`, and a type that cannot meet a signed `/` or `<` by accident.

**The target program.**

```vl
type Rng = { state: u64 }
function next(r: Rng): u64 {
  r.state = r.state + 0x9E3779B97F4A7C15
  let z = r.state
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
  z = (z ^ (z >> 27)) * 0x94D049BB133111EB
  z ^ (z >> 31)
}
function unit(r: Rng): f64 { (next(r) >> 11) as f64 / 9007199254740992.0 }
function small(r: Rng): i32 { next(r) as% i32 }
```

**Rulings it needs.** U1 to U4 are ruled and cover it: the type (U1), `as`/`as%` to `f64`
and `i32` (U2), the literal `0x9E3779B97F4A7C15` taking its bit pattern at `u64` (U3; as a
`u64` it is 11400714819323198485, the same bits as today's -7046029254386353131), and the
literal operands of `*` and the shift counts (U4's two exceptions).

**Open questions it depends on.**

* **U6 (overflow) is required.** splitmix64 is defined by wrapping `+` and `*`.
* **U8 (print) only if the program prints a `u64`.** The target program prints through `f64` or
  `i32`, so a phase-1 build can refuse `print(u64)` loudly and still unblock EV-001. If U8 is
  (c), printing also needs U14's `toString` domain.
* **Not needed:** U5 (the program joins nothing), U7 (no negation), U9 (no comparison), U10,
  U11, U12, U13. U14 only through U8.

**One fact the slice relies on that no question settles.** `u64 as f64` rounds (2.8), as
`i64 as f64` does today; the probe above shows `as?` does not refuse a rounding `i64 → f64`
either. The `>> 11` keeps the value below 2^53, so the slice is exact whichever way that is
later decided.

**Build steps, smallest first.** Each is phase 1 of section 3.4, cut to `u64` scalars:

1. Admit `u64` as a `PrimName` in local, parameter, return and struct-field position, with the
   rep normaliser of 3.1 mapping it to `i64`. A `u64` in a union, list, map value or
   generic argument is a loud capability refusal until phase 2, never a fall-through.
2. Literal adaptation at a `u64` destination: a decimal fits in 0..2^64−1; a radix literal is
   its 64-bit pattern.
3. Operators. `+ - * & | ^ <<` reuse the `i64` instructions. `>>` emits `i64.shr_u`. `/`, `%`
   and the four compares emit the `_u` instructions, or refuse loudly. Leaving them on the
   signed default would be valid wasm with a wrong value (3.5, risk 1).
4. U4's mixed-operand refusal, with the literal and shift-count exceptions.
5. `as% i32` (`i32.wrap_i64`), `as f64` (`f64.convert_i64_u`) and `as` to and from `i64`
   (the exact trio: a `u64` value at or above 2^63 fails `as i64`).
6. `print(u64)`: built per U8, or refused loudly.
7. Fixtures in both faces (annotated, and `let z = r.state` inferred), each printing a value
   only the unsigned instruction produces, such as `0xFFFFFFFFFFFFFFFF >> 60` → 15, plus a
   `scripts/capability-matrix.vl` template for `u64` and its un-annotated twin.

`u32` follows the same steps with the `i32` instructions, plus the three U2 edges. It is not
needed for EV-001.

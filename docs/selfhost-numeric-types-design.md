# Self-host numeric-type support (i64, f32, and fixing broken f64) — measured design

Status: design + feasibility analysis. No emit code changed (the first full slice is
**not** provably gate-safe in one PR — see "Crux verdict" and "Why no prototype was
landed"). Branch: `selfhost-numeric-types-design` off `origin/master`.

This document measures, against the actual source, exactly what full numeric-type
support costs in the self-hosted compiler, and proposes a sliced rollout. Every count
and claim below was grepped/read out of the tree, not estimated.

---

## 1. Current state (verified)

### 1.1 Checker (`compiler/typecheck.vl`) — has i32 + f64, no i64/f32
- Primitives registered: `TY_I32 = mkPrim("i32")`, `TY_F64 = mkPrim("f64")`,
  `TY_BOOL = mkPrim("bool")` (typecheck.vl:274–276). No `TY_I64`, no `TY_F32`.
- `isNumeric` accepts `primName == "i32" || primName == "f64"` (typecheck.vl:461–473).
- `typeRef` resolves `"i32"→TY_I32`, `"f64"→TY_F64`, `"bool"/"boolean"→TY_BOOL`,
  `"string"→TY_STR` (typecheck.vl:584–593). `"i64"` / `"f32"` fall through to the
  "unknown type" error.
- Literal default rule (typecheck.vl:1652–1658): **a `NumLit` whose lexeme contains a
  `.` is typed `TY_F64`, otherwise `TY_I32`.** This is the source of the silent hole
  (the checker types `3.14` as f64 and lets it through; the emitter then mishandles it).

### 1.2 Emitter (`compiler/wasmEmit.vl`) — i32-ONLY, by construction
- The only literal/number parser is `parseI32` (wasmEmit.vl:1066–1134): it folds
  base-10/hex/bin/oct digit runs into an i32 and **ignores any `.`** — it does not
  parse floats and has no notion of fractional digits.
- `NumLit` emit (wasmEmit.vl:4383–4385) is unconditionally
  `fbI32Const(parseI32(e.numText))`. There is **no f64/f32/i64 literal path at all.**
- `checkExprI32` (wasmEmit.vl:1816–1836) explicitly **rejects** a `let`/`const`
  initializer whose `NumLit.numText` contains a `.` ("only i32 locals are supported"),
  so f64 *locals* fail loudly — but top-level `print(3.14)` bypasses that guard and hits
  the silent `parseI32` path.
- Arithmetic/comparison opcodes come from `binOpcode` (wasmEmit.vl:2494–2509),
  returning a hardcoded **i32** opcode byte (`0x6a` add … `0x4e` ge_s), emitted via
  `fbI32Bin` (wasmEmit.vl:323). There is no per-type opcode selection.
- All arrays share **one** WasmGC array heap type with **i32** storage type
  (wasmEmit.vl:1380, field storagetype `0x7f` at e.g. wasmEmit.vl:2599). An f64/i64
  array element needs a *new* heap type.
- The self-host module imports **only four** print functions —
  `__print_i32__`, `__print_bool__`, `__print_char__`, `__print_str_flush__`
  (wasmEmit.vl:7658–7664, 7994–8006). It does **not** import `__print_i64__`,
  `__print_f32__`, `__print_f64__`. (The *host* harness `compiler/compile.ts:810–814`
  provides all of them, which is why the host build can print floats.)

### 1.3 Live miscompile evidence (reproduced via the native tool)
Built `scripts/vl-host` (cargo, release) + seeded `build/vl-compiler.wasm`
(`deno run -A scripts/build-compiler-wasm.ts`), then
`vl run <f> --compiler build/vl-compiler.wasm`:

| Program            | Output | Expected | Cause |
|--------------------|--------|----------|-------|
| `print(2.5)`       | `185`  | `2.5`    | `parseI32("2.5")` = 2,·,5 → `2*10+('.'-'0')=18`, `18*10+5=185`; routed to `__print_i32__` |
| `print(3.14)`      | `2814` | `3.14`   | same digit-fold over `.`: 3 → 28 → 281 → 2814 |
| `print(2)`/`print(3)` (i32 control) | `2`/`3` | — | i32 path correct |
| `let x: i64 = 5`   | type error `unknown type 'i64'` | — | honest reject (checker) |
| `let x: f32 = 2.5` | type error `unknown type 'f32'` | — | honest reject (checker) |

So: **f64 is a silent-miscompile correctness hole; i64/f32 are honestly rejected.**

---

## 2. The host's numeric model + constant encoding (reference; `.ts`)

The TS host never hand-encodes IEEE-754 — **binaryen does**:
- Lexer (`compiler/lexer.ts:364–474`) emits a `NUMBER` token whose `text` is the
  normalized decimal string (separators stripped, non-decimal bases folded via
  `BigInt`). Floats keep their `.`; the fractional form is carried as text.
- Parser (`compiler/parser.ts:686–692`) does `parseFloat(text)` → a JS `number`;
  `Number.isInteger(value) && !text.includes(".")` ⇒ `IntegerLiteral{value,text}`,
  else `RealLiteral{value}`.
- Codegen (`compiler/toWasm.ts`):
  - integer literal → `m[type].const(node.value)`, **except i64**, which is
    `m.i64.const(BigInt(node.text))` (toWasm.ts:3415–3416);
  - real literal → `m[type].const(node.value)` with `type ∈ {f32,f64}`
    (toWasm.ts:3571–3580).
  In every case **binaryen** turns the JS number / BigInt into the wasm constant bytes
  (8-byte LE IEEE-754 for f64, 4-byte for f32, SLEB128 for i64). The host has a JS
  `number` and `BigInt` runtime; it never computes a bit pattern itself.

**This is exactly what the self-host *lacks*:** no binaryen, no JS `number`/`BigInt` —
the self-host emitter is a hand-rolled byte writer in i32-only VL.

---

## 3. THE CRUX — self-host constant-encoding feasibility

The question is whether the **self-hosted** emitter can produce the wasm constant bytes
for `f64.const` / `f32.const` / `i64.const` using only the i32 arithmetic VL gives it.

### 3.1 Does VL expose the primitives a float emitter would need? — NO
Grepped the whole VL surface (`compiler/*.vl`, `compiler/builtins`): there is **no**
`reinterpret`, `fromBits`/`toBits`, `bitcast`, or float-parse primitive anywhere. VL
the language, as the self-host compiler uses it, has **no way to take a `2.5` and ask
the runtime for its IEEE-754 bits** — there is no f64 value to reinterpret in the first
place, because the self-host emitter **rejects f64 in its own source** (`checkExprI32`).
So the compiler cannot "compute `2.5` then read its bytes". It must synthesize the
bytes arithmetically from the decimal **string**.

### 3.2 Can the bytes be synthesized from the literal text in pure i32? — YES, but it is
a real IEEE-754 routine, not a one-liner.

- **i64.const (SLEB128 of a 64-bit value).** A 64-bit literal cannot live in one i32.
  It must be carried as a **hi/lo i32 pair** (or computed digit-by-digit into one).
  SLEB128 over 64 bits then needs 64-bit shifts/masks synthesized from the pair. The
  existing `slebToArr`/`wSLEB` (wasmEmit.vl:132–185) are **i32-only** (`v >> 7` on an
  i32) — a `sleb64FromHiLo` must be written. This is **bounded and mechanical**
  (no rounding, no normalization): roughly a `parse decimal → hi/lo` accumulator plus a
  64-bit SLEB loop. **Feasible as a contained slice.**

- **f32.const / f64.const (IEEE-754).** This is the hard one. Decimal→binary float is:
  parse integer and fractional digit runs, build a significand, find the binary
  exponent, **round to nearest-even** at 24 (f32) / 53 (f64) bits, then pack
  sign|exp|mantissa. The 53-bit significand **exceeds i32's 31-bit signed range**, so
  the significand and the fractional long-division both need **hi/lo pair (bignum-lite)
  arithmetic** — the same pair machinery i64 needs, plus rounding logic. There is **no
  existing 64-bit helper** in the emitter (it masks every byte to the low 8 bits and
  works strictly in i32; wasmEmit.vl:28). This is on the order of **200–400 lines of
  new pure-integer code** and must be **byte-exact** vs binaryen's encoding for the
  fixpoint goldens to ever match. **Feasible but substantial, and high-risk to get
  bit-identical.**

### 3.3 Crux verdict
- **f64/f32 constant emit is feasible WITHOUT bootstrapping floats into the compiler**
  — it does *not* require VL to gain an f64 runtime first; a pure-i32 decimal→IEEE-754
  packer (hi/lo significand + round-to-nearest-even) can produce the exact bytes. **But
  it is a from-scratch IEEE-754 implementation, not a small slice**, and getting it
  bit-identical to binaryen (required by the byte-identical golden gate) is the dominant
  risk.
- **i64 constant emit is the genuinely tractable first numeric step**: carry the literal
  as a hi/lo pair, write a 64-bit SLEB encoder. No rounding, no normalization.
- The **hi/lo-pair primitive is shared** by i64 SLEB and by the f32/f64 significand —
  so building i64 first also builds half the float machinery. This drives the ordering
  in §5.

---

## 4. Measured touch-point inventory

Counts are from grep over `compiler/wasmEmit.vl` and `compiler/typecheck.vl` on this
branch.

### 4.1 Checker (`typecheck.vl`) — small, additive
- 2 new primitive registrations (`TY_I64 = mkPrim("i64")`, `TY_F32 = mkPrim("f32")`)
  alongside the existing 3 (typecheck.vl:274–276).
- `isNumeric`: extend the `primName ==` disjunction (typecheck.vl:473) from 2 names to 4.
- `typeRef`: 2 new `name ==` arms (typecheck.vl:584–593).
- Literal default rule (typecheck.vl:1652–1658): today binary (`.`→f64 else i32). Real
  numeric inference (i32 vs i64 by magnitude; f32 only by annotation) is a follow-up;
  the simple rule can stay for the first slices.
- Conversions/assignability between numeric widths (i32→i64, i32→f64, f32→f64, …) —
  the host models this (toWasm.ts:5795–5822); the self-host checker currently has no
  widening matrix. Net-new but bounded.

### 4.2 Emitter (`wasmEmit.vl`) — where the i32 valtype `0x7f` is hardcoded and must
become per-type. These are the **threading machinery** that must be built **once**:

| Touch point | Sites | Notes |
|---|---|---|
| Raw valtype-byte emission `wU8(127)` / `push(127)` | **20** | local/param/global/result/blocktype/struct-field storagetype — each must select `0x7c` f64 / `0x7e` i64 / `0x7d` f32 where the type is non-i32 |
| `fbValtype` callers (the declared-local / functype valtype switch) | **21** | the central `kind`-code dispatch (wasmEmit.vl:7164); needs new kind codes for the scalar non-i32 types |
| `pushVT` callers (param/result valtype push) | **18** | same dispatch on the signature side |
| Type→kind classifier functions (`vtKindOf*`, `ret*Flag`, `param*`, `tyAnn*`, `globalKind`) | **33** | these map a type-annotation node to a `kind` code; new arms needed so f64/i64/f32 annotations classify as their own scalar kinds rather than falling through to i32 (kind 0) |
| Literal emission (`fbI32Const(parseI32(...))`) | NumLit at wasmEmit.vl:4383 | the one literal site; must branch on the literal's type to `f64.const`/`f32.const`/`i64.const` |
| Arithmetic/comparison opcode selection (`binOpcode`→`fbI32Bin`) | wasmEmit.vl:2494–2509, 4645–4652 | hardcoded i32 opcodes; need i64 (`0x7c…`/`0x51`…), f64 (`0xa0…`/`0x61`…), f32 (`0x92…`) opcode sets chosen by operand type |
| Conversions at boundaries (widen i32→i64/f64, f32→f64) | none today | net-new; mirror toWasm.ts:5816–5822 |
| `print` routing | wasmEmit.vl:4797–4845 | today only `__print_i32__`(0)/`__print_bool__`(1); must import + route `__print_i64__`/`__print_f32__`/`__print_f64__` (host already provides them) and pick the import by the printed expression's type |
| Array element heap type (f64[]/i64[] backing) | array sites ~121 refs incl. wasmEmit.vl:1380 storagetype | one shared i32 array heap type today; f64/i64 element arrays need new heap types + per-type `array.new_fixed`/`array.get` |

**Headline count:** ~**59** structural valtype/classifier sites (20 + 21 + 18, with the
33 classifier functions feeding them) plus the literal site, the `binOpcode` set, the
print router, and the array-heap-type layer. The single biggest lever is that **all of
20 + 21 + 18 + 33 ride the same `kind`-code → valtype dispatch** (`fbValtype` /
`pushVT` / `vtKindOf*`): adding the scalar non-i32 kinds there is the "build it once"
work that every later slice reuses.

---

## 5. Sliced rollout (ordered by value/risk)

Each slice is a self-contained ~≤500-line PR with its own gates. Order chosen so the
shared **non-i32 scalar valtype threading** is built once, on the *lowest-risk* type
first, before the high-risk IEEE-754 packer.

### Slice 0 (recommended FIRST — correctness, tiny): close the f64 silent hole honestly
Make the checker **reject** f64 (and keep rejecting i64/f32) until emit is ready, so
`print(3.14)` errors instead of printing `185`. Two honest options — present both,
recommend (a):
- **(a) Reject f64 in the checker** — drop/guard `TY_F64` registration or make
  `typeRef("f64")` an error, and change the literal rule so a `.` literal is a checker
  error ("f64 not yet supported"). ~10–20 lines. **This is the only change that closes
  the live correctness hole immediately** and is trivially gate-safe (no emit bytes move
  — golden programs are all i32). Cost: temporarily removes a checker capability that no
  correct emit currently backs.
- **(b) Leave the checker, fix emit** — i.e. do Slice 3 instead. Larger, riskier.

Recommendation: **land (a) first** unless Slice 3 is being landed in the same cycle.
A silent miscompile is strictly worse than an honest reject.

### Slice 1: scalar valtype threading + **i64** literal/print (net-new, tractable)
Build the shared machinery on the easy type:
- new kind codes in `fbValtype`/`pushVT`/`vtKindOf*` for scalar i64;
- `i64.const` via a new `sleb64` over a hi/lo pair parsed from the literal;
- import + route `__print_i64__`;
- checker: register `TY_I64`, `typeRef("i64")`, `isNumeric`, literal magnitude rule.
Scope to literal + local/param + print first (no i64[] arrays, no mixed-width arith).
Value: turns an honest reject into working support; exercises the valtype threading on a
type where constant encoding has **no rounding**.

### Slice 2: i64 arithmetic + comparison
Per-operand-type opcode selection in `binOpcode`/the BinExpr path (i64 `0x7c…`/`0x51…`).
Reuses Slice 1's hi/lo + valtype work.

### Slice 3: **fix f64** end-to-end (literal + arith + local/param + print)
The high-risk slice. Implements the pure-i32 decimal→IEEE-754 packer (round-to-nearest-
even, hi/lo significand), reusing Slice 1's hi/lo pair. Imports/routes `__print_f64__`.
Once green, **flips Slice 0's reject back to acceptance** and promotes the f64 corpus.
Recommend this AFTER i64 because i64 builds and proves the hi/lo-pair machinery this
slice depends on, on a type without the rounding risk.

### Slice 4: f64/i64 **array elements** (new backing heap types)
The ~121 array sites + the single shared i32 array heap type (wasmEmit.vl:1380) become
per-element-type. Enables `arrays/f64-elems.vl`.

### Slice 5: f32
Smallest *new* type once f64 exists — 4-byte IEEE-754 with a 24-bit significand (fits
the same hi/lo machinery, narrower). Checker `TY_F32`/`typeRef`/widening f32→f64.

### Slice 6: map/filter over f64[]/i64[]; mixed-width numeric inference
Monomorphized per element type (`map-filter-f64.vl`), plus the real literal-magnitude /
widening inference the host has (toWasm.ts:5795–5822).

**Why this order:** Slice 0 stops the bleeding now at ~zero risk. Slices 1–2 do the
shared valtype/opcode threading on i64, where constant encoding is exact and bounded.
Slice 3 then tackles the one genuinely hard problem (IEEE-754 byte-exactness) with the
hi/lo machinery already in hand and proven. Floats-in-arrays and inference come last.

---

## 6. Per-slice gate-risk assessment

Gates (all must stay green; never regenerate goldens):
1. `selfhost_emit_fixpoint_test.ts` — goldens **byte-identical** (run FIRST).
2. `SELFHOST_FULL_FIXPOINT=1` full-fixpoint + self-typecheck.
3. native fixpoint (`scripts/native-fixpoint.sh` after cargo build + seed).
4. `selfhost_corpus_run_test.ts` + `SELFHOST_NATIVE_ALIGN=1 selfhost_native_align_test.ts`.
5. `deno task test` + `deno lint`.

| Slice | Golden byte-risk | Fixpoint risk | i32-path-shift risk |
|---|---|---|---|
| 0 (reject f64) | **none** — emit bytes unchanged; only checker diagnostics change | none | none (golden programs are i32) |
| 1 (i64 thread+lit+print) | **low** if new kind codes are only taken by i64 annotations; the existing classifiers must keep returning the *same* kind for every i32/ref/struct program so the 14 goldens don't move. The risk is an accidental reclassification of an i32 site. | low (compiler itself is i32; if no i64 enters the compiler's own source, full-fixpoint bytes are unchanged) | **the central risk** — every `fbValtype`/`pushVT` edit must be additive |
| 2 (i64 arith) | low (opcode selection only fires on i64 operands) | low | low |
| 3 (fix f64) | **highest** — the IEEE-754 packer must be bit-identical to binaryen or the f64 goldens never match; also must not disturb i32 literal bytes | medium | medium (literal-emit branch must leave the i32 case byte-identical) |
| 4 (f64/i64 arrays) | medium — new heap types must be emitted *after* existing ones so existing type indices don't shift | medium | medium |
| 5 (f32) | medium (reuses f64 packer) | low | low |
| 6 (map/filter, inference) | medium | medium | medium |

The invariant that makes 1–6 safe is the same in every row: **the self-host compiler's
own source stays i32-only**, so as long as the new valtype/opcode/literal branches are
*only* reachable for non-i32 user types, the full-fixpoint output (the compiler
compiling itself) is byte-unchanged, and the 14 i32/ref/struct goldens don't move.

---

## 7. Why no prototype was landed in this pass

The strongest candidate first slice (fix f64 end-to-end) is **not** provably gate-safe
in a single ~500-line PR: it requires a from-scratch, byte-exact pure-i32 IEEE-754
encoder (§3.2/§3.3) whose output must match binaryen's `f64.const` bit-for-bit for the
byte-identical golden gate. That is genuinely ~200–400 lines of rounding-correct
hi/lo-pair code — too large and too high-risk for one safe slice, and the dominant
failure mode (one ULP off ⇒ golden mismatch) is exactly what the gates forbid.

The provably-safe move available now is **Slice 0** (make the checker honestly reject
f64, closing the silent-miscompile hole). It changes no emitted bytes for any existing
golden (all i32) and only changes checker diagnostics. Per the task's explicit
instruction this is presented as an **option to choose**, not something to apply
unilaterally — see §5 Slice 0(a). If the maintainers want the hole closed immediately
ahead of the larger f64 emit work, Slice 0(a) is the recommended, low-risk landing; if
f64 emit (Slice 3) is being scheduled in the same cycle, skip Slice 0 and go straight to
the i64-first ladder (Slices 1→2→3) so the reject never has to be flipped twice.

A thorough design with no implementation is, per the task framing, the correct outcome
here: the first full numeric slice is not single-PR gate-safe, and that is stated with
the evidence above.

---

## 8. Merge sequencing / in-flight overlap
No in-flight numeric work was found on `origin/master` (HEAD `7c4c012`, union-param
interning). The shared `fbValtype`/`pushVT`/`vtKindOf*` dispatch (§4.2) is the only
high-traffic area; any concurrent emitter PR touching local/param/global valtypes would
conflict and should be sequenced before/after Slice 1.

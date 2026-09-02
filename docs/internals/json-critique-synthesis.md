# `std:json` v1 — critique synthesis, and the decisions that are the owner's

> 2026-09-01. Inputs: `docs/json-design.md` (PROPOSED, #2300) and the three critiques —
> `json-critique-std.md` (REVISE; 11 findings), `json-critique-crosslang.md` (31 of 36
> table cells right; 10 findings), `json-critique-usability.md` (four consumer programs
> run on the seed; 8 findings). Every compiler claim below was re-run by the tooling
> session against the 2026-09-01 seed before it was relied on, and four of the claims
> grew into inventory rows while being verified (D1024–D1026 filed; D1021 re-ablated).
>
> Three kinds of item here. **§1** is what all three agreed on or what costs nothing —
> taken, and already written into `docs/json-design.md`. **§2** is what the owner has to
> rule, with a recommendation each. **§3** is the compiler's side of the design, re-sequenced
> by what the critiques measured. The builder waits on §2 and on D1021.

---

## 1. Taken — unanimous, or a measurement settled it

Each entry names the finding(s) behind it and the section of `docs/json-design.md` it
changed.

1. **`JsonError` gains `path: string`** (std #1; crosslang F10 for the render side;
   usability's P3 uses it). `at` stays the byte offset into the INPUT on parse; on render
   `at` is `0` and `path` — an RFC 6901 JSON Pointer, `/users/3/score`, `""` at the root —
   locates the value. Measured: `{ at, kind, msg }` is structurally identical to
   `Base64Error`, and a union naming both fails to emit; the fourth field is what keeps
   them distinct, which is exactly `Utf8Error.byte`'s warrant. → §1, §2.2.

2. **`1e999` is refused at PARSE, `kind: "nonfinite"`** (std #3; crosslang F1, F6). The
   proposal parsed it to `Infinity` and then refused to render it — a document accepted
   into a tree the module cannot write back, which none of JS/Python/Go/serde does. Reusing
   `nonfinite` (not `syntax` — the lexeme is grammatical — and not a new kind) buys the
   invariant the header states in one sentence: **every tree `parseJson` returns,
   `toJson` renders.** Underflow (`1e-999` → `0`) stays silent, as in all four. I-JSON
   §2.2's own example of what a message SHOULD NOT contain is `1E400` (verified against
   RFC 7493 text). → §2.5, §2.9.

3. **`-0.0` renders as `-0`** (crosslang F7). `toString(-0.0)` is `0` **(RUN)**, so the
   renderer special-cases it (`x == 0.0 && 1.0 / x < 0.0`); Go, serde and Python all keep
   the sign, JS alone loses it. One branch, moves VL from 1-of-4 to 4-of-4, and removes an
   exception from the round-trip list. → §2.5.

4. **Trailing content, empty input, BOM** (crosslang F8, E5). Trailing whitespace is
   accepted; any other trailing byte is `syntax` at that byte's offset. Empty or
   whitespace-only input is `syntax` at `self.length` with `msg` "unexpected end of
   input" (Go's and serde's most common real failure, distinguishable from "unexpected
   byte"). A leading U+FEFF is `syntax` at `0` with a message that names the BOM. → §2.9.

5. **The profile is I-JSON (RFC 7493), and the header says so** (crosslang F9). "Exactly
   RFC 8259 and nothing more" was wrong — the parser accepts LESS (duplicates and lone
   surrogates refused), and RFC 8259 §4 itself lists "report an error" among the duplicate
   behaviours, so ruling A is anticipated by the RFC rather than a departure from it. The
   resulting profile — UTF-8, unique names, no surrogates, numbers within double — is
   I-JSON §2.1–2.3 almost verbatim (verified). One tension recorded, not resolved: I-JSON
   §2.2 RECOMMENDS encoding numbers beyond double precision as strings; serde ruling B
   puts `i64` on the wire as a JSON number. Ruling B does not rest on I-JSON and stands;
   the header cites both. → §2.9.

6. **The cycle scan uses `===`, never `==`** (crosslang F4; usability F8). `==` over refs
   is structural and diverges on a cycle. `===` does not parse today (`expected an
   expression but found EQUAL`), which makes it a build item (§3.7), and it means a
   CONSUMER cannot write a cycle-safe walker at all — the header says beside the cap that
   the cap protects `parseJson`/`toJson` and nothing the consumer writes, and that a
   PARSED tree cannot contain a cycle (the exposure is program-built trees). → §2.7.

7. **Depth cap stays 128, and the justification is now a measurement.** Crosslang F3
   asked for ~1,000 (strictest of the four by 78×, on an AST argument that does not
   apply); std #10 accepted 128 and asked for fmt's form (a named const, the DoS argument,
   the citation, "can be raised, never lowered"). Measured on the host, 2026-09-01: a
   two-line self-call survives **30,000** frames and traps at 40,000; a PARSER-SHAPED frame
   (eight scalar locals, a string, a list and a map per frame) survives **2,000** and traps
   at 3,000. A recursive-descent parser spends two frames per nesting level, so 1,000
   levels is 2,000–3,000 parser frames — the trap edge, with nothing left for the caller's
   own stack. 128 is ~8× inside it. Recorded as a stack-budget measurement to re-take with
   the real frame; the number moves once, upward, in the header if it moves. → §2.7.

8. **`toJsonPretty` is named in WHAT IS NOT HERE, not in the surface block, and its
   parameter is not fixed** (std #11 — fix the NAME so `toJson(v, pretty)` stays refused,
   leave the parameters to the consumer). Recorded beside it: all four languages take a
   STRING indent (crosslang F5c), so `indent: i32` is refused as the shape — it forecloses
   tabs in a std with no deprecation story — and `indent = ""` / the item separator
   (`","`, never `", "`) are the two things the consumer's ruling must define. `jsonKind`
   moves the same way and takes an exported `JsonKind` alias (`pathKind`/`FileKind`
   precedent). → §1, §2.6.

9. **Header obligations the critiques enumerated**, all accepted and listed in §2.10 of the
   design doc so the builder and the `std-api-reviewer` pass have one checklist: the
   large-integer witness and the `parseI64` pointer in fmt's form (std #8, crosslang F2);
   the ±(2⁵³−1) bound, not ±2⁵³ (crosslang F2); the VL↔VL round-trip hole and stage 3 as
   its answer (crosslang F2); the round-trip exception list in ONE paragraph, now two
   entries (large integers, `-0` is gone, `1e999` is gone) (std #8); which kinds each
   function produces (std #9); `parseJson` is the canonical tree entry and `fromJson<Json>`
   is the same function through the typed door (std #5); the `string`-not-`u8[]` paragraph
   rebuilt on `readTextFile` with the word "overload" dropped (std #7); fmt's admission
   sentence for `parseI64`/`parseI32` names `std:json` as its consumer, so the header says
   the STAGE 3 decoder is that consumer (std #11); the `toString`-domain note (std #4); the
   JS lax-in/strict-out escaping correction and Go's unconditional U+2028/2029 escaping
   (crosslang F5a–b); the invariant "the renderer never emits text it would not accept".

10. **No `jsonEquals`.** Usability F2 asked the module to ship one because the obvious
    wrong repair of `deepEquals` (`a != null && b != null`) checks, runs and is silently
    wrong. The reason a consumer writes `deepEquals` at all is that `==` over `Json` is an
    emit refusal (`\`==\` over a struct union is not supported yet` **(RUN)**), and VL's
    `==` over refs is already structural — so `jsonEquals` would be a std name that
    duplicates an operator the moment the operator's gap closes. The gap is §3.6; the
    wrong-repair footgun is the strongest argument for sequencing D1009 early and is
    recorded there.

11. **D1021 takes route (1), flatten** — decided by the tooling session with vl-de, not
    by a critique: the non-recursive alias is already flattened into its composition, a
    double box would be a type-does-not-carry-rep cliff (the `litunion` shape), and the
    re-tag price of `recordUnMemTys` falls only on unions that fail today. Flagged here
    because it is a language-shaped decision made without the owner; the row records it.

---

## 2. The owner's decisions

Each with the votes, the measurement, and a recommendation. **Bold** is the recommendation.

### 2.1 Helpers — none, per-step `jsonGet`/`jsonAt`, or one `jsonPointer`

Votes: std ACCEPT the decline "on stronger grounds" (`get` is already a checker-claimed map
builtin; `Json | null` has no spelling for "missing"); crosslang ACCEPT *conditional on the
narrowing gaps closing*, and reserve **`pointer()` (RFC 6901)** as the name if helpers ever
land; usability **OVERTURN** — ship `jsonGet`/`jsonAt` in v1.

What was measured. The decline's ground 2 ("the idiom's cost is a compiler gap D1009/D1010
will close") is **false as stated**: the `&&` chain it predicts is blocked by a THIRD gap,
a map subscript minting no narrowing key — filed as **D1025** (loud at a string key, and
**check-clean invalid wasm** at an integer-literal key). With D1025 and D1009 closed the
hoists go away and the `is` checks do not: the doc's own `users[0].name` is still four `is`
tests, and usability's P4 measured the helpers' value scaling with path DEPTH, not field
count (9 lines / 4 `is` / 3 hoists → 2 lines / 1 `is` / 0 hoists at depth 4). Ground 1
(name squatting) stands and is answered by any noun-first spelling.

Three options:

- **(a) none in v1** — the proposal. Every consumer hand-rolls an accessor and each copy
  re-decides what a missing key returns (usability Q1).
- **(b) `jsonGet(self: Json, key: string): Json` / `jsonAt(self: Json, index: i32): Json`**
  — chainable (`r.jsonGet("users").jsonAt(0).jsonGet("name")`), lossy on purpose: a
  missing key and a stored `null` are both `null`, documented, with `has` on the map arm
  as the exact alternative. Two exports. The std critique's chosen names if forced.
- **(c) `jsonPointer(self: Json, pointer: string): Json | JsonError`** — one export over
  an RFC 6901 pointer (`"/users/0/name"`, `""` for the whole document, `~1`/`~0`
  escapes). One `is` reads a value at any depth. A step that does not resolve — key
  absent, index out of range, wrong container — is `JsonError { kind: "missing", path:
  <the prefix that resolved> }`, so **missing is distinct from a stored null** and a
  consumer who does not care writes `if v is string` and gets the same answer for
  "missing" and "wrong type". A malformed pointer is `kind: "syntax"` with `at` into the
  pointer. Costs one more `kind` and the RFC's ten lines of unescaping. serde exposes the
  same thing as `Value::pointer`; JS and Python have no equivalent because property access
  is the accessor there.

**Recommendation: (c).** It answers every ground on record — no squatting (one noun-first
name), missing-vs-null preserved (the std critique's strongest reason for declining (b)),
a standard rather than a house convention, and the value scales exactly where usability
measured the pain. It uses the ruled error shape rather than a second channel. It needs
nothing new from the compiler beyond D1021 (a `Json | JsonError` return is the module's
existing shape). If the owner prefers (a), the header records (c) as the reserved name
and shape so nobody ships `get`/`at`.

### 2.2 `f64 → i32` for a number off the wire — `as` traps, and where the exact bridge lives

Usability F5: `3000000000.0 as i32` is `wasm trap: integer overflow` **(RUN)**, so the
naive spelling of "read a port from the config" traps on legal JSON, and the safe spelling
is eight lines every handler repeats. It asked for `asExactI32(self: f64): i32 | null` in
`std:fmt` beside the `parseI32` family — a NUMBER question, not a JSON one, which keeps
`std:json` from growing a numeric surface.

Two decisions underneath it, only the first is std's:

1. **Ship `asExactI32` (and `asExactI64`) in `std:fmt`?** Recommendation: **yes**, with
   the `std-api-reviewer` pass the CLAUDE.md rule requires. `null` for NaN, ±Infinity,
   any fractional part, or out of range — the `parseI32` shape exactly, and "exact" in the
   name says what the `null` means.
2. **What does `f64 as i32` DO out of range?** Today it traps (wasm `i32.trunc_f64_s`).
   Rust saturates (`as` is total; NaN → 0); JS `|0` wraps; C is UB; Go is
   implementation-defined. This is a language ruling, not a json one, and it is on every
   JSON consumer's path. Recommendation: **saturate** (`i32.trunc_sat_f64_s`, NaN → 0,
   one instruction, total) and route the "was it exact" question to `asExactI32`. A
   trapping `as` is a silent-until-runtime failure with no `?`-spelling, which is the
   footgun usability ranked second of five.

### 2.3 `string | "err"` — collapse the literal or keep the arm (D1024's language question)

Filed while re-ablating D1021: a union spelling a base type AND a literal of that base is
check-clean invalid wasm in a signature (D1024). The checker already half-collapses it
(the literal widens and duplicates the `string` atom); the language has to say which:

- **collapse** — `string | "err"` IS `string`; the literal carries nothing; `is "err"` on
  it is a plain string compare. TypeScript's answer. A hint (`literal "err" is subsumed by
  string`) tells the author the arm is inert.
- **keep** — the literal stays a distinguishable arm, `is "err"` a tag test. No language
  does this, and it makes `string | "err"` a different type from `string` while every
  value of one is a value of the other.

**Recommendation: collapse**, and the same rule closes D1026 (`P | null` where `P`
already holds `null` — dedupe after alias expansion). Nothing in `std:json` spells either;
it is here because the fix for D1021/D1024/D1026 has to pick.

### 2.4 Nothing else is open

Decisions 1, 2, 4 and 5 of the design doc's §6 were unanimous ACCEPT across the three
critiques — names `parseJson`/`toJson`; silent rounding above 2⁵³ with fmt's witness and
the reversibility note (`parseI64` is exact **(RUN)**, so a `precision` kind can be added
later without redesign); one `JsonError` for both directions with `at` fixed on render;
`string`-only input. They are closed and the design doc no longer lists them as questions.

---

## 3. The compiler's side, re-sequenced

The design doc's §5 listed D1021, D1009/D1010, D1022, `IdentitySet`, explicit type
arguments, `fromCodePoints`. The critiques and their verification changed the order and
added four. In ship order:

1. **D1021 — recursive alias composed into a wider union** (blocks v1; route (1); in
   flight with vl-de). Witness `Json | JsonError`.
2. **D1025 — a map subscript mints no narrowing key** (new; usability gap A). The
   load-bearing gap the helper decline was mis-attributed to. String-keyed face is the
   loud one every consumer meets; the integer-literal face is check-clean invalid wasm.
   **Build the emitter's map-read narrowing BEFORE widening the checker's key**, or the
   string face moves loud→silent (D965's position rule).
3. **D1024 / D1026 — duplicate atom after alias expansion in a signature** (new; one
   dedupe plausibly closes both). D1026 is `Json | null`, the signature every accessor
   wants (usability gap C); with 2.3 ruled "collapse" it is the same fix.
4. **D1009 / D1010 — `Json | null` ↛ `Json`; null-bearing literals** (unchanged). The
   wrong-repair footgun (§1.10) is why D1009 outranks D1022.
5. **D1022 — named arm aliases**, emit half first (`let o: JsonObject = Map()` refuses;
   the `is` sites already run when declared after the tree) (usability F7).
6. **`==` over a union with struct/list arms** — `emitProgram: \`==\` over a struct union
   is not supported yet` **(RUN)**; clause 2; on the critical path of every round-trip
   test (usability F4). A capability probe belongs under `scripts/capability-probes/`.
7. **`===` parses** — needed for the cycle scan (§1.6); today `expected an expression but
   found EQUAL` **(RUN)**. Sequenced with A15's `IdentitySet<T>`, which it is the primitive
   for.
8. **A15 build item 4 — `IdentitySet<T>`**; **explicit type arguments** for stage 3;
   **`fromCodePoints` on an inline literal** — unchanged from §5.
9. **`f64 as i32` saturating** — if 2.2(2) is ruled that way; one instruction.

---

## 4. What happens next

- Owner rules §2.1–2.3 (three questions; 2.2(2) and 2.3 are language rulings that land
  in `DECISIONS.md`, not in this module).
- vl-de closes D1021; D1025's emitter half is the next brief after it.
- The builder is briefed on `docs/json-design.md` as amended, with the `std-api-reviewer`
  pass covering `std:json` and, if 2.2(1) is taken, `std:fmt`'s `asExactI32`/`asExactI64`.

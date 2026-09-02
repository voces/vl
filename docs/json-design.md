# `std:json` v1 — the surface, and what the compiler has to grow to serve it

> Status: **CRITIQUED 2026-09-01 — three open questions for the owner, then the builder.**
> This is serde stage 1 (`docs/serde-design.md` §Recommendation, ruling G): a real `Json`
> VALUE TREE plus a parser and a renderer over it. Nothing here is built. The owner answered
> seven surface questions on 2026-09-01 and those answers are recorded in §0 as facts this
> doc does not re-open. Three critiques (`docs/internals/json-critique-{std,crosslang,
> usability}.md`) were synthesised in `docs/internals/json-critique-synthesis.md`; the
> unanimous and measured changes are written INTO the sections below (each marked
> *post-critique*), and §6 now lists only what the owner still has to rule.
>
> **Every claim about today's compiler marked (RUN) was executed against the 2026-09-01
> seed** (worktree-refreshed, `VL_STD=$PWD/std`); the programs are in the appendix so a
> re-run is a paste. Claims about other languages are from spec knowledge, written without
> web access; where one is uncertain it says so.
>
> **The design is not restricted to what the compiler does today** (owner, 2026-09-01:
> *"don't restrict us to what currently exists in vl. if we need new functionality for a
> better design, it should be considered"*). Where the better surface needs a compiler or
> language change, §5 names the change as a build item with its measurement, and the
> surface is written for the language VL is meant to be. A `std` name is close to permanent
> (CLAUDE.md); a compiler gap is not. **Four such gaps were found while measuring this
> proposal, and one of them blocks the ruled error shape outright (D1021).**

---

## 0. What is already ruled

Owner's answers, 2026-09-01, to the seven questions this surface turned on:

| # | question | answer |
| --- | --- | --- |
| 1 | error channel: `Json \| JsonError` (fs shape), `\| null`, or trap? | **"JsonError"** |
| 2 | number arm: `f64` only, or `f64` + exact `i64`? | **"I feel f64 is obvious"** |
| 3 | rendering `NaN` / `Infinity`: error, `null` (JS), or literal (Python)? | **"Error I think. what does JS do? other languages?"** — table in §2.5 |
| 4 | cycles in the value tree | nothing new beyond the serde §Cycles ruling — detect, error, depth-cap floor |
| 5 | compact vs pretty default | **"compact seems sensible. what do other languages do?"** — §2.6 |
| 6 | names | **"not a strong opinion; you decide and have an agent or two critique"** |
| 7 | accessor helpers | needed explaining — §2.8 does, and proposes |

Serde rulings that bind this module (all in `docs/serde-design.md`, §Open questions):

- **G** — stage 1 is a value tree + parser + renderer, not a pull lexer.
- **A** — strict: unknown fields rejected (stage 3), **duplicate keys rejected**, exact-case
  key match, a nullable field is always emitted as `"f": null`.
- **B** — `i64` on the wire is a JSON number, never a string (stage 3; §2.3 here says what
  that means for a tree whose only number arm is `f64`).
- **§Cycles** — detect and error; a depth cap as the floor; an unsafe fast path deferred.
- **OQ-1** — no compiler builtin; std functions, later backed by intrinsics.
- **OQ-11 / A15** — the seen-set for cycle detection is an `IdentitySet<T>`
  (`docs/identity-design.md` §0, build item 4).

std conventions this module inherits (each measured in the module that set it):

- `T | Error` return; the error is a struct carrying position, kind and message —
  `readFile(path): u8[] | IoError`, `decodeUtf8(self: u8[]): string | Utf8Error`,
  `decodeBase64(self: string): u8[] | Base64Error`.
- **An error struct carries a THIRD field** so two modules' errors stay structurally
  distinct: `Base64Error = { at, kind, msg }` because a union naming two identical
  structural types fails to emit (`std/base64.vl` header).
- `self`-first parameter = UFCS method (`"1.5".parseF64()`, `bytes.decodeUtf8()`).
- No namespace import: every export lands in the importer's flat scope, so names carry
  their noun (`parseF64`, `encodeBase64`, `pathKind`), never bare `parse`/`encode`.
- `toString(self: f64)` is ECMA-262 `Number::toString` — shortest round-trip, `1` for
  `1.0`, `0` for `-0.0`, `1e+21`, `Infinity`, `NaN` **(RUN)**. The renderer inherits it.

---

## 1. The surface

```vl
// std/json.vl

export type Json = null | boolean | f64 | string | Json[] | { [string]: Json }

export type JsonError = {
  at: i32,                                   // byte offset into the input on parse;
                                             // 0 on render (the location is `path`)
  kind: "syntax" | "duplicate" | "depth" | "nonfinite",
  path: string,                              // RFC 6901 JSON Pointer to the value:
                                             // "/users/3/score"; "" at the root
  msg: string,
}

export function parseJson(self: string): Json | JsonError
export function toJson(self: Json): string | JsonError
```

That is the whole of v1: one type, one error type, two functions — plus, if §6 question 1
is ruled as recommended, one accessor:

```vl
export function jsonPointer(self: Json, pointer: string): Json | JsonError   // §2.8, OPEN
```

*Post-critique:* `path` is the fourth field (std #1, crosslang F10): it keeps `JsonError`
structurally distinct from `Base64Error = { at, kind, msg }` — a union naming two
structurally identical error types fails to emit, which is why every std error carries a
field of its own — and it is the render-side coordinate, since a render "never emits a
partial document" and an offset into a discarded buffer located nothing.

**WHAT IS NOT HERE** — named so the next person does not ship the mode-switch spelling,
in `std/base64.vl`'s form (its URL-safe alphabet is named with the name it will take and
the shape it must not take). Neither is in v1; both wait for a consumer:

- `toJsonPretty(self: Json, …)` — §2.6. The NAME is fixed (never `toJson(v, pretty)`); the
  parameter is not, beyond one refusal: not `indent: i32` (all four languages take a
  string; an integer forecloses tabs in a std with no deprecation story).
- `jsonKind(self: Json): JsonKind` with `export type JsonKind = "null" | "boolean" |
  "number" | "string" | "array" | "object"` — §2.8; a named alias because it is a RETURN
  (`pathKind`/`FileKind`), where `JsonError.kind`'s union is inline because it is a field.

And the names the later stages will take, so v1 does not squat on them (§2.4):

```vl
// stage 3, docs/serde-design.md — the typed pair; NOT part of this module's v1
export function fromJson<T>(self: string): T | JsonError
export function toJson<T>(self: T): string | JsonError        // generalises v1's toJson
```

A parse never traps and never returns a partial tree. A render never traps, never emits a
partial document, and fails only on a value JSON cannot carry (`nonfinite`) or a tree it
cannot finish (`depth`, which is also how a cycle surfaces until the seen-set lands).
**Every tree `parseJson` returns, `toJson` renders** (*post-critique*, §2.5: a non-finite
number lexeme is refused at parse, so no non-finite `f64` ever exists inside a parsed
tree; the only way to hold one is to build it in the program).

---

## 2. Each decision, with the alternatives beside it

### 2.1 The value type is the six-arm union, arms spelled structurally, insertion-ordered

```vl
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
```

This is the tree ruling G named, and #2254's position matrix measured it at 51 of 60
positions on the 2026-09-01 seed. Three things the spelling commits to:

- **Objects are VL maps, and VL maps are insertion-ordered (RUN):** inserting `b, a, c`,
  deleting `a` and re-inserting it iterates `b c a`. So a parsed object renders its keys in
  document order, and a program-built one in the order the program wrote them — JS and
  Python behaviour. Go sorts map keys on `Marshal`; `serde_json::Value` sorts (BTreeMap)
  unless `preserve_order` is on. Insertion order is the right default because it is the
  only one under which parse→render is an identity on key order, which is what a
  config-file rewrite wants. Sorted output is a `toJson` variant if a consumer names it
  (canonical JSON for hashing is the usual one), not the default.
- **Missing and `null` are distinguishable on the tree itself**, because the map arm has
  `m.has(k)` beside `m[k]` **(RUN)**. Any helper that flattens a lookup to a `Json` value
  (§2.8) loses that distinction on purpose, and says so.
- **Named arms — `type JsonObject = { [string]: Json }`, `type JsonArray = Json[]` — are
  what a reader wants and what the compiler refuses today (RUN, D1022).** `if v is
  JsonObject` reads better than `if v is { [string]: Json }`, and every other language's
  tree names its arms (`Value::Object`, `JSONObject`, `dict`). As members of the recursive
  union the checker says `` `is` check type 'JsonObject' is not a variant of Json `` and
  `push` refuses the object into `Json[]`; declared *after* the tree, `is` works but `let o:
  JsonObject = Map()` refuses at emit (`unsupported map value type … interned no mv slot`).
  The non-recursive control (`type O = {[string]: f64}; type J = null | f64 | O; v is O`)
  runs. **The proposal is that v1 exports `JsonObject` and `JsonArray` as aliases and the
  tree names them, and D1022 is a build item — not that the aliases are dropped.** Until it
  lands the tree is spelled structurally and the aliases are absent, which changes no
  program's meaning later: an alias is transparent.

**Considered and declined — a tagged variant per arm** (`{ kind: "number", value: f64 }`
…). It is what a language without unions does; VL's `is` narrows a union arm without a
wrapper, and a wrapper would cost an allocation per scalar and a `.value` on every read.

**Considered and declined — separate `Json` value and `JsonNumber` lexeme carrier.** §2.3.

### 2.2 The error type is a struct with a literal-union `kind`, `at` is a byte offset, and `path` is a JSON Pointer

```vl
type JsonError = { at: i32, kind: "syntax" | "duplicate" | "depth" | "nonfinite", path: string, msg: string }
```

*Post-critique:* `path` added (std #1–2, crosslang F10). On parse it is the pointer to the
container being read when the error fired (`"/users/3"` for a bad byte inside the fourth
user; `""` before any container opens); on render it is the pointer to the offending value
and `at` is `0`. The header states the split in one sentence: *`at` is an offset into
`self` on parse and is not meaningful on render, where `path` locates the value.* Without
the field `JsonError` was structurally `Base64Error`, and the union `Base64Error |
JsonError` fails to emit (measured by the std critique, probe `a3`).

- **Why a struct and not `null` (fmt's `parseF64` shape):** a JSON parse failure has a
  POSITION and a REASON, and `null` carries neither. This is `Utf8Error`'s and
  `Base64Error`'s argument, already made in their headers, and the owner ruled it (answer 1).
- **Why `kind` is a literal union and not a string:** a consumer branches on it with `==`
  against a literal the checker can verify; a misspelt kind is a type error, not a silent
  `false`. It is also the third field that keeps `JsonError` structurally distinct from
  `IoError` and from any `{ at, msg }` a program of its own declares.
- **The four kinds, and what each is for.** `syntax` — the input is not JSON (RFC 8259):
  anything from a bad byte to an unterminated string, with `msg` saying which. `duplicate`
  — ruling A: an object repeats a key; `at` is the second occurrence. `depth` — nesting
  exceeds the cap (§2.7), on parse OR render. `nonfinite` — on render, an `f64` arm holds
  `NaN` or `±Infinity`; on parse, a number lexeme whose value is not a finite `f64`
  (`1e999`; §2.5, *post-critique*). A fifth, `cycle`, arrives with the seen-set (§2.7),
  and a sixth, `missing`, with `jsonPointer` if §6 rules it in — named here so the union
  grows rather than reshapes. The header lists which kinds each function can produce; a
  consumer's exhaustive `match` over `kind` sees them all, which is the one cost of a single
  error type and the std precedent for it (`IoError` serves five operations with codes
  only some can produce).
- **`at` is a BYTE offset**, because a VL string is bytes now: `"aé€😀".length` is `10` and
  `s[1]` is `195`, é's lead byte **(RUN)**. That is also what a text editor's "go to
  offset" and every other std error (`Utf8Error.at`, `Base64Error.at`) mean. Line/column is
  a function of the input and the offset, computable by the consumer; a helper
  `lineCol(self: string, at: i32)` belongs in `std:fmt` or a future `std:text` if anyone
  asks, not here.
- **`msg` is for a human and is not part of the contract.** Tests grade on `kind` and `at`.

**Considered — a single `JsonError` for parse and a separate `JsonRenderError`.** Two
kinds are render-only and two are parse-only, so a split is honest; but it doubles the
type count for a consumer who mostly writes `if r is JsonError`, and the shared kinds
(`depth`) would have to be spelled twice. One type; the header lists which kinds each
function can produce. Cross-language: serde_json has one `Error` for both directions; Go has
`SyntaxError`/`UnmarshalTypeError` for decode and `UnsupportedValueError` for encode; JS
throws `SyntaxError` for parse and `TypeError` for stringify. *Post-critique: all three
critiques ACCEPT the single type; the honest half of the split argument was `at` meaning
two things, and `path` closes it.*

### 2.3 Numbers are `f64`, integers beyond 2⁵³ round silently, and stage 3 is the exact path

Owner: *"I feel f64 is obvious? why isn't it?"* — the reason it was a question:

| language | tree number arm | `9007199254740993` parses to |
| --- | --- | --- |
| JavaScript | `number` (f64) | `9007199254740992` — silently rounded |
| Go `interface{}` | `float64` (or `json.Number` with `UseNumber`) | rounded, or the lexeme |
| Python | `int` / `float` by lexical form | exact (unbounded int) |
| serde_json `Value` | `Number` holding `i64` / `u64` / `f64` by lexical form | exact `9007199254740993` |
| **VL `Json`** | **`f64`** | **`9007199254740992` (RUN, via `parseF64`)** |

It is a question because a 64-bit id — Twitter snowflakes, database keys, any `i64` a VL
program itself serialises under ruling B — does not survive an `f64` tree, and the loss is
SILENT, which the std rubric singles out. The alternatives were weighed and `f64` still
wins:

- **`f64 | i64` arms by lexical form (serde_json/Python).** Every consumer must then test
  both arms to read "a number"; `1` and `1.0` parse to different arms though JSON says they
  are the same number; and the renderer has to decide whether a `2.0` prints as `2` (it
  does today, ECMA-262). Two arms for one concept is the wrong trade for a tree whose job is
  to be walked.
- **A lexeme-carrying number struct (Go's `json.Number`).** Exact, but a struct arm costs
  an allocation per number and `.value` on every read, and it makes the common case pay for
  the rare one.
- **Refuse on the parse side — `kind: "precision"` when an integer lexeme exceeds ±2⁵³.**
  Loud instead of silent, which the rubric prefers; but it makes a document holding one
  large id unparseable as a tree at all, which is the exact JS failure mode (`id_str`
  exists because of it) with a worse ergonomic. **Named here as the alternative the critique
  should weigh**; the proposal is the silent rounding, DOCUMENTED, because:
- **Stage 3's typed decoder is the exact path, and it must not go through the tree.**
  `fromJson<T>` with an `i64` field parses the lexeme directly to `i64` (ruling B); it
  never materialises an `f64`. That is a design constraint on stage 3 recorded here so the
  tree's rounding is never inherited by the typed path: **the typed decoder is a second
  consumer of the lexer, not a consumer of `parseJson`.**

Two measured facts that shape the number lexer:

- **`parseF64` is NOT the JSON number grammar and cannot be used as its gate (RUN):** it
  accepts `01`, `NaN` and `Infinity` and rejects `.5`, `1.`, `" 1"`. The parser scans a
  lexeme against RFC 8259 §6 itself (`-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?`) and hands the
  validated text to `parseF64` for the CONVERSION only, which is correctly rounded
  (`std/fmt.vl` header: 205,844 of 205,844 against `Number(s)`).
- **Range IS a parse failure** (*post-critique*, reversing the proposal): `parseF64("1e999")`
  is `Infinity` **(RUN)**, and the lexer refuses that conversion result with `kind:
  "nonfinite"` rather than let the tree hold a value the renderer refuses (§2.5). serde
  and Go do the same; JS parses it to `Infinity` and renders `null`.

*Post-critique — what the header owes on the rounding decision* (std #8, crosslang F2; all
three critiques ACCEPT silent rounding, the `f64` type says it, and fmt sets the form):
fmt's witness verbatim — `parseF64("9007199254740993")` is `9007199254740992` **(RUN)** —
beside a pointer to `parseI64` as the exact path (`std/fmt.vl:240-244`, `271-281`); the
interop bound stated as RFC 8259 §6's **±(2⁵³ − 1)**, not ±2⁵³ (2⁵³ is representable,
2⁵³ + 1 is not); the VL↔VL hole in one sentence — an `i64` a VL program serialised under
ruling B does not round-trip through VL's own tree, and stage 3's `fromJson<T>` is the
answer, so `parseJson` is not the recommended path for VL↔VL traffic until stage 3 exists;
and that the decision is **reversible at near-zero cost** — `parseI64` is exact where
`parseF64` is not, the lexer already scans the lexeme, so a `precision` kind can be added
later without redesigning anything. That reversibility is what makes "silent, documented"
safe to choose now. And fmt's admission sentence for `parseI64`/`parseI32` (`std/fmt.vl:
246-257`) names `std:json` as the consumer that will spell them — this module's v1 does
not; the header says the STAGE 3 decoder is that consumer, so fmt's sentence is not read
as false.

### 2.4 Names: `parseJson` / `toJson`, and how stage 3 lands beside them without a rename

Owner: names are mine to pick and have critiqued. The constraints:

- fmt's precedent is `parseF64(self: string): f64 | null` — **parse + noun** for
  text→value, `toString` for value→text.
- The flat import scope means the noun has to be in the name.
- Stage 3 wants a typed pair, and the two pairs should read as one family.

| | text → value | value → text |
| --- | --- | --- |
| **proposed v1** | `parseJson(self: string): Json \| JsonError` | `toJson(self: Json): string \| JsonError` |
| stage 3 | `fromJson<T>(self: string): T \| JsonError` | `toJson<T>(self: T): string \| JsonError` |
| JS | `JSON.parse` | `JSON.stringify` |
| Python | `json.loads` | `json.dumps` |
| Go | `json.Unmarshal` | `json.Marshal` |
| Rust | `serde_json::from_str` | `serde_json::to_string` |

Why `parseJson` for the tree and `fromJson<T>` for the typed decode rather than one name:

- `parseJson` answers "is this text JSON, and what does it hold" — a tree. `fromJson<T>`
  answers "is this text a `T`". Different questions, different return types, and the fmt
  precedent (`parse` = text→value of the named kind) fits the first exactly.
- **`toJson` is ONE name across both stages** because stage 3's `toJson<T>` at `T = Json`
  IS v1's `toJson`: rendering a tree is the identity derive. So v1 ships the non-generic
  `toJson(self: Json)` and stage 3 generalises it in place, no rename, no second export.
- **Could `fromJson<T>` subsume `parseJson` too** (`fromJson<Json>(s)` = the tree)? Only if
  the call can name `T`. Today a type parameter bound by nothing but the return refuses at
  emit — `monomorphize: a return type parameter of `zero` is not bound by any parameter`
  **(RUN)** — and explicit type arguments at a call (`zero<i32>()`) do not parse **(RUN)**.
  Both are already build items under A15 (explicit type args, `Map<string,i32>()`), and when
  they land `fromJson<Json>` and `parseJson` will both exist and agree. Keeping `parseJson`
  is still right: it is the name a reader reaches for, and the typed one needs the type
  parameter spelled or inferred from the destination, which is a heavier read for "just
  parse it".

**The alternatives, and why each loses** (*post-critique*: all three critiques ACCEPT
`parseJson`/`toJson`; the dismissal of the codec pair is rewritten on the std critique's
ground, #4): `jsonParse`/`jsonRender` — `render*` exists in std only as PRIVATE names
(`renderI64`/`renderF64` behind `toString`), and noun-first is reserved (`std/fs.vl:68-75`)
for functions that ASK ABOUT a subject rather than operate on it. `decodeJson`/`encodeJson`
— not because "those are byte codecs and JSON is text" (`encodeBase64(self: u8[]): string`
produces text too), but because both existing `encode*` functions are TOTAL and their
`decode*` twins are the fallible half; `toJson` is fallible in the encode direction, so the
codec framing would promise a symmetry this module does not have. `Json.parse` — no
namespaces in VL today. One note the header owes (std #4): a `toJson<T>` defined for every
`T` the deriver reaches IS the universal renderer `toString` deliberately refused to become
(`std/fmt.vl:49-61`), admissible only because serde stage 2's derive is what delivers it.

### 2.5 The renderer refuses `NaN` and `±Infinity` — `kind: "nonfinite"`

Owner: *"Error I think. what does JS do? other languages?"*

| language | `NaN` / `Infinity` on render |
| --- | --- |
| JavaScript `JSON.stringify` | `null` — silently, no error |
| serde_json | `null` for `f64::NAN` in `Value`; typed `to_string` of an `f64` NaN also `null` |
| Python `json.dumps` | the literals `NaN` / `Infinity` — **invalid JSON** — unless `allow_nan=False`, which raises |
| Go `json.Marshal` | error: `json: unsupported value: NaN` |
| **VL `toJson`** | **`JsonError { kind: "nonfinite", at: <output offset> }`** |

Go's is the only one of the four that is both RFC-valid and loud, and it is the one the
owner picked. `null` is the pragmatic JS choice and it is silently lossy — a `NaN` that
went in as "no reading" comes back as "the reading is null", indistinguishable from an
intentional null. A render error carries `at: 0` and the value's pointer in `path`
(§2.2).

*Post-critique — `1e999` is refused at PARSE too, `kind: "nonfinite"`* (std #3, crosslang
F1). The proposal parsed it to `Infinity` (`parseF64("1e999")` is `Infinity` **(RUN)**)
and then refused to render the tree — a document accepted into a tree the module cannot
write back, which none of the four does: Go and serde refuse the lexeme at parse (`number
out of range`), JS and Python accept it and their renderers then emit something (`null`,
`Infinity`) rather than refuse. The lexer refuses a numeric lexeme whose
`f64` value is not finite; the kind is `nonfinite` because the lexeme is grammatical
(`syntax` would be false) and the property is the value's. Underflow (`1e-999` → `0`)
stays silent, as in all four — `0` is finite and renders. I-JSON §2.2's own example of what
a message SHOULD NOT contain is `1E400`. This is what makes §1's invariant true: every
tree `parseJson` returns, `toJson` renders.

*Post-critique — `-0.0` renders as `-0`* (crosslang F7). `toString(-0.0)` is `0` **(RUN)**,
so the renderer special-cases negative zero (`x == 0.0 && 1.0 / x < 0.0` → `-0`); Go,
serde and Python all keep the sign and JS alone loses it, and RFC 8259's grammar admits
`-0`. One branch; the round-trip exception list loses an entry.

### 2.6 Compact by default; pretty is a second function, deferred, with its signature fixed

Owner: *"compact seems sensible. what do other languages do?"*

| language | default | pretty |
| --- | --- | --- |
| JavaScript | compact | same function, `space` argument (`JSON.stringify(v, null, 2)`) |
| Python | **not compact** — `", "` / `": "` separators | same function, `indent=` |
| Go | compact | second function `MarshalIndent(v, prefix, indent)` |
| Rust serde_json | compact | second function `to_string_pretty` |

Compact is three of four, and the one exception (Python's spaced separators) is widely
regarded as a wart. **A second function, not an argument**: VL has no optional parameters,
an indent parameter on the main entry would be a magic parameter on every call, and the
std rubric prefers two names to a mode switch. The NAME is fixed now so it is not taken by
something else: `toJsonPretty`. *Post-critique (std #11, crosslang F5c):* its PARAMETER is
not fixed — the proposal's `indent: i32` is the one signature in this doc all four
languages contradict (JS `space` may be a string, Python `indent=` a `str`, Go
`MarshalIndent(v, prefix, indent string)`, serde `with_indent(&[u8])`), and an integer
forecloses tabs permanently in a std with no deprecation story. The consumer that arrives
rules the shape; the ruling must define what an empty indent does (JS: no newlines at all;
Go/serde: newlines with no indentation — they disagree) and copies Python's post-3.4
detail that the item separator is `","` with indentation on, so no line ends in
whitespace. Layout otherwise: newline after every element, `": "` after keys — JS/serde.
**Not in v1** until a consumer names it; the first is likely `vl fmt`-adjacent tooling or a
config rewriter.

Escaping on output, all four agree on the RFC minimum and differ above it: `"`, `\`, and
control characters U+0000–U+001F are escaped (`\n \t \r \b \f`, else `\u00XX`);
**non-ASCII is emitted raw as UTF-8** (serde; JS emits it raw but, since ES2019, escapes a
LONE SURROGATE rather than emitting it — JS is lax on input and strict on output, the
inverse of §2.9's framing; Python escapes non-ASCII by default with `ensure_ascii=True`; Go
HTML-escapes `<`, `>`, `&` by default and escapes U+2028/U+2029 unconditionally, and
replaces invalid UTF-8 with U+FFFD — *post-critique*, crosslang F5a–b). The invariant VL
adopts from the JS correction: **there is no input on which the renderer emits text it
would not itself accept.** Raw is right:
the output is a VL string, VL strings are UTF-8 bytes, and escaping non-ASCII quadruples the
size of every non-English document for the benefit of no consumer VL has. `/` is not
escaped (RFC permits either; nobody's default escapes it).

### 2.7 Depth cap 128, on both directions; a cycle is a `depth` error until the seen-set lands

Both are measured facts about the tree, not hypotheticals:

- **The tree can hold a cycle (RUN):** `let a: Json[] = []; a.push(a)` checks and runs, and
  so does `m["self"] = m` on the map arm. A naive recursive walk over either is
  `wasm trap: call stack exhausted` **(RUN)** — a trap, not an error a program can handle.
- **The recursion budget is finite and not huge (RUN, re-measured post-critique):** a
  two-line self-call survives **30,000** frames on the host and traps at 40,000; a
  PARSER-SHAPED frame (eight scalar locals, a string, a list and a map per frame) survives
  **2,000** and traps at 3,000 (`wasm trap: call stack exhausted`). A recursive-descent
  parser spends two frames per nesting level, so ~1,000 levels of `[[[[[…` is 2,000–3,000
  parser frames — the trap edge, with nothing left for the caller's own stack.

**Cap = 128**, serde_json's number, applied to parse (nesting of arrays/objects in the
input) and to render (nesting of the tree being walked). No real document is 128 deep;
every DoS document is. *Post-critique (crosslang F3 asked for ~1,000 as "the strictest of
the four by 78×"; std #10 accepted 128 in fmt's form):* the measurement above is the
justification — 128 is ~8× inside the parser-frame budget, 1,000 is at its edge — and it is
recorded in the header as a **stack-budget measurement to re-take with the real frame**,
not a copied constant; in fmt's form (`const MAX_DEPTH = 128`, the DoS argument, serde's
citation, and the shape of `std/fmt.vl:296-302`'s grammar rule — a limit can be RAISED
later and never lowered, so the conservative number keeps both options). VL is the only
one of the five that caps BOTH directions.

**A cycle exceeds any cap** and therefore surfaces as `kind: "depth"` with `msg` saying
the cap was reached — correct, deterministic, and slightly misnamed. When A15 build item 4
lands `IdentitySet<T>`, the renderer keeps the ancestors of the current node in one and
reports `kind: "cycle"` at the first back-edge, `path` naming the repeated node; the depth
cap stays as the floor for the deep-but-acyclic case. *Post-critique (crosslang F4,
usability F8):* the ancestor scan uses **`===`, never `==`** — `==` over refs is structural
and itself diverges on a cycle; `===` does not parse today (§5 item 7), which also means a
CONSUMER cannot write a cycle-safe walker at all. The header therefore says, beside the
cap, that the cap protects `parseJson` and `toJson` and **nothing the consumer writes**,
and that a PARSED tree cannot contain a cycle — the exposure is program-built trees only.
This is the serde §Cycles ruling applied to one surface: detect, error, depth-cap floor,
unsafe fast path not offered.

**Considered — make the cap a parameter.** No: it is a safety floor, not a tuning knob, and
no consumer has named a need. JS has no cap and stack-overflows; Python's is the interpreter
recursion limit (~1000); Go has none for `Unmarshal` into `interface{}` (it caps at 10,000
since 1.15). If a consumer needs deeper, the number moves, once, upward, in the header.

### 2.8 Accessor helpers — OPEN (§6 question 1); the walking idiom, and what the critiques measured

Owner's question 7 was "what?", so here is what was being asked. Walking a `Json` means
narrowing at every step:

```vl
import { parseJson, JsonError } from "std:json"

const r = "{\"users\":[{\"name\":\"ada\"}]}".parseJson()
if r is JsonError { print(r.msg); return }
if r is { [string]: Json } {
  const users = r["users"]              // Json | null — hoist before `is` (D1009)
  if users is Json[] {
    const first = users[0]              // hoist again
    if first is { [string]: Json } {
      const name = first["name"]
      if name is string { print(name) }
    }
  }
}
```

Four `is` checks to read one string. Other languages offer a lax path: JS `r.users?.[0]?.name`
(`undefined` if any step fails), serde_json `v["users"][0]["name"].as_str()` (`Value::Null`
on a miss, `Option` on the type test), Go nothing (type assertions at each step, the same
as VL), Python `r["users"][0]["name"]` (raises on a miss).

**The helpers considered**, all UFCS over `Json` so they chain:

```vl
export function get(self: Json, key: string): Json     // object member, else null
export function at(self: Json, index: i32): Json       // array element, else null
```

so that `r.get("users").at(0).get("name")` is a `Json` and ONE `is string` reads it. They
cost nothing to build, and they lose the missing-vs-null distinction on purpose (the map arm
keeps it, §2.1). The proposal **declined them for v1 on two grounds**:

1. `get`/`at` are the two most generic names in the language and would land in every
   importer's flat scope (`import { parseJson } from "std:json"` does not import them, but
   `get` as a std export name sets a precedent that `std:collections` will want back) —
   and `get` is already a checker-claimed map builtin (std #6). `jsonGet`/`jsonAt` are the
   noun-first spellings.
2. **The idiom's cost is mostly a compiler gap, not a library gap.** Two of its four
   hoists exist only because of D1009 (`Json | null` does not narrow to `Json` though `null`
   is an arm) and the general rule that a field/element read must be hoisted before `is`.

*Post-critique — ground 2 is false as stated, and the decision is the owner's.* The
usability critique wrote the consumer programs and measured: the `&&` chain ground 2
predicts is blocked by a THIRD gap that is neither D1009 nor D1010 — a map subscript mints
no narrowing key, **D1025** (loud at a string key; check-clean invalid wasm at an
integer-literal key). And with every gap closed the hoists go, the `is` checks stay: the
helpers' value scales with path DEPTH (measured 9 lines / 4 `is` / 3 hoists → 2 lines /
1 `is` / 0 hoists on this very example). Votes: std ACCEPT the decline (its stronger
ground: `Json | null` has no spelling for "missing", so (b) below is lossy by
construction); crosslang ACCEPT conditionally, and reserve `pointer()` (RFC 6901) as the
name; usability OVERTURN, ship `jsonGet`/`jsonAt`. The options on the table, with the
synthesis's recommendation in bold:

- **(a)** none in v1 — every consumer hand-rolls one and re-decides what a missing key
  returns.
- **(b)** `jsonGet`/`jsonAt` returning `Json`, missing = `null`, documented lossy.
- **(c) `jsonPointer(self: Json, pointer: string): Json | JsonError`** — one export over
  an RFC 6901 pointer (`"/users/0/name"`; `""` is the whole document; `~1` → `/`, `~0` →
  `~`). A step that does not resolve (key absent, index out of range, wrong container) is
  `JsonError { kind: "missing", path: <the prefix that resolved> }`, so missing stays
  distinct from a stored `null` while the consumer who does not care writes `if v is
  string` once and gets the same answer for "missing" and "wrong type". A malformed
  pointer is `kind: "syntax"` with `at` into the pointer. serde's `Value::pointer` is the
  same thing; JS and Python need nothing because property access is their accessor. Costs
  a sixth `kind` and the RFC's ten lines of unescaping; needs nothing from the compiler
  that `parseJson` does not already need (D1021).

**The one helper worth naming now regardless**: `jsonKind(self: Json): JsonKind`, because
"what is this" is the first question every generic walker asks (a pretty-printer, a
schema checker, a diff), and the six-way `is` ladder to answer it is the same nineteen
lines in every one of them **(RUN — the ladder works today on the structurally-spelled
tree)**. Deferred with the pretty printer as its first consumer; listed in §1's WHAT IS
NOT HERE.

**Not a helper: `jsonEquals`.** Usability F2 asked for one because the obvious wrong
repair of a hand-written `deepEquals` (`a != null && b != null`) checks, runs and makes a
present null equal to everything. The reason a consumer writes `deepEquals` at all is that
`==` over `Json` is an emit refusal (§5 item 6), and VL's `==` over refs is already
structural — a `jsonEquals` would be a std name duplicating an operator the day the
operator's gap closes. The footgun is real and is why D1009 is sequenced early.

### 2.9 Strictness — I-JSON (RFC 7493), ruling A, and the std:utf8 precedent

*Post-critique (crosslang F9):* the proposal said "exactly RFC 8259 text, and nothing
more". It accepts LESS: duplicates are refused (RFC 8259 §4 lists "report an error" among
the behaviours implementations have for them, so ruling A is anticipated by the RFC, not a
departure from it) and lone surrogates are refused (§8.2: such text is "not
interoperable"). The profile that results — UTF-8 only, unique member names, no surrogates,
numbers within IEEE-754 double — is **I-JSON, RFC 7493 §2.1–2.3** almost verbatim
(verified against the RFC text: §2.1 "MUST be encoded using UTF-8", names and strings
"MUST NOT include code points that identify Surrogates or Noncharacters"; §2.2 messages
"SHOULD NOT include numbers that express greater magnitude or precision than an IEEE 754
double", with `1E400` as its example; §2.3 "MUST NOT have members with duplicate names").
The header makes that one conformance claim instead of three apparent limitations, and it
is the honest answer to "why is the number arm only `f64`". One tension recorded: I-JSON
§2.2 RECOMMENDS encoding numbers beyond double precision as strings, and serde ruling B
puts `i64` on the wire as a number; ruling B does not rest on I-JSON and stands.

What `parseJson` accepts:

| input | JS | Python | Go | serde_json | **VL** |
| --- | --- | --- | --- | --- | --- |
| duplicate key | last wins | last wins | last wins | last wins (`Value`) | **error `duplicate`** (ruling A) |
| trailing comma `[1,]` | error | error | error | error | error |
| comment `// …` | error | error | error | error | error |
| single quotes | error | error | error | error | error |
| `NaN` / `Infinity` literals | error | **accepted** | error | error | error |
| leading zero `01` | error | error | error | error | error |
| raw control char in a string | error | error (default) | error | error | error |
| lone surrogate `\uD800` | accepted (UTF-16 string) | accepted | replaced with U+FFFD | error | **error `syntax`** |
| leading BOM | error | error | error | error | **error `syntax` at 0, msg names the BOM** |
| whitespace: only ` \t\n\r` | yes | yes | yes | yes | yes |
| top-level scalar `2` | yes | yes | yes | yes | yes |
| trailing content `{} x` | error | error (`Extra data`) | error (whole-string API; `Decoder` allows a sequence) | error (`trailing characters`) | **error `syntax` at the first non-whitespace byte after the value** |
| empty / whitespace-only input | error | error | error (`unexpected end of JSON input`) | error (`EOF while parsing a value`) | **error `syntax` at `self.length`, msg "unexpected end of input"** |
| `1e999` | `Infinity` | `inf` | error (out of range) | error (out of range) | **error `nonfinite`** (§2.5) |

*(The last three rows are post-critique, crosslang F8 and F1 — trailing content is the row
that catches the most real bugs, and an empty body is the single most common real parse
failure, so both get a distinguishable message rather than "unexpected byte".)*

Two rows are choices rather than the RFC: duplicates (ruled A — stricter than every
listed implementation; the argument is that a duplicate is never intentional and last-wins
hides a producer bug), and lone surrogates. A VL string is UTF-8 bytes; a lone surrogate has
no UTF-8 encoding, and `std:utf8`'s ruling is that DECODE IS STRICT — those bytes are not
text, and the program about to treat them as text is about to be wrong. serde_json makes
the same call. A surrogate PAIR (`😀`) decodes to one code point and is emitted as
its four UTF-8 bytes via `fromCodePoints` **(RUN — the builder needs a NAMED `i32[]`
binding for it; the inline-literal spelling is an emit refusal, `fromCodePoints argument
must be a named i32[] binding`, a clause-2 gap noted in §5)**.

**Invalid UTF-8 inside the input string** is not the parser's concern: the parser copies
string bytes through unchanged (escapes aside) and validates nothing about them. A VL
string that came from the outside world went through `decodeUtf8` to become a string, and
that is where the strictness lives. This is why v1 takes `string` and not `u8[]`
(serde has `from_slice`; Go takes `[]byte`; Python accepts bytes and auto-detects the
encoding — and each of them then owns the encoding question). *Post-critique (std #7):*
the pipeline nobody writes is `readFile` → `decodeUtf8` → `parseJson`; the one people
write is `readTextFile(p)` → `parseJson()`, two steps, because `readTextFile` already
folds the decode (`std/fs.vl`) and RFC 8259 §8.1 makes UTF-8 the only interchange encoding
worth accepting. A `u8[]` entry, if a consumer ever names one, is a separate export with
its own name — VL has no overloading, and the header does not use the word.

---

## 3. Idiom notes the builder and the tests inherit (measured)

- `for i in 0 to n` is INCLUSIVE of `n` **(RUN)**: `for i in 0 to a.length { a[i] }` traps
  out of bounds on the last iteration. std iterates with `while i < n` (49 occurrences,
  zero `to` loops); the builder does the same.
- Arrays are built by `push` into a `let a: Json[] = []` and returned as the binding, never
  as a literal in return position — the annotated `u8[] | null` literal-return is invalid
  wasm (`serde-design.md` stage 0 note) and D1010 needs the `Json[]` annotation on any
  null-bearing literal.
- Objects are `let o: { [string]: Json } = Map()`; an object literal is not a map value
  **(RUN — checker says so)**.
- Every `: Json` return is annotated (#2254 matrix note (a)); a narrowed ref arm is not
  rebound before use (note (f)); a field/element read is hoisted into a local before `is`
  (note (g)).

---

## 4. Position matrix — what the surface is measured on

#2254 measured the tree at 60 positions (51 RUN). This proposal adds the positions the
SURFACE needs, each one a program in the appendix:

| position | outcome (RUN 2026-09-01) |
| --- | --- |
| `Json \| JsonError` returned, error side | **check-clean INVALID WASM — D1021** |
| `Json \| JsonError` returned, value side only | invalid wasm — D1021 |
| `is JsonError` on the composition | loud: `deferred value-union composition` — D1021 |
| the same with a NON-recursive `J` | RUNS |
| `{ value: Json, error: JsonError \| null }` carrier | RUNS (the shape declined in §5) |
| `JsonObject`/`JsonArray` aliases as members of the tree | check error — D1022 |
| the aliases declared after the tree, `is` on them | RUNS |
| `let o: JsonObject = Map()` with the alias declared after | emit refusal — D1022 |
| six-way `is` ladder over the structurally-spelled tree | RUNS |
| list self-containment / map self-containment | RUNS (cycle representable) |
| naive recursive walk over a cycle | TRAP `call stack exhausted` |
| `parseF64` on `01` / `NaN` / `Infinity` / `.5` / `1.` | accepts / accepts / accepts / rejects / rejects |
| `toString` on `1.0 -0.0 1e21 1e-7 2⁵³+1 NaN Infinity` | `1 0 1e+21 1e-7 9007199254740992 NaN Infinity` |
| map insertion order after delete + reinsert | `b c a` |
| `"aé€😀".length`, `s[1]` | `10`, `195` (bytes) |
| return-only type parameter; explicit `<T>` at a call | emit refusal; parse error |

---

## 5. What the compiler has to grow — build items, in ship order

Per the owner's direction the surface above is the one VL should have, and these are the
gaps between it and the 2026-09-01 seed. Each is a program in the appendix; the first
blocks the module outright.

1. **D1021 — a recursive union alias composed into a wider union.** `Json | JsonError`
   returns the error struct where the composed box is expected: **check-clean invalid wasm**
   at the plain return, three loud refusals at every spelling that narrows. Ablated to ONE
   ingredient (the alias's recursion; arm kinds are not one). Mechanism visible in the
   literal-arm message: `Json | "err"` is reported as `Json|string` "with no recorded
   members" — the emitter flattens a non-recursive alias into a composition and keeps a
   recursive one as an opaque atom with no member table. **Blocks v1.** Filed in
   `docs/internals/silent-class-inventory.md`; probe
   `scripts/capability-probes/recursive-union-alias-composed.vl` (the module's real shape,
   grades GAP today).

   **Why the API is not bent around it.** `{ value: Json, error: JsonError | null }` RUNS
   today and would ship the module tomorrow. Declined: std has no deprecation story, every
   other std module returns `T | Error`, and a consumer who learned `if r is IoError` should
   not learn `if r.error != null` for one module because of a compiler gap that has a row
   number. The builder is sequenced after D1021.

2. **D1025 — a map subscript mints no narrowing key** (*post-critique*; the usability
   critique's gap A, filed 2026-09-01). The load-bearing gap the helper decline was
   mis-attributed to (§2.8). `if m["a"] is string { const z: string = m["a"] }` is a loud
   check reject at a string key, and at an INTEGER-LITERAL key (`m[1]`) it is check-clean
   invalid wasm — the checker narrows (D11's place key) and the emitter delivers the raw
   nullable map read. Every JSON object read meets the string face. **Build the emitter's
   map-read narrowing before widening the checker's key**, or the loud face moves to the
   silent one (D965's position rule).

3. **D1024 — a literal arm whose base is already an arm, in a signature**
   (*post-critique*; filed 2026-09-01). `string | "err"` builds check-clean invalid wasm.
   §6 question 3 is the language ruling underneath (collapse the subsumed literal, or keep
   it). It was filed beside D1026 (`function g(): Json | null`, a loud emit reject) as one
   duplicate-atom root; **that was measured wrong** — D1026's witness closed on 2026-09-01
   (#2312: `(T | null) | null` folds at `mkNullableTy`, the nesting was in the arena type
   and not in the spelling) and `string | "err"` fails identically afterwards. And the
   `Json | null` signature itself is STILL refused on the merged seed — D1027: the alias's
   recursion is a second ingredient. It was then read as D1021 with `null` as the composed
   arm; item 1 closed (#2315) and D1027 re-graded with the identical refusal, so it is its
   own row (vl-de has it). Twice in one day a residue was attributed to an open row's
   mechanism and the close refuted it: a minimal witness is minimal for the mechanism it
   found, not for the row's headline, and "falls out of" is a prediction until measured.

3a. **D1028 — a NAMED alias of the composition** (*post-D1021*; filed 2026-09-01).
   `type JR = Json | E` delivers every arm the recursive alias contributed RAW — `f64`,
   `boolean`, `string` are check-clean invalid wasm at return, binding and argument, a
   `Json[]` value refuses loudly — while the struct arm and `null` land, and the direct
   spelling `Json | E` runs (that is what item 1 closed). The module spells `Json |
   JsonError` directly in every signature and so does not hit this; **the builder must
   not introduce `export type JsonResult = Json | JsonError`** until it closes, and a
   consumer who tidies the spelling into a name is the first to meet it. Probe
   `scripts/capability-probes/recursive-union-alias-named-composition.vl`.

4. **D1009 / D1010 — `Json | null` ↛ `Json` and null-bearing literals needing the `Json[]`
   annotation.** Both open, both loud check rejects. They are what makes the walking idiom
   four hoists deep (§2.8). Sequenced ahead of D1022 because the obvious WRONG repair of
   D1009 (`a != null && b != null` in a hand-written `deepEquals`) checks, runs and is
   silently wrong (usability F2).

5. **D1022 — named arm aliases in a recursive union.** `JsonObject`/`JsonArray` as members
   of the tree (checker) and as the type of a `Map()` binding (emitter). Emit half first:
   the `is` sites already run when the aliases are declared after the tree, and
   `let o: JsonObject = Map()` (`interned no mv slot`) is the line every builder writes
   (usability F7). Readability; not blocking.

6. **`==` over a union with struct or list arms** (*post-critique*, usability F4):
   `v == "b"` over a `Json` is `emitProgram: \`==\` over a struct union is not supported
   yet` **(RUN)** — clause 2, on the critical path of every round-trip test, and the
   reason a consumer writes `deepEquals` by hand. A capability probe belongs under
   `scripts/capability-probes/`.

7. **`===` parses** (*post-critique*, crosslang F4 / usability F8): the cycle scan's
   primitive (§2.7) and A15's ruled spelling; today `expected an expression but found
   EQUAL` **(RUN)**. Sequenced with item 8, which it is the primitive for.

8. **A15 build item 4 — `IdentitySet<T>`** — turns the renderer's `depth` report on a cycle
   into `cycle` at the back-edge. Sequenced by the identity ruling, not by this doc.

9. **Explicit type arguments at a call, and/or destination-driven inference of a
   return-only type parameter** — stage 3's `fromJson<T>` cannot be called without one of
   them. Already on A15's list (`Map<string,i32>()`); named here as the thing stage 3's
   naming depends on.

10. **`f64 as i32` out of range** — traps today (`3000000000.0 as i32` → `wasm trap:
    integer overflow` **(RUN)**); §6 question 2 asks whether it saturates. One instruction
    (`i32.trunc_sat_f64_s`) if ruled so.

11. Minor: `fromCodePoints` requiring a NAMED `i32[]` binding (emit refusal on an inline
    literal, `compiler/wasmEmit.vl:14356`) — the builder uses a named buffer as fmt does; a
    clause-2 refusal worth a probe when someone is in that file.

---

## 6. Open — the owner's three questions

The critique round's five decisions (names; silent rounding; the single error type;
`string`-only input; helpers) came back unanimous on four and split on one. The four are
closed above (§2.4, §2.3, §2.2, §2.9). What remains, with the synthesis's recommendation
in bold (`docs/internals/json-critique-synthesis.md` §2 has the votes and the
measurements):

1. **Helpers** — (a) none in v1; (b) `jsonGet`/`jsonAt` returning `Json`, missing = null;
   **(c) one `jsonPointer(self: Json, pointer: string): Json | JsonError`, RFC 6901,
   `kind: "missing"` keeps missing distinct from a stored null.** §2.8 has all three.
2. **`f64 → i32` off the wire** — (1) ship `asExactI32`/`asExactI64` (`: i32 | null`) in
   `std:fmt` beside `parseI32`: **yes**, with the `std-api-reviewer` pass. (2) What
   `f64 as i32` does out of range — trap (today), **saturate** (Rust; `i32.trunc_sat_f64_s`,
   NaN → 0), or wrap (JS `|0`). A language ruling for `DECISIONS.md`, on every consumer's
   path.
3. **`string | "err"`** (D1024's question) — **collapse** the subsumed
   literal into its base (TypeScript's rule; a hint says the arm is inert), or keep it as
   a distinguishable arm. A language ruling for `DECISIONS.md`; nothing in this module
   spells either.

Everything else the three critiques raised is either taken (§1–§2 above, each marked
*post-critique*) or a build item (§5). The builder is briefed after these three are ruled
and D1021 closes.

---

## Appendix: what was RUN (2026-09-01, `VL_STD=$PWD/std`, run from the worktree root)

Each block is a paste. Outcome on the line above it.

**D1021 — check rc 0, invalid wasm `type mismatch: expected (ref $type), found (ref $type)`
in `p`:**

    type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
    type E = { at: i32, kind: "syntax" | "depth", msg: string }
    function p(self: string): Json | E {
      if self.length == 0 { return { at: 0, kind: "syntax", msg: "empty" } }
      return 2.5
    }
    const r = "".p()
    print(r == null)

**Non-recursive twin — RUNS `empty`, `2.5`:** the same program with
`type J = null | boolean | f64 | string | f64[] | { [string]: f64 }` in place of `Json`,
plus `if r is E { print(r.msg) }` and `const r2 = "x".p(); if r2 is f64 { print(r2) }`.

**Literal arm — loud `union box atom test on a union with no recorded members: Json|string`:**
`function p(self: string): Json | "err" { if self.length == 0 { return "err" } return 2.5 }`.

**Carrier struct — RUNS `empty`, `2.5`:**

    type R = { value: Json, error: E | null }
    function p(self: string): R {
      if self.length == 0 { return { value: null, error: { at: 0, kind: "syntax", msg: "empty" } } }
      return { value: 2.5, error: null }
    }
    const r = "".p(); const e = r.error; if e != null { print(e.msg) }
    const r2 = "x".p(); const v = r2.value; if v is f64 { print(v) }

**D1022 — check error `` `is` check type 'JsonObject' is not a variant of Json `` and
`push: cannot add {[string]: Json} to Json[]`:**

    type JsonObject = { [string]: Json }
    type JsonArray = Json[]
    type Json = null | boolean | f64 | string | JsonArray | JsonObject
    function kind(v: Json): string { if v is JsonObject { return "object" } return "other" }
    let o: JsonObject = Map()
    o["k"] = 1.5
    let a: JsonArray = []
    a.push(o)
    print(kind(a))

Declared after the tree (`type Json = … | Json[] | { [string]: Json }` first, aliases
second): check passes, `let o: JsonObject = Map()` refuses at emit — `unsupported map value
type (… interned no mv slot)`. Non-recursive control `type O = {[string]: f64}; type J =
null | f64 | O` — `is O` RUNS.

**Cycle representable — RUNS `2` and `1`; naive walk TRAPS `call stack exhausted`:**

    type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
    let a: Json[] = []
    a.push(1.0)
    a.push(a)
    const v: Json = a
    if v is Json[] { print(v.length) }

    let m: { [string]: Json } = Map()
    m["self"] = m
    const w: Json = m
    if w is { [string]: Json } { print(w.size) }

    function depth(v: Json): i32 {
      if v is Json[] {
        let best = 0
        let i = 0
        while i < v.length { const d = depth(v[i]); if d > best { best = d }; i = i + 1 }
        return best + 1
      }
      return 0
    }
    print(depth(a))

**Recursion budget — `1000`, `10000`, then TRAP at `100000`:**
`function nest(n: i32): i32 { if n == 0 { return 0 } return nest(n - 1) + 1 }`.

**Numbers — `toString` prints `1 0.1 0 1e+21 1e-7 123456789012345680000 9007199254740992
0.30000000000000004 Infinity NaN 5e-324 1.7976931348623157e+308`; `parseF64` accepts `01`,
`NaN`, `Infinity`, `1E+2`; rejects `.5`, `1.`, `" 1"`:**

    import { toString, parseF64 } from "std:fmt"
    const xs: f64[] = [1.0, 0.1, -0.0, 1e21, 1e-7, 123456789012345680000.0, 9007199254740993.0,
                       0.30000000000000004, 1.0 / 0.0, 0.0 / 0.0, 5e-324, 1.7976931348623157e308]
    let i = 0
    while i < xs.length { print(toString(xs[i])); i = i + 1 }
    print("01".parseF64() == null)        // false — accepted
    print(".5".parseF64() == null)        // true
    print("1.".parseF64() == null)        // true
    print("NaN".parseF64() == null)       // false — accepted
    print("Infinity".parseF64() == null)  // false — accepted
    print(" 1".parseF64() == null)        // true

**Strings are bytes — `10`, `97`, `195`; map order — `b c a`; `to` is inclusive — `0 1 2 3`:**

    const s = "aé€😀"
    print(s.length); print(s[0]); print(s[1])

    let m: { [string]: i32 } = Map()
    m["b"] = 1; m["a"] = 2; m["c"] = 3
    m.delete("a"); m["a"] = 4
    for k in m { print(k) }

    for i in 0 to 3 { print(i) }

**Generics — `monomorphize: a return type parameter of `zero` is not bound by any
parameter`; `zero<i32>()` is a parse error:**

    function zero<T>(): T[] { return [] }
    const xs: i32[] = zero()
    print(xs.length)

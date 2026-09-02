# `std:json` v1 — the surface, and what the compiler has to grow to serve it

> Status: **PROPOSED 2026-09-01 — for critique, then a ruling.** This is serde stage 1
> (`docs/serde-design.md` §Recommendation, ruling G): a real `Json` VALUE TREE plus a
> parser and a renderer over it. Nothing here is built. The owner answered seven surface
> questions on 2026-09-01 and those answers are recorded in §0 as facts this doc does not
> re-open; everything else is a proposal with its alternatives beside it.
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
  at: i32,                                   // byte offset into the input (parse) or into
                                             // the output produced so far (render)
  kind: "syntax" | "duplicate" | "depth" | "nonfinite",
  msg: string,
}

export function parseJson(self: string): Json | JsonError
export function toJson(self: Json): string | JsonError
```

That is the whole of v1: one type, one error type, two functions. Two more are named now so
their signatures are fixed before a consumer forces them, but are **not** in v1:

```vl
export function toJsonPretty(self: Json, indent: i32): string | JsonError   // §2.6
export function jsonKind(self: Json): "null" | "boolean" | "number" | "string" | "array" | "object"
```

And the names the later stages will take, so v1 does not squat on them (§2.4):

```vl
// stage 3, docs/serde-design.md — the typed pair; NOT part of this module's v1
export function fromJson<T>(self: string): T | JsonError
export function toJson<T>(self: T): string | JsonError        // generalises v1's toJson
```

A parse never traps and never returns a partial tree. A render never traps, never emits a
partial document, and fails only on a value JSON cannot carry (`nonfinite`) or a tree it
cannot finish (`depth`, which is also how a cycle surfaces until the seen-set lands).

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

### 2.2 The error type is a struct with a literal-union `kind`, and `at` is a byte offset

```vl
type JsonError = { at: i32, kind: "syntax" | "duplicate" | "depth" | "nonfinite", msg: string }
```

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
  exceeds the cap (§2.7), on parse OR render. `nonfinite` — render only: an `f64` arm holds
  `NaN` or `±Infinity` (§2.5). A fifth, `cycle`, arrives with the seen-set (§2.7) and is
  named here so the union grows rather than reshapes.
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
throws `SyntaxError` for parse and `TypeError` for stringify. The critique may disagree.

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
- **Range is not a parse failure**, inherited from fmt: `1e999` parses to `Infinity`, which
  the tree can hold and the renderer will then refuse (§2.5). JS does the same
  (`JSON.parse("1e999")` is `Infinity`); serde_json errors (`number out of range`). Named as
  a critique item: a parse that produces a value the renderer refuses is a round-trip that
  fails one step late.

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

**The alternatives the critique should weigh:** `jsonParse`/`jsonRender` (noun-first, like
`pathKind`); `decodeJson`/`encodeJson` (the utf8/base64 verb pair — but those are
byte-level codecs, and JSON is text); `Json.parse` (no namespaces in VL today).

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
intentional null. The `at` for a render error is the byte offset into the output produced
so far, which locates the offending value by position in the document being written;
the msg carries the key/index path when the walker has one.

`-0.0` renders as `0` (ECMA-262, inherited from `toString`; JS does the same). It does not
survive a text round trip and the doc says so rather than special-casing it.

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
an `indent: i32` on the main entry would be a magic-number parameter on every call, and the
std rubric prefers two names to a mode switch. Signature fixed now so the name is not taken
by something else: `toJsonPretty(self: Json, indent: i32): string | JsonError`, two-space
indent being `2`, newline after every element, `": "` after keys — the JS/serde layout.
**Not in v1** until a consumer names it; the first is likely `vl fmt`-adjacent tooling or a
config rewriter.

Escaping on output, all four agree on the RFC minimum and differ above it: `"`, `\`, and
control characters U+0000–U+001F are escaped (`\n \t \r \b \f`, else `\u00XX`);
**non-ASCII is emitted raw as UTF-8** (JS, serde; Python escapes it by default with
`ensure_ascii=True`; Go additionally HTML-escapes `<`, `>`, `&` by default). Raw is right:
the output is a VL string, VL strings are UTF-8 bytes, and escaping non-ASCII quadruples the
size of every non-English document for the benefit of no consumer VL has. `/` is not
escaped (RFC permits either; nobody's default escapes it).

### 2.7 Depth cap 128, on both directions; a cycle is a `depth` error until the seen-set lands

Both are measured facts about the tree, not hypotheticals:

- **The tree can hold a cycle (RUN):** `let a: Json[] = []; a.push(a)` checks and runs, and
  so does `m["self"] = m` on the map arm. A naive recursive walk over either is
  `wasm trap: call stack exhausted` **(RUN)** — a trap, not an error a program can handle.
- **The recursion budget is finite and not huge (RUN):** a two-line self-call survives
  10,000 frames and traps at 100,000. A parser frame is larger. A hostile document of
  `[[[[[…` at a few thousand levels would trap the parser without a cap.

**Cap = 128**, serde_json's number, applied to parse (nesting of arrays/objects in the
input) and to render (nesting of the tree being walked). No real document is 128 deep;
every DoS document is. **A cycle exceeds any cap** and therefore surfaces as `kind:
"depth"` with `msg` saying the cap was reached — correct, deterministic, and slightly
misnamed. When A15 build item 4 lands `IdentitySet<T>`, the renderer keeps the ancestors of
the current node in one and reports `kind: "cycle"` at the first back-edge, with `at` at the
position the repeated node would have been written; the depth cap stays as the floor for
the deep-but-acyclic case. This is the serde §Cycles ruling applied to one surface: detect,
error, depth-cap floor, unsafe fast path not offered.

**Considered — make the cap a parameter.** No: it is a safety floor, not a tuning knob, and
no consumer has named a need. JS has no cap and stack-overflows; Python's is the interpreter
recursion limit (~1000); Go has none for `Unmarshal` into `interface{}` (it caps at 10,000
since 1.15). If a consumer needs deeper, the number moves, once, in the header.

### 2.8 No accessor helpers in v1 — the walking idiom, and the one helper worth naming

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
keeps it, §2.1). **Declined for v1 on two grounds**, either of which the critique may
overturn:

1. `get`/`at` are the two most generic names in the language and would land in every
   importer's flat scope (`import { parseJson } from "std:json"` does not import them, but
   `get` as a std export name sets a precedent that `std:collections` will want back).
   `jsonGet`/`jsonAt` are the noun-first spellings; ugly enough that it is worth waiting for
   a consumer to say the four-`is` idiom hurts before paying it.
2. **The idiom's cost is mostly a compiler gap, not a library gap.** Two of its four
   hoists exist only because of D1009 (`Json | null` does not narrow to `Json` though `null`
   is an arm) and the general rule that a field/element read must be hoisted before `is`.
   Fixing those makes the idiom `if r is {[string]: Json} && r["users"] is Json[] && …`,
   which is what the helpers were for. Build the language, then see if the helpers are
   still wanted.

**The one helper worth naming now**: `jsonKind(self: Json)` returning the JSON type name
as a literal union, because "what is this" is the first question every generic walker asks
(a pretty-printer, a schema checker, a diff), and the six-way `is` ladder to answer it is
the same nineteen lines in every one of them **(RUN — the ladder works today on the
structurally-spelled tree)**. Deferred with the pretty printer as its first consumer.

### 2.9 Strictness — RFC 8259, ruling A, and the std:utf8 precedent

What `parseJson` accepts is exactly RFC 8259 text, and nothing more:

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
| leading BOM | error | error | error | error | error |
| whitespace: only ` \t\n\r` | yes | yes | yes | yes | yes |
| top-level scalar `2` | yes | yes | yes | yes | yes |

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
(serde has `from_slice`; Go takes `[]byte`): the file→JSON pipeline is
`readFile(p)` → `decodeUtf8()` → `parseJson()`, three steps that each own one failure
kind, rather than one function with an `IoError | Utf8Error | JsonError` return. If the
three-step pipeline turns out to be the only way anyone ever calls it, a `u8[]` overload
is a later, additive export.

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

2. **D1009 / D1010 — `Json | null` ↛ `Json` and null-bearing literals needing the `Json[]`
   annotation.** Both open, both loud check rejects. They are what makes the walking idiom
   four hoists deep (§2.8); the helpers were declined partly on the strength of these being
   fixed rather than worked around.

3. **D1022 — named arm aliases in a recursive union.** `JsonObject`/`JsonArray` as members
   of the tree (checker) and as the type of a `Map()` binding (emitter). Readability of
   every consumer's `is` chain; not blocking.

4. **A15 build item 4 — `IdentitySet<T>`** — turns the renderer's `depth` report on a cycle
   into `cycle` at the back-edge. Sequenced by the identity ruling, not by this doc.

5. **Explicit type arguments at a call, and/or destination-driven inference of a
   return-only type parameter** — stage 3's `fromJson<T>` cannot be called without one of
   them. Already on A15's list (`Map<string,i32>()`); named here as the thing stage 3's
   naming depends on.

6. Minor: `fromCodePoints` requiring a NAMED `i32[]` binding (emit refusal on an inline
   literal, `compiler/wasmEmit.vl:14356`) — the builder uses a named buffer as fmt does; a
   clause-2 refusal worth a probe when someone is in that file.

---

## 6. Questions for the critique round

Three agents, three angles, each writing `docs/internals/json-critique-<angle>.md`:

- **crosslang** — does any row of the tables in §2.3, §2.5, §2.6, §2.9 misstate what JS,
  serde_json, Go or Python actually do, and is there a behaviour one of them gets right that
  this surface gets wrong? In particular: the >2⁵³ silent rounding vs a `precision` error;
  `1e999` parsing to a value the renderer refuses; lone surrogates.
- **std-consistency** — grade the surface against `docs/internals/std-api-review.md` and
  the fs/fmt/utf8/base64 headers: names (§2.4 alternatives), the single error type for
  both directions (§2.2), `string` not `u8[]` (§2.9), the declined helpers (§2.8), the
  deferred-but-named exports (`toJsonPretty`, `jsonKind`) — is naming a signature you do
  not ship "speculative" under the rubric, or is it the cheapest moment to be critical?
- **usability / checker** — write the three programs a real consumer writes (read a config
  file into a struct-shaped tree; build and render a response; round-trip a document and
  diff it) against the idiom in §2.8 and §3, on the seed, and report what the narrowing
  gaps cost in lines and in wrong turns. Is the helper decline right, and is D1009/D1010 the
  whole of the cost or is there a third gap the idiom hides?

Decisions the owner will be asked to make after synthesis (the current proposal in bold):

1. Names — **`parseJson`/`toJson`** vs `jsonParse`/`jsonRender` vs `decodeJson`/`encodeJson`.
2. Large integers — **silent rounding, documented, stage 3 exact** vs `precision` error.
3. Helpers — **none in v1** vs `get`/`at` (or `jsonGet`/`jsonAt`) now.
4. Error type — **one `JsonError` for both directions** vs a render-side twin.
5. Input type — **`string` only** vs `string` + `u8[]`.

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

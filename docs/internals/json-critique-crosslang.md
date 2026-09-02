# Cross-language critique of `docs/json-design.md`

> Status: **CRITIQUE, 2026-09-01, of `docs/json-design.md` as of commit `e40ffbf8`.**
> Angle: cross-language correctness — does every cell of the tables in §2.1/§2.3/§2.5/§2.6/§2.9
> say what JS, Go, Python and serde_json actually do, and what did each of them pay for its
> choice. Written from spec knowledge **without web access**; every claim I cannot check is
> marked *(recalled)*. Facts marked **(RUN)** were measured on the 2026-09-01 seed from this
> worktree (`VL_STD=<worktree>/std`, `VL_COMPILER_WASM=/home/verit/vl/build/vl-compiler.wasm`).

## Verdict in three sentences

The tables are unusually accurate — **31 of 36 cells I could grade are right**, and the two
rows the doc singles out for critique (lone surrogates, duplicate keys) are correct as filed and
land on the defensible side. The surface has **one behaviour no other implementation has**: a
document that `parseJson` accepts into a tree that `toJson` then refuses (`1e999` → `Infinity` →
`nonfinite`), which is not a trade-off any of the four made and is fixable at zero cost. Two
further changes are cheap and clearly right — **preserve `-0`** (VL is copying the one of four
that loses it) and **raise the depth cap off 128** (the strictest of the four by 78×, with no
escape hatch and a justification that is false for ASTs).

---

## A. The table audit, cell by cell

Every cell below is graded against the **schemaless** path (`Value` / `interface{}` / `dict` /
`JSON.parse`), which is what VL v1 is; where a language's *typed* path differs I say so, because
that is stage 3's precedent.

### §2.3 — number arm

| cell | verdict |
| --- | --- |
| JS `number` (f64); `9007199254740993` → `…992` silently | **right** |
| Go `float64`, or `json.Number` with `UseNumber` | **right**, incomplete: `UseNumber` is a method on `*json.Decoder` only — `json.Unmarshal` has no such option, so the funnel is unavoidable in the one-shot API |
| Python `int`/`float` by lexical form, exact | **right** |
| serde_json `Number` = i64/u64/f64 by lexical form, exact | **right**; add that `arbitrary_precision` (a Cargo feature) stores the decimal *lexeme* instead, and that beyond u64 the default falls back to f64 *(recalled — older versions errored)* |
| VL `f64`, `…992` **(RUN)** | **right** |
| "serde_json errors on `1e999` (`number out of range`)" | **right** — `ErrorCode::NumberOutOfRange` |
| "JS does the same" (`JSON.parse("1e999")` → `Infinity`) | **right** |
| *(missing)* Go on `1e999` | **Go errors**: `strconv.ParseFloat` returns `ErrRange` and the decoder reports `json: cannot unmarshal number 1e999 into Go value of type …`. So the split is 2–2, not 3–1 — see F1 |
| *(missing)* Python on `1e999` | accepts, `inf`, and `dumps` writes it back as `Infinity` |
| "`parseF64` is not the JSON number grammar" | **right (RUN)**, and the RFC 8259 §6 regex quoted is exact |

### §2.5 — `NaN` / `±Infinity` on render

| cell | verdict |
| --- | --- |
| JS → `null`, silently | **right** |
| serde_json → `null` for `Value` and for typed `to_string` | **right in outcome, wrong in mechanism** — `Value` never *holds* a NaN: `Number::from_f64` returns `Option`, `Value::from(f64::NAN)` is `Value::Null`, so the coercion is at CONSTRUCTION. Only the typed `serialize_f64` writes `null` at render. See F6 — the mechanism is the design lesson |
| Python → bare `NaN`/`Infinity`, invalid JSON, unless `allow_nan=False` raises | **right** (`ValueError: Out of range float values are not JSON compliant`) |
| Go → `json: unsupported value: NaN` | **right**, and exact; for ±∞ the string is `json: unsupported value: +Inf` / `-Inf` (`Str` comes from `strconv.FormatFloat(f,'g',-1,64)`) |
| "`-0.0` renders as `0` … JS does the same" | **right about JS, wrong as a defence** — Go emits `-0`, serde_json `-0.0`, Python `-0.0`. VL is copying the only one of four that loses it. See F7 |

### §2.6 — compact/pretty and escaping

| cell | verdict |
| --- | --- |
| JS compact; `space` argument | **right**; `space` may also be a **string** (first 10 chars), which is how you get tabs |
| Python not compact (`", "` / `": "`); `indent=` | **right**; add that with `indent` set the item separator loses its trailing space (3.4+), and `separators=(',',':')` is the compact idiom |
| Go compact; `MarshalIndent(v, prefix, indent)` | **right**; both params are `string` |
| serde_json compact; `to_string_pretty` | **right**; `PrettyFormatter::with_indent(&[u8])`, default two spaces |
| "all four agree on the RFC minimum" | **right** |
| "non-ASCII raw (JS, serde)" | **half wrong for JS** — since ES2019 "well-formed `JSON.stringify`", lone surrogates are emitted **escaped** (`\ud800`), so JS's output is always encodable. See F5(a) |
| "Python escapes non-ASCII by default (`ensure_ascii=True`)" | **right**; it also escapes U+007F |
| "Go additionally HTML-escapes `<`, `>`, `&`" | **right, incomplete** — Go *always* escapes U+2028/U+2029 too, even under `SetEscapeHTML(false)`, and `SetEscapeHTML` exists only on `*Encoder`, so `Marshal` cannot turn HTML escaping off. Go also replaces invalid UTF-8 with U+FFFD on marshal rather than erroring |
| "`/` is not escaped; nobody's default escapes it" | **right** for these four |

### §2.9 — strictness

| row | verdict |
| --- | --- |
| duplicate key: last wins ×4 | **right for the schemaless path**. Add: serde's **derive** path *rejects* duplicates (`duplicate field \`x\``), so ruling A matches serde's typed reader rather than departing from all four; Python's `object_pairs_hook` is the seam a caller uses to detect them |
| trailing comma, comment, single quotes | **right** ×4 ×3 |
| `NaN`/`Infinity` literals: only Python accepts | **right**; the knob is `parse_constant` on `loads` (`allow_nan` is a `dumps` argument, not a `loads` one) |
| leading zero `01` | **right** ×4; Python's message is `Extra data` at top level, not a number error |
| raw control char in a string | **right**; Python's knob is `strict=False` on `JSONDecoder` |
| lone surrogate `\uD800`: JS accept / Python accept / Go U+FFFD / serde error | **right, all four** — serde's code is `LoneLeadingSurrogateInHexEscape`; Go's `unquote` substitutes `unicode.ReplacementChar` with no error |
| leading BOM: error ×4 | **right**; Python has a dedicated message for the *bytes* case (`Unexpected UTF-8 BOM (decode using utf-8-sig)`) worth copying, and RFC 8259 §8.1 explicitly permits a parser to **ignore** a leading BOM instead — so this is a choice, not the RFC |
| whitespace ` \t\n\r` only | **right** ×4 |
| top-level scalar | **right** ×4 (RFC 8259 §2; it was RFC 4627 that required an object or array) |
| *(missing row)* trailing content after the value | see F8 — all four reject it, Go deliberately allows it in the streaming API |

### §2.1, §2.4, §2.8 — the smaller claims

- **"insertion order … JS and Python behaviour"** — right about Python (insertion-ordered dicts since
  3.7), **wrong about JS**: integer-like keys enumerate **first, in ascending numeric order**, so
  `JSON.stringify(JSON.parse('{"b":1,"2":2,"1":3}'))` is `{"1":3,"2":2,"b":1}`. Parse→render is *not* an
  identity on key order in JS — VL's map is **better** than JS here, not equal. Say so; it is a point for
  the design.
- **"Go sorts map keys on Marshal"** — right for `map[string]T`; **struct fields marshal in declaration
  order**. Pin that now: stage 3 should emit struct fields in declaration order (Go, serde, JS all do).
- **§2.4 name table** — all four cells right; nothing to change.
- **§2.8 accessor cells** — all four right (serde's `Index` on `&Value` is total, as stated). **Omitted**:
  serde_json also has `Value::pointer("/users/0/name")`, **RFC 6901 JSON Pointer** — one name, a standard,
  no squatting on `get`/`at`. See F10.

---

## B. Findings, ordered by how much they should change the surface

### F1 — `1e999` parses to a value the renderer refuses. No other implementation does this. *(change)*

**The doc says** (§2.3): "Range is not a parse failure, inherited from fmt: `1e999` parses to
`Infinity`, which the tree can hold and the renderer will then refuse (§2.5) … Named as a critique
item: a parse that produces a value the renderer refuses is a round-trip that fails one step late."

**What is actually true.** Every one of the four avoids that state, by one of two routes:

| | admits non-finite into the tree? | renders it |
| --- | --- | --- |
| JS | yes (`Infinity`) | `null` — lossy but total |
| Python | yes (`inf`) | `Infinity` — invalid JSON but self-consistent |
| Go | **no** — decode errors on `1e999` | n/a |
| serde_json | **no** — `NumberOutOfRange` at parse, *and* `Value` cannot hold a non-finite at all | n/a |
| **VL (proposed)** | **yes** | **`JsonError`** — the only accept-then-refuse in the set |

**(RUN)** `parseF64("1e999")` → `Infinity`; `parseF64("1e-999")` → `0`; `toString(-0.0)` → `0`.

**Evidence.** RFC 8259 §6: numbers such as `Infinity` and `NaN` "are not permitted". RFC 8259 §9
(Parsers): "An implementation may set limits on the range and precision of numbers." So refusing an
out-of-range literal is expressly a parser's right, and the owner has *already ruled* the same
invariant for the render side. serde_json's mechanism is the interesting one: it makes the bad value
unrepresentable (`Number::from_f64` → `Option`). VL's arm is a bare `f64`, so that route is closed and
the **parse boundary is the only place left to enforce it**.

**Recommendation: change.** `parseJson` refuses a numeric literal whose f64 conversion is not finite,
reusing `kind: "nonfinite"` — no new kind, and it buys a one-sentence invariant worth having:
***no non-finite `f64` ever exists inside a tree `parseJson` produced, so a parsed document always
re-renders.*** Underflow (`1e-999` → `0`) stays silent, matching all four, because `0` is finite and
renderable and the invariant still holds. *(Uncertain: whether Go's `strconv.ParseFloat` also flags
underflow with `ErrRange`; I believe it returns `0, nil`.)*

### F2 — the >2⁵³ section is missing the argument that decides it: VL's own wire round-trips wrong through VL's own tree. *(accept, amend the doc)*

**The doc says** (§2.3): silent rounding, documented, because a `precision` error "makes a document
holding one large id unparseable as a tree at all, which is the exact JS failure mode (`id_str`
exists because of it)", and "stage 3's typed decoder is the exact path".

**What is actually true.** The argument is right and the framing is one language short. Ruling B
(`serde-design.md` OQ-9) says **an `i64` is always a JSON number**. So a VL program's own output —
`{"id":9007199254740993}` — read back by VL's own `parseJson` is `9007199254740992`. This is not a
JavaScript-compatibility story; it is VL silently corrupting a document VL wrote, on the *schemaless*
path, which is exactly the path a router, a proxy or a config rewriter uses and exactly the path
stage 3 does not serve. The doc should make this argument, because it is the strongest one and it is
about VL.

**What it cost the others.**
- **JS**: the loss is unrecoverable at the API boundary — a `JSON.parse` reviver receives the
  *already-rounded* number — so the fix had to happen in the protocols: Twitter's `id_str` (added when
  snowflake ids crossed 2⁵³ around 2010), Discord and Stripe shipping all ids as strings from the
  start. TC39 is still repairing it: "JSON.parse source text access" (`JSON.rawJSON`, raw source in the
  reviver) reached stage 3 *(recalled; shipping in V8, version unsure)* — a language change fifteen
  years later for this exact defect.
- **Python** shows the other camp is not free: unbounded exact ints made `int("1"*N)` quadratic, which
  became **CVE-2020-10735** and was fixed in 3.11 (backported) by a *runtime limit*,
  `sys.set_int_max_str_digits`, default 4300 digits. "Just be exact" bought a CVE and a cap.
- **Go and serde** afford a lossy default for the reason VL does: their *typed* readers are exact, and
  those are what production code uses.

**Recommendation: accept silent rounding**, with three amendments the header owes:
1. State the VL↔VL hole in one sentence, and that stage 3's `fromJson<T>` is the answer — which means
   `parseJson` should not be recommended for VL↔VL traffic until stage 3 exists.
2. The interop bound is RFC 8259 §6's **±(2⁵³ − 1)**, not ±2⁵³ (2⁵³ itself is representable; 2⁵³+1 is not).
3. Record that the decision is **reversible at near-zero cost**: `parseI64` landed, and **(RUN)**
   `parseI64("9007199254740993")` is exact while `parseF64` of it is not — so an integer lexeme's
   exactness is one round-trip call away in the lexer that already scans it. A `precision` kind can be
   added later without redesigning anything; that is what makes "silent, documented" safe to choose now.

### F3 — depth cap 128 is the strictest of the four by 78×, with no escape hatch, on a justification that is false. *(change to ~1,000)*

**The doc says** (§2.7): "Cap = 128, serde_json's number … No real document is 128 deep; every DoS
document is." And: "Considered — make the cap a parameter. No: it is a safety floor, not a tuning knob."

**What is actually true.**

| | limit | escape hatch |
| --- | --- | --- |
| serde_json | **128**, deserialize only — *serialization of a deep `Value` has no limit and overflows the stack* | `Deserializer::disable_recursion_limit()`, `unbounded_depth` feature |
| Go | **10,000**, added in 1.15 for a stack-exhaustion DoS; `json: exceeded max depth` *(message recalled)* | none — but it is 78× higher |
| Python | interpreter recursion limit, default 1,000 → `RecursionError` | `sys.setrecursionlimit` |
| JS | none in the spec; deep input throws `RangeError` from the engine stack *(engine-dependent)* | none |

Two corrections. First, "no real document is 128 deep" is false for the documents people actually
serialise deeply: **ASTs** (a minified file's parse tree nests hundreds deep on chained expressions),
JSON Schema with expanded `allOf`, and any recursively-shaped message. Second, "every DoS document is"
is true at *any* cap — an attacker sends millions of levels — so the cap does not discriminate between
128 and 10,000; it only decides how many honest documents you refuse. **A cap should be set by the
victim's stack budget, not the attacker's.** VL's own measurement (§4, RUN) is 10,000 self-call frames
surviving and 100,000 trapping.

**Recommendation: change the number to ~1,000** and record it as a *stack-budget measurement* to be
re-taken once a real parser frame exists (a parser frame is several times a two-line self-call's), not
as a copied constant. Keep "not a parameter" — that part is right, and it is the only one of the four
that caps **both** directions, which is strictly better than serde and worth saying out loud.

### F4 — a cycle reported as `kind: "depth"` is the diagnostic three of four went back and fixed; and §5's dependency is heavier than the mechanism needs. *(change the sequencing)*

**The doc says** (§2.7): a cycle "surfaces as `kind: "depth"` … correct, deterministic, and slightly
misnamed", with `kind: "cycle"` deferred to A15 build item 4 (`IdentitySet<T>`).

**What is actually true.**

| | on a cycle |
| --- | --- |
| Go | `json: unsupported value: encountered a cycle via *main.Node` — added in 1.12; before that it overflowed the stack |
| JS | `TypeError: Converting circular structure to JSON`, and since ~2019 V8 prints the **property path** that closes the circle |
| Python | `ValueError: Circular reference detected` (`check_circular=False` disables it → `RecursionError`) |
| serde_json | **nothing** — a cyclic `Rc` graph recurses until the stack dies, which in Rust is an abort, not a catchable error |

So VL's proposal is better than serde and worse than the other three, and "slightly misnamed" understates
it: `depth` sends the reader to look for deep nesting in a document that has none.

**The mechanism does not need a set.** The depth cap already bounds the ancestor chain at ≤ cap entries,
so a **linear scan of an ancestor array under reference equality** is O(cap) per node with no hashing —
which is structurally what Python (`markers` dict) and Go (`ptrSeen`) do, minus the hash. The real
dependency is therefore **`===` alone**, not `IdentitySet<T>`: **(RUN)** `x === y` is a *parse error* on
today's seed, so neither is available, but `===` is ruled (A15) and is much less machinery than item 4.

**Recommendation:** re-sequence §5 item 4 onto `===`, and state explicitly that `==` must **not** be used
for the scan — VL's `==` over refs is structural and diverges on a cycle (`serde-design.md` §Cycles says
this; it deserves repeating where the walker gets written).

### F5 — four escaping/pretty cells to fix, one of which changes a signature the doc is fixing *now*. *(change)*

(a) **JS is not "raw non-ASCII" without qualification.** ES2019's well-formed `JSON.stringify` escapes
lone surrogates rather than emitting them, so JS is *lax on input and strict on output* — the exact
inverse of the framing in §2.9. Worth stating because it names the invariant VL should adopt:
**there is no input on which the renderer emits text it would not itself accept.**

(b) **Go escapes U+2028/U+2029 unconditionally**, even under `SetEscapeHTML(false)`, and `SetEscapeHTML`
exists only on `*Encoder` — `Marshal` always HTML-escapes. Go also replaces invalid UTF-8 with U+FFFD.

(c) **`toJsonPretty(self: Json, indent: i32)` is the one signature here that all four contradict** — every
one of them takes a **string** indent: JS `space` may be a string (≤10 chars), Python `indent=` may be a
`str` (3.2+), Go `MarshalIndent(v, prefix, indent string)`, serde `with_indent(&[u8])`. An `i32`
forecloses tabs permanently in a std with **no deprecation story**, and the doc's own reason for fixing
the signature now is that it will not be able to change later. Recommend **`indent: string`**; if `i32`
survives on ergonomics, the header must record the foreclosure, and must define `indent = 0` (JS: no
newlines at all; Go/serde: newlines with no indentation — the four disagree) and what a negative does.
Copy Python's post-3.4 detail while you are there: with indentation on, the item separator is `","` not
`", "`, so no line ends in whitespace.

### F6 — §2.5's serde cell is right in outcome and wrong in mechanism, and the mechanism is the lesson. *(doc fix, but it decides F1)*

`serde_json::Value` **cannot hold** a non-finite: `Number::from_f64(f64::NAN)` is `None` and
`Value::from(f64::NAN)` is `Value::Null`. Only the typed serializer writes `null` at render time. The
invariant serde maintains is *"everything in the tree is renderable"*, enforced at construction. VL's
`f64` arm is a raw primitive with no smart constructor, so VL **cannot** have that invariant by
construction — which is precisely why the check has to move to the parse boundary (F1). The doc should
carry this, because it turns F1 from a preference into the only remaining option.

### F7 — `-0.0` renders as `0`: VL is copying the one of four that loses the sign. *(change — one branch)*

`JSON.stringify(-0)` → `0`; Go → `-0`; serde_json → `-0.0`; Python → `-0.0`. RFC 8259's grammar admits
`-0` (`minus` then `zero`), and every reader that funnels through a double reconstructs the negative
zero. **(RUN)** `toString(-0.0)` is `0`, so the renderer inherits the loss from ECMA-262 unless it
special-cases it — `x == 0.0 && 1.0 / x < 0.0` → emit `-0`. That is the cheapest fidelity win in the
surface, it moves VL from 1-of-4 to 4-of-4, and §2.5's "the doc says so rather than special-casing it"
is a defence of the wrong default. **Recommendation: change**; keep the ECMA-262 renderer for everything
else.

### F8 — §2.9 is missing the row that catches the most real bugs: trailing content. *(add)*

All four reject a second value after the top-level one in the whole-string API — Python `Extra data`,
Go `invalid character '{' after top-level value`, serde `trailing characters`, JS `SyntaxError` — and
Go **deliberately allows** it in the streaming API (`json.Decoder` reads a sequence). VL's
`parseJson(self: string)` is the whole-string shape, so it must say: **trailing whitespace accepted,
trailing anything else is `syntax`**. Add the empty-input row too: an empty body is the single most
common real parse failure, and Go (`unexpected end of JSON input`) and serde (`EOF while parsing a
value`) both give it a distinguishable message rather than "unexpected byte at 0".

### F9 — "exactly RFC 8259 text, and nothing more" is wrong, and the true claim is stronger: this is I-JSON. *(doc fix, high value)*

§2.9 opens with "What `parseJson` accepts is exactly RFC 8259 text, and nothing more". It accepts
**less**: duplicates are rejected (RFC 8259 §4 says names "SHOULD be unique" and explicitly lists
"report an error" among the behaviours implementations have — so ruling A is *anticipated by the RFC*,
not a departure from it, which is a better thing to say than "stricter than every listed
implementation"), and lone surrogates are rejected though §7's grammar permits them (§8.2: such text is
"not interoperable" and receiving software's behaviour is "unpredictable").

The resulting profile — UTF-8 only, unique member names, no unpaired surrogates, numbers inside IEEE-754
double — is **RFC 7493 (I-JSON)** almost exactly. Naming the profile converts three apparent limitations
into one conformance claim the module header can make in a sentence, and it is the honest answer to
"why is the number arm only `f64`": *because I-JSON §2.2's advice is that numbers stay within double
range.* *(Uncertain, no web access: I-JSON's exact normative wording, and whether §2.2 additionally
recommends encoding >2⁵³ integers as strings. That last point is the open caveat at
`serde-design.md` lines 1890–1899; I can neither confirm nor refute the coordinator's recollection, and
I agree with the doc that ruling B does not rest on it either way.)*

### F10 — `at` on the render side is a position in a document the caller never receives. *(change)*

§2.2 defines `at` as "the byte offset into the output produced so far", and §1 promises a render
"never emits a partial document" — so the offset indexes a buffer that is thrown away. No implementation
reports a position for an encode error; three of four report a **path** (Go names the type path for a
cycle and the value for `NaN`; V8 prints the property chain that closes a circle; Python reports nothing).

**Recommendation:** say `at` is `0` on render errors, and put an **RFC 6901 JSON Pointer** (`/users/3/score`)
in `msg`. That is the same standard serde exposes as `Value::pointer(…)`, so if §2.8's helpers are ever
built the module gets one name and one standard rather than squatting on `get`/`at` — which also answers
decision 3 better than either option currently on the list.

---

## C. One thing each got right that this surface misses; one thing each got wrong

| | **got right** — adopt | **got wrong** — do not copy |
| --- | --- | --- |
| **JavaScript** | **Well-formed `JSON.stringify` (ES2019)**: the renderer is total *and* its output is always well-formed text. Adopt the invariant; F1 is the one place VL breaks it | **One unrepresentable value, three silent behaviours by position**: top-level `undefined` returns `undefined` (not a string), as an object property it is **dropped**, as an array element it becomes `null`. And `JSON.stringify(1n)` **throws** `TypeError` while `NaN` silently becomes `null` — same predicament, opposite answers. VL must give one value one behaviour at every position |
| **Go** | **Cycle detection with a named error and a type path** (1.12), and a **byte `Offset`** on decode errors — which is exactly what `at` is, and is the strongest precedent for it (Go's strings are UTF-8 bytes too) | **HTML escaping on by default in `Marshal`, unturnoffable** (only `Encoder.SetEscapeHTML(false)`), so the package's two entry points emit different bytes for the same value. A context-specific escape baked into a general codec |
| **Python** | **The number model is the caller's**: `parse_float=Decimal`, `parse_int`, `parse_constant`, `object_pairs_hook` — no default strands anyone. VL rules the policies globally (correctly, per the rubric), so the header owes a note on **what a caller does with a document they did not author and cannot fix**: today, nothing — there is no `parseJsonLax` | **`dumps` emits bare `NaN`/`Infinity` by default** — output that is not JSON and that only Python reads back. The default renderer must never emit non-JSON; the owner already ruled this way, and this is the evidence for it |
| **serde_json** | **The tree cannot hold a value the renderer refuses** (`Number::from_f64` → `Option`) — the invariant, enforced at construction. VL cannot enforce it there, so it must enforce it at parse (F1) | **`preserve_order` as a Cargo feature**: a compile-time flag that changes observable output and is subject to feature unification — one dependency turning it on silently changes your program's key order. VL's insertion order is right *because it is fixed*; never make key order a mode. Also: **no cycle detection at all** (F4) |

---

## D. RFC points the surface should cite or is quietly relying on

*Section numbers are RFC 8259's unless another RFC is named.*

1. **§8.1** — UTF-8 is required for interchange, and a parser **MAY ignore** a leading BOM. VL's "BOM is
   a syntax error" is a *choice* the RFC anticipates; record it as one (Python's dedicated BOM message is
   the model). §8.1 also underwrites the `string`-not-`u8[]` input decision.
2. **§9** — a parser may limit text size, nesting depth, number range/precision and string length. That
   one sentence authorises **both** the depth cap (§2.7) and F1's range refusal.
3. **§6** — the interoperable integer range is **[−(2⁵³)+1, (2⁵³)−1]**; `Infinity`/`NaN` are not permitted
   values. Cite for F2's bound and for F1.
4. **§4** — "names within an object SHOULD be unique", and the RFC itself names "report an error" as an
   implementation behaviour: ruling A is RFC-anticipated, not a departure.
5. **§8.2** — unpaired surrogates make a text non-interoperable and receiver behaviour unpredictable; the
   lone-surrogate refusal is the conformant reading for a UTF-8 string type.
6. **RFC 7493 (I-JSON)** — the profile VL is actually implementing; name it (F9). **RFC 6901 (JSON
   Pointer)** — the standard spelling for a render error's path (F10) and for any future accessor.
7. **Renderer UTF-8 guarantee.** §2.9 says the parser "copies string bytes through unchanged … and
   validates nothing about them", which reads as though invalid UTF-8 can reach the renderer and out into
   a document, violating §8.1. I probed the three plausible constructors and **could not build an invalid
   string (RUN)**: `decodeUtf8` is strict, `fromCodePoints([0xD800])` yields U+FFFD (`239 191 189`), and
   `padStart` pads in whole characters. So the guarantee holds — but it is held by the **string type**,
   not by this module. State it that way in the header, because it is the invariant that makes the
   parser's pass-through safe, and it is the one that would silently lapse if an unchecked
   bytes→string constructor ever landed.

---

## E. Verdict on the five decisions in §6

1. **Names — `parseJson` / `toJson`. VOTE: ACCEPT.** It matches fmt's parse+noun precedent and the
   four-language table; `decodeJson`/`encodeJson` is wrong because everywhere else in std that verb pair
   means a *byte* codec, and `jsonRender` has no cognate in any of the four. The claim that stage 3's
   `toJson<T>` at `T = Json` *is* v1's `toJson` holds up under OQ-7's untagged union rendering — the
   untagged render of the six arms is the tree walk — so the single name is real, not aspirational.
2. **Large integers — silent rounding, documented. VOTE: ACCEPT, with F2's three amendments.** A
   `precision` refusal would make VL unable to read a large share of real API responses, and JS's history
   shows the ecosystem answer to silent loss was to change *protocols*, not to ship refusing parsers;
   Python's exact-integer camp bought a CVE. Amend the doc with the VL↔VL round-trip argument, the
   ±(2⁵³−1) bound, and the note that `parseI64` makes the decision reversible.
3. **Helpers — none in v1. VOTE: ACCEPT, with a name reserved.** The decline is right *conditional on
   D1009/D1010 landing* — both JS and serde reach for a total accessor precisely because walking is the
   common case, so if the narrowing gaps stay open the four-`is` idiom becomes the module's public face.
   When helpers do land, take **`pointer()` (RFC 6901)** over `get`/`at`: one export, a standard, and no
   squatting on the two most generic identifiers in the language.
4. **Error type — one `JsonError` for both directions. VOTE: ACCEPT, and fix `at`.** serde_json's single
   `Error` is the precedent and it works. But the honest half of the split-type argument is `at`, which
   is meaningless on the render side (F10) — fix that and the split has no remaining case.
5. **Input type — `string` only. VOTE: ACCEPT.** Go and serde take bytes and Python accepts bytes with
   encoding auto-detection, and all of them then own the encoding question; VL's three-step pipeline puts
   it in `decodeUtf8` where it already lives, and RFC 8259 §8.1 makes UTF-8 the only interchange encoding
   worth accepting. One consequence to write down: a BOM arrives as U+FEFF and must be a `syntax` error
   at `0` with a message that names it.

**Two decisions that are not on the §6 list and should be** — both change the surface more than three of
the five above: **F1** (`1e999` refused at parse, reusing `nonfinite`) and **F3** (the depth cap number).
**F7** (`-0`) is a one-branch renderer change with no API consequence and should just be done.

# VL strings design — UTF-8 storage, a non-code-point-indexed API, and an ASCII fast path

> Status: **design / research only.** No compiler change is proposed for *now*,
> and this document changes none. It records the **long-term direction** for how a
> VL string is stored and indexed once self-hosting is done — surveying how other
> languages model strings, committing to a concrete shape for VL's WasmGC backend
> with rationale and rejected alternatives, and being honest about the one part
> that is genuinely identity-defining and still open (the surface API). As with
> `docs/collections-design.md` and `docs/modules-design.md`, **the `DECISIONS.md`
> entry lands with implementation, not before** — this is the mental model and the
> decision record so the eventual implementation PR is small and uncontested.

> **Hard constraint, read first: this does NOT change before bootstrap.** VL's
> current string is a WasmGC `array i32` of Unicode **code points** (one code point
> per `i32`, full range via `\u{1-6 hex}`); a char literal `'a'` is an `i32` code
> point; `s[i]` yields the `i32` code point in O(1); `.length` is the code-point
> count. That UTF-32-ish model is **fine for the near-term self-hosting compiler**
> (the compiler's own source is ASCII) and **must not be touched until the
> self-hosting port is done** (`ROADMAP` Track H). Everything below is the
> *target*, sequenced explicitly *after* bootstrap (§Migration). The current model
> stays until then.

## Summary / recommendation

**Storage → UTF-8.** A VL string becomes a packed WasmGC `array i8` of UTF-8 bytes,
replacing today's `array i32` of code points. This is the modern consensus
(Rust/Go/Swift-5/Zig/Elixir/Julia, and Python's compact ASCII representation): for
ASCII — which dominates real source, JSON, and most text — it is **1 byte per
character instead of 4** (a 4× memory win over today's model), and it is the
**interchange format of the outside world** (files, the web at >98%, network,
JSON), so host boundaries (`print`, file I/O) become **bulk byte copies instead of
per-element transcoding**. The decision here is firm. (§Storage)

**API → do NOT make the default subscript code-point-indexed.** This is the hard,
identity-defining part and the part this doc spends the most on. Over UTF-8,
indexing *by code point* is O(n), so a `s[i]`/`.length` that silently mean "code
point" would quietly degrade from today's O(1) to O(n) on every access. The owner's
position — which this doc adopts as the recommendation — is to follow the **Rust/Go
byte-indexed camp**: `.length` counts **bytes** (O(1)), `s[i]` yields the **byte**
at offset `i` (O(1)), and code points / characters are reached through **explicit
iteration**, not integer subscript. This is a real, surface-visible change from
today (where `s[i]` is a code point and `'a'` is a code point), and it collides with
the existing char-literal model — §API spells out exactly what changes, what the
options are, and what is recommended vs left open. **What is recommended:**
byte-length + byte-subscript as the O(1) primitives, code-point iteration as the
explicit path. **What is genuinely open:** whether `s[i]` should be *removed*
entirely (Swift's "no integer subscript") rather than redefined to a byte, and what
the char literal `'a'` denotes once strings are bytes (a byte? a code point? a
one-character string?). (§API)

**ASCII fast path.** Layer an "is this string pure ASCII?" bit into the string's
struct header (alongside the byte backing) — the PEP 393 / V8-Latin1 / Ruby
`coderange` / Swift idea. When the bit is set, byte offset == code point ==
character, so an *accurate* code-point `.length` and O(1) code-point indexing come
for free; when it is clear, code-point operations fall back to an O(n) scan (or a
built auxiliary index). This is an **optimization layered under whichever API the
section above picks — not a substitute for the API decision**, and it carries an
honest cost: the branch on every code-point operation, and maintaining the bit
across concat/append. (§ASCII)

The rest of the doc: the cross-language survey (storage encodings, then API/index
camps, then the small-string/ASCII-flag precedents), then the VL design (storage;
the API decision with options + recommendation; the ASCII fast path), then a phased
migration outline (explicitly **not before bootstrap**), then open questions for the
owner.

---

## Survey: how mainstream languages model strings

Three axes are independent and worth separating, because languages mix and match
them: (1) the **internal storage encoding** (the bytes in memory), (2) the
**surface API's unit of indexing/length** (what `s[i]` and `len(s)` mean), and (3)
**representation optimizations** (small-string inlining, per-string encoding flags).
A language's "string is UTF-8" claim is about axis 1; its "indexing is O(1)" claim
is about axes 2 and 3. Conflating them is the source of most confusion.

### Axis 1 — internal storage encoding

| Language | Internal storage | Notes |
|---|---|---|
| **Rust `String`/`&str`** | **UTF-8**, guaranteed valid | invalid UTF-8 lives in `Vec<u8>`/`OsString`, never `str` |
| **Go `string`** | **UTF-8** bytes, *not* guaranteed valid | a `string` is an immutable byte slice; `[]rune` is the decoded form |
| **Swift 5 `String`** | **UTF-8** (changed *from* UTF-16 in Swift 5, 2019) | native small-string + bridged forms; the move to UTF-8 was a headline Swift-5 change |
| **Zig** | **UTF-8** by convention; `[]const u8` is the string type | the language barely has a "string type" — it's a byte slice; std has UTF-8 helpers |
| **Elixir** | **UTF-8** binaries | a "binary" is a byte sequence; strings are UTF-8 binaries |
| **Julia** | **UTF-8** (`String`) | indexing is *byte*-indexed with character-boundary semantics (below) |
| **Python 3 (PEP 393)** | **flexible**: Latin-1 / UCS-2 / UCS-4 chosen per string by widest code point | "compact ASCII" strings are 1 byte/char; the API is still code-point-indexed (axis 2) |
| **Java / C# / JavaScript** | **UTF-16** | the legacy cohort — chose 16-bit when Unicode was assumed to fit in 16 bits |
| **C / C++ (`char*`/`std::string`)** | **bytes**, encoding-agnostic | usually UTF-8 by convention now; the type carries no encoding guarantee |

**Why UTF-8 won (the modern cohort).**

- **Space.** ASCII is 1 byte. Real text is ASCII-dominant — source code, JSON,
  HTML, logs, identifiers, protocol keywords are overwhelmingly ASCII, and even
  natural-language text in Latin scripts is mostly ASCII with occasional accents.
  UTF-32 storage is 4× the memory for that common case; UTF-16 is 2×. UTF-8 pays
  the multi-byte cost *only* for the code points that actually need it.
- **Interchange — zero transcoding at I/O.** Files, the web (>98% of pages are
  UTF-8), network protocols, and JSON are UTF-8. If the in-memory form *is* UTF-8,
  reading a file or writing to stdout is a **bulk byte copy**; if the in-memory form
  is anything else, every boundary crossing is a transcode. This is the decisive
  practical argument and the one that bites VL today (below).
- **ASCII superset.** Every ASCII byte is itself valid UTF-8, so the entire corpus
  of ASCII tooling, comparisons, and literals keeps working unchanged.
- **Self-synchronizing.** Continuation bytes (`10xxxxxx`) are distinguishable from
  lead bytes, so you can find a character boundary from any position by scanning at
  most 3 bytes backward — no need to read from the start. This is what makes
  byte-indexed slicing *checkable* (Rust's `is_char_boundary`).
- **No endianness, no BOM, no surrogate pairs.** UTF-16 has byte-order ambiguity
  (UTF-16LE vs BE, the BOM dance) and **surrogate pairs** — a single astral code
  point (emoji, rarer CJK) is *two* UTF-16 code units, so even UTF-16 is variable
  width, which defeats the only reason anyone chose it (the false belief that
  "one code unit = one character").

**The UTF-16 legacy cohort (Java/JS/C#/Win32).** All chose UTF-16 in the
mid-1990s when Unicode was a 16-bit standard and "wide char = one character" looked
true. Unicode then grew past 16 bits (astral planes), surrogate pairs were bolted
on, and the "fixed-width 16-bit char" premise collapsed — leaving these languages
with 2× the memory of UTF-8 *and* variable width *and* surrogate-pair hazards
(`"💩".length === 2` in JS; lone surrogates; `charAt` returning half a character).
This is widely regretted and is the cohort VL should *not* join.

**UTF-32 storage (≈nobody ships it as the string type).** Fixed-width 4-byte code
points give O(1) *code-point* indexing, which sounds appealing — but it costs 4×
memory for ASCII and, critically, **does not even deliver O(1) *grapheme* indexing**
(below), so it buys an O(1) for a unit (the code point) that *still isn't the
user-perceived character*. Almost no language uses UTF-32 as its string storage;
it appears only as a transient decoded form (Go's `[]rune`, Python's UCS-4 tier for
strings that need it). **This is exactly VL's current model** — and the reason this
doc exists.

### Axis 2 — the surface API: what does `s[i]` / `length` mean?

This is the contested axis, and the camps disagree fundamentally about what a string
*is a sequence of*.

| Camp | Languages | `length` counts | `s[i]` subscript | Code points reached via |
|---|---|---|---|---|
| **Byte-indexed** | **Rust `&str`**, **Go** | **bytes** (O(1)) | Rust: **no `str[i]`** (must use `&s[a..b]` byte ranges, panics off boundary); Go: **byte** `s[i]` (O(1)) | iterators — Rust `.chars()`, Go `for i, r := range s` |
| **Boundary-checked byte index** | **Julia** | bytes / `ncodeunits` (O(1)); `length(s)` counts *characters* (O(n)) | **character** at a byte index; **invalid (mid-character) indices throw** | `eachindex`, `nextind`/`prevind` walk valid byte offsets |
| **Grapheme / opaque-index** | **Swift `String`** | `count` = **grapheme clusters** (O(n)) | **no integer subscript at all** — `String.Index` is an opaque cursor | `.unicodeScalars` / `.utf8` / `.utf16` views, each its own collection |
| **Code-point-exposed** | **Python**, JS (per UTF-16 unit), C# | **code points** (Python) / UTF-16 units (JS) | **code point** `s[i]` in O(1) | already the default unit |

**Synthesized trade-offs.**

- **Byte-indexed (Rust/Go) — honest and fast.** `length` and `s[i]`/slicing are
  O(1) byte operations; the API never *pretends* a byte offset is a character. The
  cost is pushed where it belongs: iterating characters is an explicit `.chars()` /
  `range` loop, and slicing at a non-boundary is an error you must handle (Rust
  panics; `is_char_boundary` lets you check). This camp accepts that "index a
  character in O(1)" is *not a thing UTF-8 can do* and refuses to fake it.

- **Code-point-exposed (Python) — O(1) *because* it cheats on storage.** Python's
  `s[i]` is an O(1) code point only because PEP 393 picks a **fixed-width internal
  representation per string** (Latin-1/UCS-2/UCS-4), so the string is internally a
  flat array of equal-width units. That is an **axis-1 cost** (UCS-4 strings are 4×
  memory, exactly the UTF-32 problem) paid to make an axis-2 promise. You cannot
  offer O(1) code-point indexing *over UTF-8 storage* — the two are in tension, and
  Python resolves it by not storing UTF-8.

- **Grapheme / opaque-index (Swift) — most correct, heaviest, no integer
  subscript.** Swift's `String` is a collection of **grapheme clusters** (extended
  grapheme clusters — what a human calls "a character"), reached only through an
  opaque `String.Index` cursor; there is deliberately **no `s[5]`**. This is the
  most *semantically* correct model — it is the only one where `count` matches what
  a user would count by eye — but grapheme segmentation is O(n), needs Unicode
  tables, and the opaque-index ergonomics are notoriously awkward. It is the "do it
  right, pay for it" extreme.

**The key truth all of this dances around: even *code points* are not user-perceived
"characters."** A grapheme cluster — what a person points at and calls one
character — routinely spans **multiple code points**: an emoji with a skin-tone
modifier (base + modifier), a flag (two regional-indicator code points), an accented
letter written as base + combining mark, a ZWJ sequence (`👨‍👩‍👧‍👦` is *seven*
code points). So a fixed-width-per-code-point model (UTF-32, Python's UCS-4, today's
VL) buys O(1) indexing of a unit that **is still the wrong unit for "characters."**
This is Swift's lesson: if you actually want "the i-th character," you need grapheme
segmentation regardless of storage, and *no* integer-O(1) scheme gives it to you.
The honest conclusion is that the fixed-width simplicity is a simplicity that is
*still wrong* for real text — which removes most of the motivation to pay 4× memory
to preserve it.

### Axis 3 — representation optimizations (small strings, encoding flags)

Independent of storage and API, real implementations carry per-string metadata or
inline storage to make the common case fast:

- **Python PEP 393 — flexible string representation.** Each string records its
  "kind" (1/2/4 bytes per char) chosen from the widest code point present. A pure
  ASCII string is the compact 1-byte form with a fast path; the existence of a
  single astral code point promotes the *whole string* to UCS-4. This is the
  canonical "pick the narrowest fixed width" design.
- **V8 / JavaScriptCore — one-byte vs two-byte flag.** JS engines store a string as
  either **Latin-1 (one byte)** or **two-byte UTF-16** and carry a flag; a string
  that fits in Latin-1 (no code point > 255) uses the one-byte form, halving memory
  for the ASCII/Latin common case even though the *language* is UTF-16-semantic.
- **Ruby — `coderange`.** A string caches a *code-range* tag —
  `7BIT` (pure ASCII), `VALID` (valid multibyte), `BROKEN`, or `UNKNOWN` (recompute
  lazily). `7BIT` strings take ASCII fast paths for length, indexing, comparison;
  the tag is invalidated/recomputed on mutation.
- **Swift — small-string + ASCII fast paths.** Swift inlines short strings (≤15
  UTF-8 bytes) directly into the `String` value (no heap allocation) and has
  dedicated ASCII fast paths in comparison/iteration.
- **Rust — `is_ascii` / `str::is_char_boundary`.** Not a stored flag, but cheap
  helpers: `is_ascii()` scans (or SIMD-scans) for the high bit; `is_char_boundary`
  checks a byte offset in O(1) by looking at the lead/continuation bit. These are
  the primitives an ASCII fast path is built from.

The common thread: **a one-bit-or-few "this string is simple" tag, set at
construction and consulted on the hot operations, recovers fixed-width speed for the
ASCII case without paying fixed-width memory for everyone.** That is precisely the
shape §ASCII proposes for VL.

---

## VL design

### Context: what VL has today

From `compiler/defaultScope.ts`, `compiler/lexer.ts`, and `compiler/toWasm.ts`:

- **A string is a WasmGC `array i32` of Unicode code points.** `defaultScope.ts`
  models `string` as an `i32`-indexed object (`{[i32]:i32}`) — "an `i32`-indexed
  collection of char codes" — which gives it the same WasmGC `(array mut i32)`
  representation an `i32[]` gets, plus `.length` (`array.len`) and `s[i]`
  (`array.get`) "for free." One code point per `i32`, full Unicode range.
- **A char literal `'a'` is an `i32` code point.** The lexer (`lexer.ts`) decodes a
  single-quoted literal to exactly one code point (empty `''` and multi-char `'ab'`
  are hard errors; `\u{1-6 hex}` admits the full range) and the parser lowers it to
  that code point's `i32`. So `'a'`, `s[i]`, and `s.charCodeAt(i)` are all the same
  kind of thing: an `i32` code point.
- **`s[i]` is O(1) and yields the `i32` code point; `.length` is the code-point
  count.** Both are native WasmGC array ops on the backing `array i32`.
- **String methods** (`slice`, `indexOf`, `includes`, `charCodeAt`, `+` concat,
  `==`) all operate in **code-point units** and are lowered by name in `toWasm.ts`
  (`__string_eq__`, `__print_string__`, etc.). `slice(start, end)` is a code-point
  range.
- **Host boundaries transcode per element.** `__print_string__` "streams a string's
  char codes to the host one at a time" and `__store_string__` copies char codes as
  bytes into linear memory — i.e. every boundary crossing walks the `i32` array and
  converts, because the host deals in UTF-8 bytes and the string is `i32` code
  points.

This is the **UTF-32-ish model from the survey**: simple, O(1) code-point indexing,
but **4× memory for ASCII** and **per-element transcoding at every host boundary.**
It is genuinely *fine* for bootstrapping (compiler source is ASCII, strings are
small, correctness over speed) and is explicitly not to be changed before then.

### Storage: UTF-8 (`array i8`) — DECIDED direction

**Decision.** A VL string is stored as a packed WasmGC **`array i8` of UTF-8
bytes**, replacing the `array i32` of code points.

```
string  ≅  (array i8)                 ;; the bytes (today: (array i32) of code points)
        — or, with the §ASCII flag —
string  ≅  (struct (field $bytes  (ref (array i8)))
                   (field $ascii  i8))   ;; 1 = provably pure ASCII (§ASCII)
```

**Rationale — the survey's UTF-8 case, applied to VL's WasmGC backend.**

- **4× leaner for ASCII, and ASCII is the common case.** Today's `array i32` spends
  4 bytes on every character; over UTF-8 an ASCII string is `array i8`, 1 byte per
  character. VL source (and the self-hosted compiler's own text), JSON, identifiers,
  and most real strings are ASCII-dominant — so this is a 4× memory win on the
  overwhelmingly common string, paying multi-byte cost only where a code point
  genuinely needs it.
- **Zero-transcode host boundaries — bulk copies, not per-element conversion.** The
  host (print, file I/O) already deals in UTF-8 bytes. Today `__print_string__` and
  `__store_string__` walk the `i32` array converting each code point; with UTF-8
  storage the bytes *are already* what the host wants, so the boundary becomes a
  **bulk `array.copy` of `array i8` into linear memory** (or a direct byte stream)
  instead of an O(n) per-element transcode. This is the same bulk-copy win the
  collections design leans on for `concat`/`extend`, here applied to I/O.
- **It is the interchange format.** Reading a UTF-8 file into a VL string and
  writing a VL string out are byte copies; no encode/decode step exists to get wrong
  or to slow down.
- **WasmGC makes it natural.** `array i8` is a first-class packed WasmGC array type
  (the same interning machinery `arrayType()` already uses, just `i8` element type);
  `array.get_u`/`array.get_s` read a byte, `array.copy` does bulk moves. The backend
  primitives are all present.

**What this costs / what gets harder (honest).**

- **Indexing is no longer "grab the i-th `i32`."** Over UTF-8, the i-th *byte* is
  O(1) but the i-th *code point* requires decoding from the start (or from a known
  boundary) — O(n). Every operation that today is "an `array.get` on the `i32`
  array" must be re-examined for what unit it indexes. This is the whole of §API.
- **Validity.** Rust guarantees `str` is *valid* UTF-8; Go does not. VL must pick
  (see §OQ) — guaranteed-valid is cleaner for iteration but requires validating at
  every boundary where bytes enter (file reads, FFI); unchecked is faster in but can
  surface malformed sequences. The lexer already only *produces* valid code points,
  so internally-constructed strings are valid by construction; the question is bytes
  coming *in* from the host.
- **Char/code-point literals re-open.** `'a'` is an `i32` code point today; once
  strings are bytes, what a char literal denotes is no longer obviously "an element
  of the string." Covered in §API.

The storage decision is firm. The contested part is what the *API* over those bytes
looks like — next.

### API: do NOT make the default index code-point-based (the hard part)

This is the identity-defining decision and the one with the most genuinely-open
surface. The forcing constraint: **over UTF-8 storage, code-point indexing is O(n).**
So a `s[i]`/`.length` that mean "code point" would take today's O(1) operations and
silently make them O(n) — the worst kind of regression, invisible at the type level,
showing up only as a slow loop. The owner's principle, adopted here: **most users do
not actually want to index by code point** (and when they think they do, they
usually want graphemes, which no integer index gives — the Swift lesson), **so the
default API must not force a code-point cost.**

#### What changes from today (be precise)

Today: `'a'` is an `i32` code point; `s[i]: i32` is the i-th code point (O(1));
`.length: i32` is the code-point count; `slice`/`indexOf` work in code points. Every
one of those is built on "the string is an `array i32`, one code point per element."
Moving storage to `array i8` breaks that identity — the i-th *element* is now a
*byte*, not a code point. So *something* in the surface must change. The options
differ in **what `s[i]` becomes**, **what `.length` counts**, **how you get code
points**, and **what `'a'` means.**

#### Option A — Byte-indexed (Rust/Go camp) — RECOMMENDED

- **`.length` counts bytes**, O(1) (`array.len` on the `array i8`).
- **`s[i]` yields the byte at offset `i`** as an `i32` (0–255), O(1) — a direct
  `array.get_u`. The index is a byte offset; `s.length` is its bound.
- **Code points are reached by explicit iteration**, not subscript:
  `for cp in s.codePoints()` (decoding UTF-8 as it walks), and a
  `s.byteAt(i)`/`s[i]` for raw bytes. Slicing is by **byte range** (`s.slice(a, b)`
  over byte offsets), and slicing across a code-point boundary is an error (Rust's
  model) or is checked (`isCharBoundary(i)`).
- **`indexOf`/`includes` return byte offsets**; `charCodeAt(i)` is reinterpreted or
  removed (see below).

**Why recommended.** It is **honest and O(1)**: nothing pretends a byte offset is a
character, and every advertised-O(1) operation truly is. It matches the storage (the
index unit *is* the storage unit), it is the camp two systems languages with the
same "pay-for-what-you-use, no hidden cost" ethos as VL chose, and it keeps the
fast operations fast. It pairs naturally with the ASCII fast path (§ASCII): for an
all-ASCII string, byte offset == code point == character, so byte indexing *is*
character indexing for the common case, for free.

**Reconciling with VL's existing char-literal + `s[i]` model — what actually
changes.** This is the migration-visible part:

1. **`s[i]` changes meaning from "code point" to "byte."** Today `s[i]: i32` is a
   code point in 0–0x10FFFF; under Option A it is a byte in 0–255. For pure-ASCII
   strings (everything the bootstrap compiler touches) **the value is identical** —
   `'a'` is 97 either way — so the change is invisible to ASCII code and only
   observable when a character needs multiple bytes. This is why the migration can
   be sequenced after bootstrap with low churn on existing ASCII-only `.vl` code.
2. **`.length` changes from code-point count to byte count.** Same story: identical
   for ASCII, divergent only for multi-byte text.
3. **Iteration must yield something defined.** `for x in s` today yields code points
   (`i32`s). Under Option A the choice is: keep `for x in s` yielding **code points**
   (the ergonomic, "characters-ish" default, decoding as it walks — O(n) total but
   that's the cost of *wanting* code points) while subscript/`.length` are bytes; or
   make `for x in s` yield **bytes** to match subscript and require
   `s.codePoints()` for decoding. **Recommendation: `for x in s` yields code
   points** (iteration is where you *want* the character-ish unit and where O(n) is
   already implied), subscript/length are bytes (random access is where you want
   O(1) and a byte is honest). This split — iterate code points, index bytes — is
   exactly Go (`for i, r := range s` yields runes; `s[i]` is a byte).
4. **The char literal `'a'`.** This is the sharpest collision and is left **open**
   (§OQ): once strings are byte-indexed, `'a'` as an `i32` code point no longer
   matches "an element of the string" (an element is now a byte). Three coherent
   resolutions: (a) **`'a'` stays an `i32` code point** — clean for the
   `codePoints()` iteration (`for cp in s { if cp == 'a' }` still works), but `'a'`
   no longer equals `s[i]` for the same character beyond ASCII; (b) **`'a'` becomes
   a byte** — matches `s[i]`, but then `'é'` (2 bytes) cannot be a char literal,
   which is a real expressiveness loss; (c) **`'a'` becomes a one-character
   `string`** (Swift's `Character`), the most correct but the biggest surface
   change. The recommendation leans (a) — keep `'a'` a code point, paired with
   code-point iteration — but flags it as the genuinely-open identity question.

#### Option B — No integer subscript (Swift camp)

Remove `s[i]` entirely; expose `s.codePoints()` / `s.bytes()` views and an opaque
index for slicing. Most semantically correct (it refuses to hand out a misleading
integer index), but the heaviest ergonomic change and the furthest from VL's
existing "`s[i]` is an `array.get`" model. **Rejected as the default** because VL's
whole string identity today is index-based and the self-hosting lexer indexes
constantly; ripping out subscript is a larger surface break than the byte-indexed
redefinition, for a correctness gain (graphemes) the language can add *later* as a
`s.graphemes()` view without removing subscript. Worth revisiting only if VL decides
to chase grapheme-correctness as a headline feature.

#### Option C — Keep code-point indexing over UTF-8 (O(n) subscript) — REJECTED

Preserve today's surface (`s[i]` is the i-th code point, `.length` is the code-point
count) but over UTF-8 storage, making each `s[i]` an O(n) decode-from-start. This is
the **trap** the owner explicitly wants to avoid: the surface looks unchanged and
existing code compiles, but a `for i in 0 to s.length { s[i] }` loop silently goes
from O(n) to **O(n²)**. Rejected — it is the one option that makes performance
*worse than today* while looking the same, which is the most dangerous outcome. (An
auxiliary code-point→byte-offset index could restore O(1) per access, but that is a
per-string side table costing O(n) memory — re-introducing the UTF-32 memory problem
in a different shape, and only ever needed because the API insisted on the wrong
unit.)

#### Option D — Code-point storage but expose bytes — REJECTED (it's just today)

Keep `array i32` storage and expose a byte *view*. This is essentially the status
quo plus a view; it forfeits the entire storage win (still 4× memory, still
transcodes at I/O) for nothing. Rejected — the storage decision (§Storage) is the
point.

#### API recommendation, summarized

**Recommended: Option A (byte-indexed).** `.length` = byte count (O(1)); `s[i]` =
byte at offset `i` (O(1)); `for x in s` yields **code points** (decoding, O(n)
total); `s.codePoints()` is the explicit code-point iterator; slicing is by byte
range with boundary checking; `indexOf` returns a byte offset. This keeps the O(1)
operations honestly O(1), matches the storage, and — via §ASCII — *is* character
indexing for the ASCII common case.

**Genuinely open (§OQ):** (1) whether to go further to Option B and *remove*
integer subscript rather than redefine it to a byte; (2) **what `'a'` denotes** —
code point (recommended), byte, or one-character string; (3) whether `for x in s`
yields code points (recommended) or bytes; (4) the exact name/shape of the
code-point and grapheme iterators; (5) validity guarantee (Rust-valid vs Go-loose).
These are the parts that define the language's string identity and want the owner's
call, not a unilateral pick here.

### The ASCII fast path

**The idea (the owner's, developed here).** Track whether a string is **pure ASCII**
and special-case that case. For an all-ASCII string, **byte offset == code point ==
grapheme**, so over UTF-8 storage you get, for the ASCII string, *for free*: O(1)
code-point indexing, an accurate code-point `.length` (it equals the byte length),
and trivially-correct iteration. Non-ASCII strings fall back to an O(n) decode scan
(or a lazily-built auxiliary index). This is the Python-PEP-393 /
V8-Latin1 / Ruby-`coderange` / Swift-ASCII-fast-path pattern (§Survey axis 3),
shaped for VL.

**Where the bit lives.** A **1-bit/1-byte `ascii` flag in the string's struct
header**, alongside the `array i8` byte backing:

```
string  ≅  (struct (field $bytes (ref (array i8)))
                   (field $ascii i8))   ;; 1 = provably pure ASCII
```

This promotes `string` from a bare `array i8` to a small struct — the same
header-vs-bare-array tradeoff the collections design weighs for `List` (an extra
`struct.get` + pointer-chase per access, hoistable out of loops via LICM). The flag
is one byte; the cost that matters is the indirection and the branch, discussed
below.

**When it's computed.**

- **At construction:** a string literal is scanned once at compile time — the lexer
  already has the decoded characters, so the compiler can set the `ascii` bit as a
  *constant* for every literal (no runtime cost at all for the overwhelmingly common
  literal case). A string built from host bytes (file read) is scanned once on the
  way in (a single high-bit scan, SIMD-friendly), amortized against the I/O.
- **Maintained on concat/append:** `a + b` is ASCII iff `a` and `b` are both ASCII —
  a one-`AND` of two flags, no rescan. This is the cheap, exact case and covers most
  string-building. A slice of an ASCII string is ASCII (no rescan). A slice or
  splice that could introduce a partial sequence rescans the affected range (or
  conservatively clears the bit).
- **Lazily (the Ruby `UNKNOWN` option):** alternatively the bit is a tri-state
  (`ASCII` / `NOT_ASCII` / `UNKNOWN`) computed on first code-point operation and
  cached — avoids scanning strings that are only ever byte-indexed or printed. A
  sub-choice for implementation; the eager-on-construct form is simpler and likely
  enough.

**How operations branch on it.**

- **`.codePointLength()` / code-point `.length`** (if exposed): if `ascii`, return
  the byte length (O(1)); else O(n) decode-count (or read a built index).
- **Code-point indexing** (if any code-point-indexed accessor exists, e.g. inside
  `codePoints()` or a `codePointAt`): if `ascii`, it's a direct `array.get_u` at the
  byte offset (O(1)); else decode-from-start / index-assisted (O(n)).
- **Iteration** `for cp in s`: if `ascii`, the decoder is a trivial 1-byte-per-step
  loop (no continuation-byte handling); else the full UTF-8 decode. Same surface,
  two lowerings — exactly the uniform-access pattern the collections/`length` design
  uses.

**Compile-time-known strings (literals) skip the branch entirely.** The flag-and-branch
above is the *runtime* mechanism, and it only needs to exist for strings whose ASCII-ness
isn't known until run time — **incoming** strings (host/file/network reads) and the results
of *dynamic* concatenation. For a **string literal**, the compiler already knows every
byte, so it knows `ascii` as a **compile-time constant**: it stamps the flag statically
and, better, **constant-folds the branch away** — an ASCII literal's code-point ops lower
straight to the fast path with no runtime flag test, and a non-ASCII literal straight to
the general path. So the owner's instinct is right — the common case (ASCII *literals*,
which dominate source and compiler text) pays *nothing*: no flag check, no scan. Only
genuinely runtime strings carry the flag and the branch. The open part is the middle
ground: a concat/slice of statically-known-ASCII operands can *propagate* the constant
(`ascii(a) && ascii(b) ⇒ ascii(a + b)`), and how aggressively to push that
constant-propagation before falling back to the runtime bit is an implementation tuning
heuristic (§OQ), not a correctness question.

**Honest costs (this is an optimization, not the API).**

- **The branch.** Every code-point operation tests the flag — a predictable branch,
  but a branch. For the ASCII-dominant workload it predicts perfectly and the fast
  path is taken; the cost is real only for the (rare) hot mixed-ASCII/non-ASCII loop.
- **Maintaining the flag across mutation.** Concat is a cheap `AND`; arbitrary
  in-place mutation (if VL strings ever become mutable — they are immutable today)
  would need rescans or conservative clearing, the Ruby invalidation problem. With
  **immutable strings** (the current model, recommended to keep) the flag is set once
  at construction and never invalidated — the easy world. This is a reason to keep
  strings immutable.
- **The header indirection.** Promoting `string` to a `{bytes, ascii}` struct adds a
  `struct.get` + second-object pointer-chase per byte access vs a bare `array i8`,
  the same cost the collections design analyzes for `List` — and the same mitigation
  (hoist the `bytes` load out of the loop). An alternative that avoids the struct
  entirely: **steal a bit from the length / use a high-bit convention** rather than a
  separate field — sub-choice for implementation (§OQ).
- **It is layered *under* the API decision, not a replacement for it.** The fast
  path makes the *chosen* API fast for ASCII; it does not decide whether the API is
  byte- or code-point-indexed. If §API picks byte-indexing (recommended), the ASCII
  flag is what makes "byte index == character" *true and exploitable* for the common
  case; if §API had picked code-point indexing, the flag would be what rescues it
  from O(n) for ASCII — but it would not rescue non-ASCII, which is why the flag is
  not a substitute for getting the API right.

**Why it's safe — it can only ever be a win** (the same framing as the collections
design's representation inference): the flag is an *optimization the compiler/runtime
applies only when it can prove ASCII*. Worst case (every string treated as
non-ASCII) is the plain UTF-8 behavior — correct, just not as fast; best case
(ASCII) is fixed-width speed at 1× memory; never observably wrong, because the two
paths are semantically identical. So it can be added *after* the UTF-8 migration as a
pure optimization pass, with no surface change.

### Mutability: strings are immutable; in-place is a compiler optimization

**Decision: VL strings are immutable.** A string value cannot be mutated in place through
the surface language — no `s[i] = c`, no in-place append. Operations that "change" a string
(`toLower`/`toUpper`, `replace`, `trim`, slicing, concatenation) **return a new string**.
This is the high-level-language consensus — Java/C#/JS/Python/Go strings are immutable,
Swift's `String` is a value type (mutation is a value-copy, never shared), Rust separates
immutable `&str` from owned `String` with no aliased mutation; the outliers are the
systems/`char[]` world and Ruby (whose mutable strings are a well-known footgun, hence
`frozen_string_literal`).

**Why immutable is the right call for VL specifically:**
- **Map keys must be stable.** VL's `Map`/`Set` are string-keyed with a cached FNV hash
  (B6a). A *mutable* key could change after insertion, silently corrupting the table (the
  hash no longer matches the bucket). Immutability makes strings safe, shareable keys —
  close to decisive on its own, given how central string-keyed maps are to the compiler we
  are bootstrapping.
- **No aliasing footgun.** `let b = a` can freely share the bytes, and substrings/slices
  can *alias* the parent's backing with no defensive copy, precisely because nothing can
  mutate them out from under each other. This is the same value-vs-reference question the
  collections design wrestles with — immutability simply *removes* it for strings (there is
  no shared mutation to reason about).
- **The ASCII flag (and any cached length/hash) is trivially stable** — set once at
  construction, never invalidated; no Ruby-style rescan-on-write.
- **Concurrency-ready** (future): immutable strings are freely shareable across threads.

**The owner's `toUpper`/`toLower` point — handled by optimization, not by mutability.** The
strongest pragmatic case *for* mutability is in-place case conversion that yields a
same-length result. But that is exactly a **compiler optimization on an immutable API**, not
a reason to expose mutation: `toUpper(s)` is *semantically* a new string, and when the
compiler can prove the input is **unaliased / dead after the call** (the same linear-use /
copy-on-write analysis §VL.7 of the collections design uses for representation inference), it
lowers the "new string" to an **in-place rewrite of the old buffer** — mutable-style speed,
immutable semantics. Two caveats reinforce keeping it a *new-string* op with *optional*
in-place rather than a mutable API:
- **Case conversion is not always length-preserving** — `ß`→`SS`, `ﬃ`→`FFI`, and various
  locale/Unicode mappings change the *byte* (and code-point) length. So "same length ⇒
  mutate in place" is a *conditional* fast path the compiler takes when the lengths happen to
  coincide, never a guarantee — an immutable-returns-new model is correct regardless, while a
  mutable model would have to handle the resize anyway.
- The in-place rewrite needs the unaliased proof either way; absent it, you must allocate —
  which is exactly what the immutable semantics already say.

So: **immutable strings; mutation-shaped ops return new strings; in-place is an opportunistic
compiler optimization.** The owner's framing ("more a compiler-optimizing concern") is exactly
right — promoted here to an explicit decision with its rationale, since the ASCII fast path and
the map-key story both quietly depend on it.

---

## Migration / phasing — explicitly NOT before bootstrap

The hard sequencing constraint restated: **none of this happens until the
self-hosting port is done.** The current `array i32` code-point model is what the
bootstrap compiler is written against, its source is ASCII (so the model's
weaknesses don't bite), and changing string representation mid-bootstrap would churn
the lexer, the parser, codegen, and every `.vl` sample at the worst possible time.
**The code-point model stays until self-hosting is complete.** This doc is the
target to migrate *toward*, after.

A plausible post-bootstrap ordering (each step independently shippable, none before
self-hosting):

1. **Storage swap to `array i8` UTF-8, preserving today's *surface* as much as
   possible.** Change the backing from `array i32` of code points to `array i8` of
   UTF-8 bytes; make the host boundaries (`__print_string__`, `__store_string__`)
   bulk byte copies instead of per-element transcodes (an immediate I/O win). During
   this step, decide the validity guarantee. Because the bootstrap corpus is ASCII,
   the byte and code-point views *coincide*, so this step can land with minimal
   observable change to ASCII-only code even before the API is fully re-cut.
2. **Re-cut the API to byte-indexed (the §API decision).** Redefine `.length` =
   bytes, `s[i]` = byte, `for x in s` = code-point iteration via `codePoints()`,
   slicing by byte range with boundary checks, `indexOf` → byte offset; resolve the
   char-literal question (`'a'`). This is the surface-breaking step and wants the
   open questions settled first. Since ASCII values coincide, the break is mostly a
   *semantic* re-spec (and tooling/docs) rather than a churn of ASCII code.
3. **Layer in the ASCII fast path (§ASCII).** Add the `ascii` flag (literals get it
   as a compile-time constant; host-read strings scanned once; concat ANDs flags),
   and branch the code-point operations on it. Pure optimization, no surface change,
   addable last.

The `DECISIONS.md` entry — recording UTF-8 storage, the byte-indexed API, and the
ASCII fast path as the committed string model — **lands with that implementation
work, not now.** This document is the rationale and the decision record that precedes
it.

---

## Open questions for the owner

1. **The char literal `'a'` once strings are bytes** (the sharpest one). Stays an
   `i32` code point (recommended — keeps `for cp in s { ... cp == 'a' }` working),
   becomes a byte (matches `s[i]` but can't express `'é'`), or becomes a
   one-character `string` (Swift `Character`, most correct, biggest change)?
2. **Byte-index (Option A, recommended) vs remove integer subscript (Option B,
   Swift).** Is redefining `s[i]` to a byte the right call, or should VL go all the
   way and drop integer subscript in favor of explicit views? Recommendation is A
   (smaller break, keeps the index-based identity the lexer relies on), but B is the
   more *correct* model.
3. **What does `for x in s` yield** — code points (recommended, the Go split: index
   bytes, iterate runes) or bytes (matches subscript, but you almost never want to
   iterate raw bytes)?
4. **Validity guarantee — Rust-strict (`string` is *always* valid UTF-8, validate at
   every host boundary) vs Go-loose (bytes may be invalid, decoding handles it).**
   Strict is cleaner for iteration and slicing; loose is faster at the boundary and
   tolerant of messy input. Internally-constructed strings are valid by construction
   (the lexer only produces valid code points); the question is host bytes coming in.
5. **Where the ASCII bit lives** — a `{bytes, ascii}` struct header (adds the
   indirection the collections design analyzes), a stolen high bit / length-encoding
   trick (no extra object, fiddlier), or a tri-state lazy `coderange` (Ruby). And:
   eager-at-construction vs lazy-on-first-use.
6. **Do strings stay immutable?** They are today, and immutability makes the ASCII
   flag set-once / never-invalidated (the easy world) and makes slices able to share
   backing safely. A mutable-string future would re-open flag invalidation (Ruby's
   problem) — recommendation: keep them immutable.
7. **Grapheme support — a future `s.graphemes()` view, or out of scope?** Option A
   leaves room to add a grapheme iterator later (the *correct* "characters" unit)
   without changing the byte-indexed core; the question is whether VL ever wants to
   pull in the Unicode segmentation tables that requires.

## Sources

- Rust strings (UTF-8, `&str`, byte ranges, `is_char_boundary`, `chars`):
  [The Rust Reference / std::str](https://doc.rust-lang.org/std/primitive.str.html),
  [`str::is_char_boundary`](https://doc.rust-lang.org/std/primitive.str.html#method.is_char_boundary).
- Go strings & runes (UTF-8 bytes, `for range` yields runes, `s[i]` is a byte):
  [Go Blog — Strings, bytes, runes and characters](https://go.dev/blog/strings).
- Swift `String` (grapheme clusters, no integer subscript, UTF-8 in Swift 5):
  [Swift — Strings and Characters](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/stringsandcharacters/),
  [Swift 5 UTF-8 string](https://www.swift.org/blog/utf8-string/).
- Python PEP 393 — flexible string representation (Latin-1 / UCS-2 / UCS-4):
  [PEP 393](https://peps.python.org/pep-0393/).
- V8 / JSC one-byte vs two-byte strings; Ruby `coderange`; Zig/Elixir/Julia UTF-8:
  [V8 string internals](https://v8.dev/blog/),
  [Julia — Strings](https://docs.julialang.org/en/v1/manual/strings/).
- UTF-8 design (self-synchronizing, ASCII-superset, no BOM/endianness):
  [The Unicode Standard / UTF-8](https://www.unicode.org/faq/utf_bom.html).
- Internal: `docs/collections-design.md` (the header-vs-bare-array indirection
  analysis, the LICM hoist, the "optimization that can only be a win" framing reused
  for the ASCII flag), `docs/modules-design.md` (the std-over-primitives frame),
  `compiler/defaultScope.ts` (`string` as `{[i32]:i32}`), `compiler/lexer.ts` (char
  literal → code point), `compiler/toWasm.ts` (`__string_eq__` / `__print_string__`
  / `__store_string__`), `ROADMAP.md` Track H (self-hosting, the bootstrap gate).

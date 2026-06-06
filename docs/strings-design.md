# VL strings design — UTF-8 storage, a code-point-indexed API, and a load-bearing ASCII fast path

> Status: **design / research only.** No compiler change is proposed for *now*,
> and this document changes none. It records the **long-term direction** for how a
> VL string is stored and indexed once self-hosting is done — surveying how other
> languages model strings, committing to a concrete shape for VL's WasmGC backend
> with rationale and rejected alternatives, and being honest about the one tradeoff
> the chosen API carries (non-ASCII indexing). As with
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
> stays until then. Note the target **keeps the code-point-indexed surface** (`s[i]`
> a code point, `'a'` a code point, `.length` a code-point count) — what changes is
> the *storage* (UTF-8 bytes, not `array i32`) and therefore the *cost model* (O(1)
> for ASCII via the fast path, O(n)/index-assisted for non-ASCII), not the indexing
> unit.

## Summary / recommendation

**Storage → UTF-8.** A VL string becomes a packed WasmGC `array i8` of UTF-8 bytes,
replacing today's `array i32` of code points. This is the modern consensus
(Rust/Go/Swift-5/Zig/Elixir/Julia, and Python's compact ASCII representation): for
ASCII — which dominates real source, JSON, and most text — it is **1 byte per
character instead of 4** (a 4× memory win over today's model), and it is the
**interchange format of the outside world** (files, the web at >98%, network,
JSON), so host boundaries (`print`, file I/O) become **bulk byte copies instead of
per-element transcoding**. The decision here is firm. (§Storage)

**API → code-point indexing, kept integer-indexed.** This is the identity-defining
part and the part this doc spends the most on. A VL string stays **indexable by
integer**: `s[i]` yields a **code point** (a "char", an `i32`), and `.length` is the
**code-point count**. This is what an earlier draft called "Option C (code-point over
UTF-8)" and rejected as an O(n) trap — it is now the **chosen API**, made viable by
the **ASCII fast path** (below), which keeps `s[i]`/`.length` **O(1) for ASCII**
strings, the overwhelmingly common case. We keep integer indexing on purpose: the
owner wants to *index* strings, not navigate them through Swift-style opaque
`String.Index` cursors. The honest tradeoff, stated plainly: for a **non-ASCII**
string, `s[i]` and the code-point `.length` are **O(n)** (the ASCII flag rescues only
the ASCII case); an **optional code-point-index side table**, built lazily on first
code-point index of a non-ASCII string, can restore O(1) there too. **Byte-indexing
(the Rust/Go camp)** — what an earlier draft recommended — is **demoted to a rejected
alternative for VL**: we want O(1) char/code-point indexing as the default ergonomic,
not byte offsets. (§API)

**ASCII fast path — now load-bearing, not a nicety.** Layer an "is this string pure
ASCII?" bit into the string's struct header (alongside the byte backing) — the
PEP 393 / V8-Latin1 / Ruby `coderange` / Swift idea. Under code-point indexing this
bit is **precisely what makes the chosen API O(1) for ASCII**: when the bit is set,
byte offset == code point == character, so `s[i]` is a direct `array.get_u` and
`.length` equals the byte length — both O(1), for free. When the bit is clear,
code-point operations fall back to an O(n) decode scan (or the optional side index).
String **literals constant-fold the branch away** (the compiler knows their bytes, so
ASCII-ness is a compile-time constant), and because strings are **immutable** the flag
is set once at construction and **never invalidated**. (§ASCII)

The rest of the doc: the cross-language survey (storage encodings, then API/index
camps, then the small-string/ASCII-flag precedents), then the VL design (storage;
the API decision with the chosen unit + rejected alternatives; the load-bearing ASCII
fast path; Unicode scope; validity; mutability), then a phased migration outline
(explicitly **not before bootstrap**), then open questions for the owner.

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
- **Validity.** Rust guarantees `str` is *valid* UTF-8; Go does not. VL takes the
  **Go-style lean-NO** position (§Validity, decided): a string is bytes that are
  *usually* UTF-8, not a validated invariant — so no validation cost at the host
  boundary, and malformed sequences are handled **leniently** at decode time rather
  than rejected. The lexer already only *produces* valid code points, so
  internally-constructed strings are valid by construction; the only loose bytes are
  those coming *in* from the host, and those decode leniently.
- **The element is a code point.** `'a'` is an `i32` code point today, and stays one
  (§API): even though storage is now bytes, `s[i]` decodes to a code point, so a char
  literal and a string element are the same kind of thing — an `i32` code point. The
  byte representation is an implementation detail under the code-point-indexed surface.

The storage decision is firm. What the *API* over those bytes looks like — the
identity-defining decision — is next.

### API: code-point indexing, kept integer-indexed (the decided shape)

This is the identity-defining decision. The forcing constraint to be honest about:
**over UTF-8 storage, code-point indexing is O(n)** in general — the i-th code point
is not at a fixed byte offset, so reaching it means decoding from a known boundary.
An earlier draft treated that as disqualifying and recommended byte-indexing. The
owner's decision flips this: **VL keeps integer-indexed, code-point-valued strings**
— `s[i]` is a code point, `.length` is the code-point count — and pays for the
generality with the **ASCII fast path** (§ASCII), which makes the common case (ASCII)
O(1), plus an **optional side table** that makes non-ASCII O(1) too. The principle:
VL wants the **ergonomic of indexing a string by character**, and "a character" at
the core means **a code point**; the O(n)-non-ASCII cost is named honestly and
mitigated, not avoided by handing the user byte offsets.

#### The decided API

- **`s[i]` yields a code point** — a "char", an `i32` in 0–0x10FFFF — exactly as
  today. The index `i` is a **code-point index**, and `.length` is its bound.
- **`.length` is the code-point count** (the number of `s[i]`s), exactly as today.
- **An element / a char literal is a code point.** `'a'` is an `i32` code point
  (§API resolves the previously-open question: it denotes a **code point**), so
  `'a'`, `s[i]`, and a decoded element are all the same kind of thing — consistent
  with VL's current char-literal model. `for cp in s` yields code points.
- **`slice`/`indexOf`/`includes`/`charCodeAt` keep code-point semantics**: `slice`
  is a code-point range, `indexOf` returns a code-point index. The surface is
  **unchanged from today** — what changes is the *storage underneath* (UTF-8 bytes,
  not `array i32`) and therefore the *cost model* (below).
- **Byte access is available, but not the default.** A `s.bytes()` view / `s.byteAt`
  exposes the raw UTF-8 bytes for host-boundary and FFI work; the *default* subscript
  is the code point, not the byte.

#### Cost model — be honest about it

- **ASCII strings: O(1).** For a pure-ASCII string, byte offset == code point ==
  character, so `s[i]` is a direct `array.get_u` at offset `i` and `.length` is the
  byte length. The ASCII flag (§ASCII) is exactly what licenses this — it is
  **load-bearing**, not decorative.
- **Non-ASCII strings: O(n) by default.** For a string containing any multi-byte
  code point, `s[i]` must decode from a boundary (O(i), i.e. O(n) for the worst
  index) and the code-point `.length` is an O(n) decode-count. The flag rescues only
  the ASCII case; this is the real tradeoff of choosing the code-point unit over
  UTF-8 storage, and it is stated plainly rather than hidden. **Consequence to keep
  in mind:** a naïve `for i in 0 to s.length { s[i] }` over a non-ASCII string is
  O(n²) unless the side table (below) is built — which is exactly why the side table
  exists, and why iteration (`for cp in s`, an O(n) single pass) is the recommended
  way to walk a string.
- **Non-ASCII can be made O(1) with an optional code-point-index side table.** A
  per-string auxiliary array mapping code-point index → byte offset (or a sampled
  every-k-th-offset index) restores O(1) random access for non-ASCII strings. Built
  **lazily on first code-point index of a non-ASCII string** (ASCII strings never
  need it), it costs O(n) memory only for the strings that are actually
  random-accessed by code point. The exact shape (full vs sampled index, eager vs
  lazy threshold) is an implementation sub-choice (§OQ).

The framing: **ASCII (the common case) is O(1) for free; non-ASCII degrades
gracefully and can be index-assisted to O(1) when it matters.**

#### Rejected alternative for VL — byte-indexing (the Rust/Go camp)

`.length` = bytes (O(1)); `s[i]` = the byte at offset `i` (O(1)); code points reached
only through explicit iteration (Rust `.chars()`, Go `for i, r := range s`). This is
*honest and uniformly O(1)*, and an earlier draft of this doc recommended it — but it
is **rejected for VL** because **we want O(1) char/code-point indexing as the default
ergonomic, not byte offsets.** Byte-indexing forces every "give me the i-th
character" use through an iterator or a manual decode, redefines `s[i]` from a code
point to a byte (a value that is only meaningful mid-decode for non-ASCII), and makes
`indexOf`/`slice` speak byte offsets the user must keep on code-point boundaries
themselves. The honest tradeoff is the inverse of ours: byte-indexing pays *nothing*
for non-ASCII random access but charges *every* "i-th character" access an explicit
decode; code-point indexing makes "i-th character" the cheap default and pushes the
cost onto non-ASCII random access (which the flag + side table then recover). The
owner wants to index by character, so we take the code-point side of that trade. (The
byte view still exists — see "Byte access" above — it is just not what `s[i]` means.)

#### Rejected alternative — no integer subscript (Swift camp)

Remove `s[i]` entirely; expose `s.codePoints()` / `s.bytes()` views and an opaque
`String.Index` cursor for slicing. Most *grapheme-correct* (it refuses to hand out a
misleading integer index), but the heaviest ergonomic change and the furthest from
both VL's existing model and the owner's stated want. **Rejected** because the owner
explicitly wants to **index** strings by integer; opaque cursors are precisely the
ergonomic VL is choosing *against*. Grapheme correctness, when wanted, comes from an
opt-in `s.graphemes()` view (§Unicode), not from removing subscript.

#### Rejected alternative — code-point `array i32` storage (it's just today)

Keep `array i32` storage so code-point `s[i]` is O(1) without any flag. This is the
status quo; it forfeits the entire storage win (still 4× memory for ASCII, still
transcodes at every I/O boundary) to buy an O(1) the ASCII fast path delivers anyway
for the common case. **Rejected** — the storage decision (§Storage) is the point, and
the ASCII flag + optional side table recover the O(1) without paying 4× memory for
everyone.

#### API recommendation, summarized

**Code-point indexing, integer-indexed.** `s[i]` = code point (`i32`); `.length` =
code-point count; `'a'` = code point; `slice`/`indexOf` keep code-point semantics;
`for cp in s` iterates code points; `s.bytes()` exposes raw UTF-8 for boundaries.
**O(1) for ASCII** (via §ASCII), **O(n) for non-ASCII** by default, **O(1) for
non-ASCII** with the optional lazily-built code-point-index side table.

**Genuinely open (§OQ):** the **shape of the non-ASCII side table** (full
index vs sampled every-k offsets; eager vs lazy; the threshold at which it is built)
and tuning heuristics for the ASCII flag. The *unit* (code point), the meaning of
`'a'` (code point), validity (Go-lean), and graphemes (opt-in module) are **decided**
below, not open.

### The ASCII fast path — load-bearing under code-point indexing

**This is no longer just a nicety — it is what makes the chosen API viable.** Under
the rejected byte-indexing API the ASCII bit bought little (byte indexing is already
O(1)); under the **code-point indexing** VL actually chose, the bit is **precisely
what keeps `s[i]` and `.length` O(1) for ASCII strings** over UTF-8 storage. Without
it, *every* code-point index over UTF-8 would be an O(n) decode. With it, the common
case (ASCII source, JSON, identifiers, compiler text) is O(1) for free. So the fast
path is **load-bearing**, and the honest consequence is stated up front: it rescues
**only** the ASCII case — a **non-ASCII** string's `s[i]` and code-point `.length`
are **O(n)** unless the optional side table (below) is built.

**The idea (the owner's, developed here).** Track whether a string is **pure ASCII**
and special-case that case. For an all-ASCII string, **byte offset == code point ==
grapheme**, so over UTF-8 storage you get, for the ASCII string, *for free*: O(1)
code-point indexing, an accurate code-point `.length` (it equals the byte length),
and trivially-correct iteration. **Non-ASCII strings fall back to an O(n) decode
scan**, or — when random-accessed by code point — to a **lazily-built side index**
(below) that restores O(1). This is the Python-PEP-393 / V8-Latin1 / Ruby-`coderange`
/ Swift-ASCII-fast-path pattern (§Survey axis 3), shaped for VL.

**Making non-ASCII O(1) too — the optional code-point-index side table.** The ASCII
flag covers the common case; for a **non-ASCII** string that is *randomly accessed by
code point*, an optional per-string **side table** maps code-point index → byte
offset (or samples every k-th offset, trading a small per-access scan for a smaller
table). It is **built lazily on the first code-point index of a non-ASCII string** —
ASCII strings never allocate it, and non-ASCII strings that are only iterated or
printed never allocate it either, since iteration is a single O(n) pass and printing
is a bulk byte copy. With the table present, `s[i]` on a non-ASCII string is O(1)
(table lookup → `array.get` at the byte offset). The whole picture: **ASCII is O(1)
for free; non-ASCII degrades gracefully to O(n) and can be index-assisted back to
O(1)** when a workload actually random-accesses it. The table's exact shape (full vs
sampled, the lazy threshold) is an open implementation sub-choice (§OQ).

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

- **`.length`** (the code-point count, the default): if `ascii`, return the byte
  length (O(1)); else O(n) decode-count (or read a built side index).
- **`s[i]`** (code-point indexing, the default subscript): if `ascii`, it's a direct
  `array.get_u` at byte offset `i` (O(1)); else decode-from-a-boundary (O(n)) — or
  O(1) via the side index once built.
- **Iteration** `for cp in s`: if `ascii`, the decoder is a trivial 1-byte-per-step
  loop (no continuation-byte handling); else the full UTF-8 decode (one O(n) pass,
  no side index needed). Same surface, two lowerings — exactly the uniform-access
  pattern the collections/`length` design uses.

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
- **It rescues only ASCII — non-ASCII is the side table's job.** The flag makes
  code-point `s[i]`/`.length` O(1) for ASCII strings; it does **nothing** for
  non-ASCII, which stay O(n) by default and reach O(1) only via the optional
  code-point-index side table. This is the honest division of labor under the chosen
  code-point API: flag = the ASCII common case for free; side table = the non-ASCII
  case when a workload random-accesses it. Stating it plainly so no one mistakes the
  flag for a general O(1) guarantee.

**Why it's safe — it can only ever be a win** (the same framing as the collections
design's representation inference): the flag is an *optimization the compiler/runtime
applies only when it can prove ASCII*. Worst case (every string treated as
non-ASCII) is the plain UTF-8 behavior — correct, just not as fast; best case
(ASCII) is fixed-width speed at 1× memory; never observably wrong, because the two
paths are semantically identical. So it can be added *after* the UTF-8 migration as a
pure optimization pass, with no surface change.

### Unicode scope: graphemes/normalization/collation are out of the core — DECIDED

**Decision: keep Unicode tables OUT of the core string type.** The core string is
**bytes + the ASCII fast path + code-point indexing** — and nothing more. The richer
Unicode operations each need **large, Unicode-version-dependent tables**, and pulling
any of them into the core would bloat every VL binary whether or not it touches that
text:

- **Grapheme-cluster segmentation** (the *user-perceived* "character" — an emoji with
  a skin-tone modifier, a flag, a base+combining-mark, a ZWJ sequence) needs the
  **UAX #29 grapheme-break tables**, which are large and change with each Unicode
  version.
- **Case mapping** (full-Unicode `toUpper`/`toLower`/case-folding — `ß`→`SS`,
  locale-sensitive Turkish `i`, etc.), **normalization** (NFC/NFD), and **collation**
  (locale-aware sorting) each need their own sizable tables.

**Principle (the std-over-primitives frame from `docs/modules-design.md`):** the
common binary stays lean by keeping these in an **opt-in `std/unicode` module**, not
the core type. This matches precedent — Rust ships grapheme segmentation as the
external `unicode-segmentation` crate, Go puts normalization/collation/segmentation in
`golang.org/x/text`, not the core `string`. A program that never touches grapheme
boundaries or NFC never links the tables.

**Consequences for the core surface:**
- **No `s.length`-as-graphemes and no grapheme subscript in the core.** Core `s[i]`
  and `.length` are **code points** (decided in §API). Grapheme iteration, when a
  program wants the user-perceived "character", comes from `std/unicode` as an opt-in
  `s.graphemes()` view — *added without changing the code-point-indexed core.* This is
  also why §API rejects the Swift opaque-index route: graphemes are a module concern,
  not a reason to remove integer subscript.
- **Built-in `toUpper`/`toLower` are ASCII-or-simple by default.** The core provides
  the cheap, table-free case conversion (ASCII, and the simple 1:1 Unicode mappings);
  **full-Unicode case mapping/folding lives in `std/unicode`**. So `"hello".toUpper()`
  is core and free; locale-correct or `ß`-aware folding is the opt-in module.
- **Comparison/equality stay byte/code-point exact in the core**; normalization-aware
  ("é" as one code point vs base+combining equal) comparison and collation are
  `std/unicode`.

This keeps the core string honest about what it is — a UTF-8 byte buffer you index by
code point — and pushes everything that needs the Unicode Character Database into a
module the common binary need not pay for.

### Validity: bytes that are usually UTF-8 (Go-style lean-NO) — DECIDED

**Decision: a VL string is bytes that are *usually* UTF-8 — NOT a validated
valid-UTF-8 invariant.** This is the **Go position**, taken deliberately over the
**Rust** one (`str` is *guaranteed* valid UTF-8, enforced at every construction from
bytes). Moving this from "open question" to a decided recommendation:

**Rationale.** Validity only matters for strings arriving **from raw bytes** — host
handoff, file reads, the engine/FFI boundary. Internally-constructed strings (string
literals, concatenation, anything the lexer produces) are valid by construction, since
the lexer only ever emits valid code points. So the *only* place a malformed sequence
can enter is the host boundary — and **validating every incoming string is a real cost
the owner wants to avoid** (it turns the bulk-copy I/O win back into an O(n) scan on
the way in). Choosing strict-validity later is *also* costly (it would force a
retrofit of every boundary), so the decision is made **now**: lean NO.

**How malformed bytes are handled — leniently, at decode time.** Because the type does
*not* guarantee validity, code-point indexing and iteration must define behavior on a
malformed byte sequence. VL handles it **leniently: a malformed sequence decodes to
the Unicode replacement character U+FFFD** (one `s[i]` / one iteration step per
maximal ill-formed subsequence, the standard "U+FFFD substitution" recovery), rather
than trapping or having the type refuse to exist. The string stays usable; the
garbage surfaces as visible replacement characters, not a crash. (The ASCII fast path
is unaffected — an all-ASCII byte string is trivially valid; only non-ASCII strings
from the host can carry malformed bytes, and those take the lenient decode path.)

**Rejected: Rust-strict validity.** Guaranteeing `string` is always valid UTF-8 is
cleaner for iteration and lets slicing assume boundaries — but it forces validation at
**every** byte-to-string boundary (file read, FFI, engine handoff), which is exactly
the per-incoming-string cost the owner wants to avoid, and it makes "I have some bytes
that are mostly text" awkward (Rust pushes you to `Vec<u8>`/`OsString`). VL takes the
Go trade: cheap boundaries, lenient decoding, no validated invariant.

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

1. **Storage swap to `array i8` UTF-8, preserving today's code-point *surface*.**
   Change the backing from `array i32` of code points to `array i8` of UTF-8 bytes;
   make the host boundaries (`__print_string__`, `__store_string__`) bulk byte copies
   instead of per-element transcodes (an immediate I/O win). The **surface stays
   code-point-indexed** (`s[i]` = code point, `.length` = code-point count, `'a'` =
   code point — unchanged from today); what changes is the storage and therefore the
   cost model. This step also lands the **Go-lean validity** stance (no boundary
   validation; lenient U+FFFD decode). Because the bootstrap corpus is ASCII, the
   code-point and byte views *coincide*, so this lands with **no observable change to
   ASCII code** — the cost-model change only surfaces for non-ASCII text.
2. **Layer in the ASCII fast path (§ASCII) — this is what restores O(1).** Add the
   `ascii` flag (literals get it as a compile-time constant and constant-fold the
   branch away; host-read strings scanned once; concat ANDs flags), and branch the
   code-point operations on it. Under code-point indexing this is **not optional
   polish — it is what makes `s[i]`/`.length` O(1) for ASCII** over UTF-8 storage.
3. **(Optional, as needed) the non-ASCII code-point-index side table.** Add the
   lazily-built side table so non-ASCII random access reaches O(1). Pure optimization,
   no surface change; build only when a workload demonstrably random-accesses
   non-ASCII strings by code point.

A separable, **opt-in** track (not gating the above): the **`std/unicode` module** —
grapheme segmentation (`s.graphemes()`), normalization, collation, full-Unicode case
mapping — built on the code-point-indexed core, shipped as a module so the common
binary stays lean.

The `DECISIONS.md` entry — recording UTF-8 storage, the **code-point-indexed API**,
the **load-bearing ASCII fast path**, **Go-lean validity**, and **Unicode-out-of-core**
as the committed string model — **lands with that implementation work, not now.** This
document is the rationale and the decision record that precedes it.

---

## Open questions for the owner

The identity-defining choices are now **decided** (recorded here so they are not
re-litigated, and called out as decided so the owner can veto if any reads wrong):

- **Indexing unit — DECIDED: code points.** `s[i]` is a code point (an `i32` "char"),
  `.length` is the code-point count, integer indexing is kept. Not byte-indexing
  (rejected for VL — we want char indexing as the default ergonomic), not Swift's
  opaque `String.Index` (the owner wants to index).
- **What `'a'` / an element denotes — DECIDED: a code point.** Consistent with VL's
  current char-literal model; `'a'`, `s[i]`, and a decoded element are all `i32` code
  points.
- **Validity — DECIDED: Go-lean NO.** A string is bytes *usually* UTF-8, not a
  validated invariant; no host-boundary validation; malformed sequences decode
  leniently to **U+FFFD**. Rust-strict is the rejected alternative.
- **Graphemes / normalization / collation / full-Unicode case — DECIDED: out of the
  core, in opt-in `std/unicode`.** The core is bytes + ASCII fast path + code-point
  indexing; the Unicode-table-heavy operations are a module, so the common binary
  stays lean.
- **Mutability — DECIDED: immutable**, with in-place as an opportunistic compiler
  optimization (§Mutability).

Genuinely still open (sub-choices and tuning, not identity):

1. **The non-ASCII code-point-index side table — its shape.** Full index (code-point
   index → byte offset, O(n) memory, O(1) lookup) vs **sampled** (every k-th offset,
   smaller table, a short bounded scan per access); **eager** at first non-ASCII
   construction vs **lazy** on first code-point index; and the threshold/heuristic for
   building it at all. This is the one part of the chosen API left to implementation.
2. **Where the ASCII bit lives** — a `{bytes, ascii}` struct header (adds the
   indirection the collections design analyzes), a stolen high bit / length-encoding
   trick (no extra object, fiddlier), or a tri-state lazy `coderange` (Ruby). And:
   eager-at-construction vs lazy-on-first-use.
3. **ASCII-flag constant-propagation aggressiveness** — how far to push
   `ascii(a) && ascii(b) ⇒ ascii(a + b)` (and the slice case) at compile time before
   falling back to the runtime bit. A tuning heuristic, not a correctness question.

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

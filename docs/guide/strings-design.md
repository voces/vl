# VL strings design — UTF-8 storage, a byte-indexed core, and code points by iteration

> Status: **design, decided — implementation not yet started.** The identity-defining
> choices below are ruled and recorded so they are not re-litigated. The
> `DECISIONS.md` entry lands with the implementation PR, not before; this document is
> the rationale it will point at.

> **The hard gate that used to open this file is LIFTED.** Every prior revision began
> "this does NOT change before bootstrap." Bootstrap is done: `compiler/*.vl` compiles
> itself to a byte-exact fixpoint (`scripts/native-fixpoint.sh`), the TS host is
> deleted, and `u8`/packed `(array mut i8)` storage shipped with `std:fs`. The
> prerequisite that blocked this work is now the substrate it builds on.

---

## What this revision reverses, and why

**The previous revision chose code-point indexing** — `s[i]` a code point, `.length`
a code-point count — over UTF-8 storage, with a load-bearing "ASCII fast path" flag
to keep the common case O(1). **That is reversed here.** VL takes the **byte-indexed
core** (the Go/Rust camp): `s[i]` is a **byte**, `.length` is a **byte count**, both
O(1) unconditionally, and code points come from **iteration**.

The reversal was driven by measurement, not taste. Three findings:

**1. Nothing random-accesses a string.** Counting indexed string reads in
`compiler/*.vl` — 39K lines, the largest VL program that exists:

| Access shape | Count | Share |
|---|---|---|
| Sequential (a loop variable) | 70 | 63% |
| Length-relative (`s.length - 1`, near-last) | 32 | 29% |
| Constant (`s[0]`, near-first) | 9 | 8% |
| **True random access** | **0** | — |

Code-point indexing's whole purpose is O(1) random access by character. The measured
demand for that operation is **zero**. What real string code does is *scan*, or look
at an *end* — and the sequential 63% is a C-brain spelling of an iteration, reached
for because the language offered an index and not a cursor.

**2. The blast radius is small and CONCENTRATED — but it is not zero.**

> **CORRECTION.** The first version of this section claimed the blast radius was
> **zero**, on a census that stripped comments with a naive `sed` and so missed real
> literals. Re-derived with a quote-aware scanner, the corpus holds **8 non-ASCII
> literals across 3 files**. The claim was wrong; the conclusion it supported still
> holds, for the reason below.

| | |
|---|---|
| Corpus: 2,075 `.vl` files | **8** non-ASCII literals in **3** files — `chars/literals.vl`, `std/utf8-roundtrip.vl`, `std/utf8-lossy.vl` |
| Compiler: 27 `.vl` files | **97** non-ASCII string literals — *all* diagnostic messages (em-dashes, middots), concatenated and printed, never indexed |

**All three corpus files exist specifically to test non-ASCII handling.** So their
expectations *should* move when the index unit changes — that is the fixture doing its
job, not collateral damage. What matters for the reversal is the negative: **no fixture
that is not about Unicode observes the change at all**, because for ASCII the byte index
**is** the code-point index and the byte length **is** the code-point length. All 111
indexed sites in the compiler keep working unchanged.

(`"héllo→".length` is `6` today and becomes `9`. Three fixtures observe that; nothing
else does.)

**3. Code-point indexing was paying for itself with the whole complexity budget.**
The ASCII flag existed *only* to make code-point `s[i]` O(1). Removing the promise
removes, in one stroke: the `ascii` field, the load-bearing fast-path subsystem, the
constant-propagation tuning heuristic, the **O(n²) indexed-loop cliff**, the two-
coordinate-system seam against `std:regex` byte offsets, and the branded-offset type
that seam would have needed. Roughly a third of the previous revision is now moot.

**The O(n²) cliff deserves its own line, because it is why "just document it" was not
an answer.** Under the old design, a program written and tested on ASCII would go
*asymptotically* worse — quadratic — when handed a name with an accent or a file with
an em-dash. Invisible in the code, invisible in the types, triggering on exactly the
input a developer in an English-speaking country never tests. That is the **invisible
seam** VL rejects on principle, and it was being introduced deliberately in exchange
for an operation nothing performs.

**What is NOT reversed:** UTF-8 storage, Unicode-out-of-core, Go-lean validity,
immutability, byte-level equality and hashing, and the `wasm:js-string` rejection all
stand exactly as before. Only the *index unit* changed — and, with it, the machinery
that unit required.

**Where this puts VL:** squarely in the **Go camp**. The previous revision proposed a
cell **no shipping language occupies** (UTF-8 storage *and* O(1) code-point indexing);
the absence of precedent was itself data. VL now takes Go's model, plus VL's type
system closing Go's one real trap (§Char-literal trap).

---

## Summary of decisions

**Storage → UTF-8.** A VL string's bytes are a packed WasmGC `array i8` of UTF-8,
replacing today's `array i32` of code points. 1 byte per ASCII character instead of
4; the interchange format of files, the web, and the network, so host boundaries
become **bulk byte copies instead of per-element transcodes**. (§Storage)

**Representation → a slice header.** `string ≅ (struct $backing $start $len $hash)`
— a view over an `array i8`. This makes **`slice` O(1) and allocation-free**, which
is what makes substring-heavy work (split, trim, tokenize, parse) fast, and what lets
a re-slice serve as the scanning cursor. Retention hazard acknowledged and given an
explicit escape (§Header). *Note this header exists for slicing — not for an ASCII
flag, which is deleted.*

**API → byte-indexed.** `s[i]` is a **byte** (`i32`-valued, 0–255), O(1).
`.length` is the **byte count**, O(1). One coordinate system, shared with
`std:regex` match offsets, `s.bytes()`, and the I/O boundary — no converters, no
branded offset type, no way to mix two kinds of integer. (§API)

**Code points → iteration, explicitly.** `for cp in s` yields code points (works
today). `s.backwards()` iterates in reverse — O(1) per step, because UTF-8 is
self-synchronizing. `s.cpAt(i)` and `s.cpLen()` exist as **named, explicitly O(n)**
escape hatches, so the cost is visible at the call site rather than hidden in a
subscript. (§Codepoints)

**The char-literal trap → closed by the type system.** `s[i] == 'é'` is silently
always-false in Go. In VL it is a **compile error**, using literal-preserving
inference (A5c). This is the one place VL beats the camp it is joining.
(§Char-literal trap)

**Scanning → re-slicing, not a cursor type.** `s = s.slice(1)` *is* the cursor,
spelled with a concept the language already has. No `String.Index`, no iterator
object. Bit-syntax pattern matching is filed as the more ambitious direction.
(§Scanning)

**Memory → `string` is GC; `Buffer` is the linear/SIMD tier.** Wasm SIMD operates on
linear memory only, and a GC `(array i8)` cannot be read word-at-a-time. Rather than
tag one type over two backings — the defect shape this compiler is most prone to —
the split is explicit: `string` for the ubiquitous small case where lifetime is what
matters, `Buffer` (B-mem) for scan-heavy work where vectorization does. (§Memory)

**Map performance → cache the hash in the header.** Not SIMD. The compiler is
map-key-heavy and re-hashes the same immutable key object repeatedly; below ~16 bytes
SIMD setup dominates anyway. (§Equality)

**`reverse()` → `std:unicode`.** Byte-reversing UTF-8 is garbage and code-point-
reversing detaches combining marks; grapheme reversal is what people mean and it
needs tables. The core offers backward *iteration*, not reversal. (§Reverse)

**Unicode, regex → opt-in modules,** exactly as before. (§Unicode, §Regex)

---

## Survey: how mainstream languages model strings

Three axes are independent and worth separating, because languages mix and match
them: (1) the **internal storage encoding**, (2) the **surface API** (what `s[i]` and
`length` mean), and (3) **representation optimizations**.

### Axis 1 — internal storage encoding

| Language | Internal storage | Notes |
|---|---|---|
| **Rust `String`/`&str`** | **UTF-8**, guaranteed valid | invalid UTF-8 lives in `Vec<u8>`/`OsString`, never `str` |
| **Go `string`** | **UTF-8** bytes, *not* guaranteed valid | an immutable byte slice; `[]rune` is the decoded form |
| **Swift 5 `String`** | **UTF-8** (changed *from* UTF-16 in Swift 5, 2019) | the move to UTF-8 was a headline Swift-5 change |
| **Zig** | **UTF-8** by convention; `[]const u8` is the string type | barely has a "string type" — it's a byte slice |
| **Elixir** | **UTF-8** binaries | strings are UTF-8 binaries |
| **Julia** | **UTF-8** (`String`) | byte-indexed with character-boundary semantics |
| **Python 3 (PEP 393)** | **flexible**: Latin-1 / UCS-2 / UCS-4 per string | "compact ASCII" is 1 byte/char; API is code-point-indexed |
| **Java / C# / JavaScript** | **UTF-16** | the legacy cohort |
| **C / C++** | **bytes**, encoding-agnostic | UTF-8 by convention; the type carries no guarantee |

**Why UTF-8 won.**

- **Space.** ASCII is 1 byte. Source code, JSON, HTML, logs, identifiers, and
  protocol keywords are overwhelmingly ASCII; even Latin-script prose is mostly ASCII
  with occasional accents. UTF-32 is 4× the memory for that case, UTF-16 is 2×. UTF-8
  pays the multi-byte cost *only* where a code point needs it.
- **Interchange — zero transcoding at I/O.** Files, the web (>98%), network
  protocols, and JSON are UTF-8. If the in-memory form *is* UTF-8, reading a file or
  writing stdout is a **bulk byte copy**. This is the decisive practical argument and
  the one that bites VL today.
- **ASCII superset.** Every ASCII byte is valid UTF-8, so the whole corpus of ASCII
  tooling, comparisons, and literals keeps working.
- **Self-synchronizing.** Continuation bytes (`10xxxxxx`) are distinguishable from
  lead bytes, so a character boundary is findable from any position by scanning at
  most 3 bytes backward. This is what makes byte-indexed slicing *checkable*
  (Rust's `is_char_boundary`) — and what makes **backward iteration O(1) per step**.
- **No endianness, no BOM, no surrogate pairs.** UTF-16 has byte-order ambiguity and
  **surrogate pairs** — a single astral code point is *two* UTF-16 code units, so even
  UTF-16 is variable width, defeating the only reason anyone chose it.

**The UTF-16 legacy cohort (Java/JS/C#/Win32)** all chose UTF-16 in the mid-1990s
when Unicode was a 16-bit standard and "wide char = one character" looked true.
Unicode grew past 16 bits, surrogate pairs were bolted on, and the premise collapsed
— leaving 2× the memory of UTF-8 *and* variable width *and* surrogate hazards
(`"💩".length === 2` in JS; lone surrogates; `charAt` returning half a character).
This is the cohort VL must not join.

**UTF-32 storage (≈nobody ships it).** Fixed-width 4-byte code points give O(1)
*code-point* indexing — but cost 4× memory for ASCII and, critically, **do not deliver
O(1) *grapheme* indexing**, so they buy an O(1) for a unit that still isn't the
user-perceived character. Almost no language uses it as string storage; it appears
only as a transient decoded form (Go's `[]rune`, Python's UCS-4 tier). **This is
exactly VL's current model** — and the reason this document exists.

### Axis 2 — the surface API: what does `s[i]` / `length` mean?

| Camp | Languages | `length` counts | `s[i]` subscript | Code points via |
|---|---|---|---|---|
| **Byte-indexed** | **Rust `&str`**, **Go** | **bytes** (O(1)) | Rust: **no `str[i]` at all** (byte ranges `&s[a..b]`, panics off boundary); Go: **byte** (O(1)) | Rust `.chars()`, Go `for i, r := range s` |
| **Boundary-checked byte index** | **Julia** | bytes (O(1)); `length(s)` counts characters (O(n)) | **character** at a byte index; mid-character indices **throw** | `eachindex`, `nextind`/`prevind` |
| **Grapheme / opaque-index** | **Swift** | `count` = **grapheme clusters** (O(n)) | **no integer subscript** — `String.Index` is an opaque cursor | `.unicodeScalars` / `.utf8` views |
| **Code-point-exposed** | **Python**, JS (per UTF-16 unit), C# | **code points** / UTF-16 units | **code point** in O(1) | already the default unit |

**Synthesized trade-offs.**

- **Byte-indexed (Rust/Go) — honest and uniformly fast.** `length`, `s[i]`, and
  slicing are O(1) byte operations; the API never *pretends* a byte offset is a
  character. The cost is pushed where it belongs: iterating characters is explicit,
  and slicing at a non-boundary is an error you handle. This camp accepts that "index
  a character in O(1)" **is not a thing UTF-8 can do**, and refuses to fake it.
  **This is the camp VL joins.**

- **Code-point-exposed (Python) — O(1) *because* it cheats on storage.** Python's
  `s[i]` is O(1) only because PEP 393 picks a **fixed-width representation per
  string**, so the string is internally a flat array of equal-width units. That is an
  **axis-1 cost** (UCS-4 strings are 4× memory — the UTF-32 problem) paid for an
  axis-2 promise. **You cannot offer O(1) code-point indexing over UTF-8 storage**;
  the two are in tension, and Python resolves it by not storing UTF-8.

- **Grapheme / opaque-index (Swift) — most correct, heaviest, no subscript.**
  Semantically the best model — the only one where `count` matches what a user counts
  by eye — but segmentation is O(n), needs tables, and the opaque-index ergonomics are
  notoriously awkward.

**The key truth all of this dances around: even *code points* are not user-perceived
characters.** A grapheme cluster routinely spans **multiple code points** — an emoji
with a skin-tone modifier, a flag (two regional indicators), a base + combining mark,
a ZWJ sequence (`👨‍👩‍👧‍👦` is *seven* code points). So a fixed-width-per-code-point
model buys O(1) indexing of a unit that **is still the wrong unit for "characters."**
If you actually want "the i-th character" you need grapheme segmentation regardless of
storage, and *no* integer-O(1) scheme gives it to you.

This is the argument that finally decided §API: since **neither** byte indexing nor
code-point indexing gives you a character, the choice is between two units that are
both "wrong" — and then you should pick the one that is **cheap, uniform, and honest**
rather than the one that is expensive, data-dependent, and merely *less* wrong.

### Axis 3 — representation optimizations

- **Python PEP 393** — flexible representation: each string records its kind
  (1/2/4 bytes/char) from its widest code point. One astral code point promotes the
  *whole* string to UCS-4.
- **V8 / JavaScriptCore** — a one-byte (Latin-1) vs two-byte (UTF-16) flag, halving
  memory for the ASCII/Latin case despite UTF-16 semantics.
- **Ruby `coderange`** — a cached tag: `7BIT` / `VALID` / `BROKEN` / `UNKNOWN`.
  `7BIT` strings take ASCII fast paths; invalidated on mutation.
- **Swift** — small strings (≤15 UTF-8 bytes) inlined into the `String` value; ASCII
  fast paths in comparison and iteration.
- **Go / Rust — the slice header.** `string` is `{ptr, len}`; `&str` is a fat
  pointer. **Substring slicing is O(1)** because a substring is a view, not a copy.
  This is a large part of why Go text processing is fast, and it is the axis-3
  optimization VL adopts (§Header) — *not* the ASCII flag.

> **Note the shift from the previous revision.** That draft adopted the *ASCII-flag*
> optimization (PEP 393 / V8 / Ruby lineage) because it needed one to make code-point
> indexing viable. Having dropped that promise, VL adopts the *slice-header*
> optimization (Go / Rust lineage) instead — which serves an operation programs
> actually perform constantly (substring) rather than one they never perform (random
> character access).

---

## VL design

### Context: what VL has today

- **A string is a WasmGC slice header over an `array i32` of Unicode code points** —
  `(struct (field (ref (array (mut i32)))) (field i32 $start) (field i32 $len))`, its own
  heap type since Stage 2a and a header since **Stage 2b**. `.length` is `struct.get 2`,
  `s[i]` is `backing[start + i]` behind an `i u< len` guard, and **`slice` is O(1)**: a
  header sharing the receiver's backing, no element copy. One code point per `i32`, full
  Unicode range. *(Before Stage 2b a string WAS the bare array; `.length` was `array.len`
  and `slice` allocated and copied.)*
- **A char literal `'a'` is an `i32` code point.** The lexer decodes a single-quoted
  literal to exactly one code point (`''` and `'ab'` are hard errors; `\u{1-6 hex}`
  admits the full range).
- **`s[i]` is O(1) and yields the code point; `.length` is the code-point count.**
  Verified: `"héllo→".length` is `6`, `s[1]` is `233`, and `for c in s` yields
  `104, 233, 108, 108, 111, 8594`.
- **The method surface is six operations** — `slice`, `indexOf`, `includes`,
  `charCodeAt`, `fromCodePoint`, `toString` — plus `+`, `==`, `.length`, `s[i]`, and
  `for cp in s`. There is no `split`, `join`, `trim`, `replace`, `startsWith`,
  `endsWith`, `toUpper`, `toLower`, or padding. (§Methods — this is the largest
  user-facing gap in the whole area, and it is rep-independent.)
- **Host boundaries transcode per element.** `__print_string__` streams char codes one
  at a time; `__store_string__` copies code points as bytes into linear memory.

This is the **UTF-32-ish model**: simple, O(1) code-point indexing, **4× memory for
ASCII**, and **per-element transcoding at every host boundary**.

### Storage: UTF-8 bytes — DECIDED

A VL string's bytes are a packed WasmGC **`array i8` of UTF-8**.

- **4× leaner for ASCII**, which is the overwhelmingly common case — VL source, the
  compiler's own text, JSON, identifiers.
- **Zero-transcode host boundaries.** The host already deals in UTF-8; with UTF-8
  storage the boundary is a **bulk `array.copy`** rather than an O(n) per-element
  transcode.
- **It unblocks two filed items.** wasmtime's `ArrayRef::new_from_i8_slice` memcpys a
  host byte slice straight into a GC array — it is **i8-only**, and the roadmap
  records that it "lands free the moment strings are `(array i8)` and not before."
  And **H-M2 (killing the Rust host)** needs "UTF-8 encode/decode written in VL" plus
  GC-string↔linear-memory copies; this is that work.
- **WasmGC makes it natural.** `array i8` is a first-class packed array type; the
  `u8[]` work that shipped with `std:fs` already built the emitter machinery —
  `array.get_u` zero-extending, `array.set` truncating, the packed backing under the
  `{backing, len, cap}` wrapper, the empty-literal annotation pin.

**What it costs, honestly.** Word-at-a-time scanning is lost: `array.get_u` reads
**one element**, and a GC array cannot be read as an `i64` or a `v128`. Over linear
memory you load 8 or 16 bytes at once. This is the single strongest argument against
GC-backed strings and is confronted directly in §Memory.

### Representation: a slice header — DECIDED

```
string  ≅  (struct (field $backing (ref (array i8)))   ;; the UTF-8 bytes
                   (field $start   i32)                ;; byte offset into $backing
                   (field $len     i32)                ;; byte length of this view
                   (field $hash    i32))               ;; cached FNV/xx hash, 0 = uncomputed
```

> **STAGE 2b HAS SHIPPED — the header and the views, with the element type UNCHANGED.**
> `string` is `(struct $backing:(ref (array (mut i32))) $start:i32 $len:i32)` today: `slice`
> allocates a header only, `.length` reads `$len`, `s[i]` reads `$backing[$start + i]`.
> **`$hash` is deliberately absent** — the fourth field is free (§1.2 of the measurements
> priced 3- and 4-field structs identically under all three collectors), but caching the
> hash must move ATOMICALLY with byte-level equality (§Equality's migration note), so no
> hash logic is wired. The elements are still i32 code points; **UTF-8 is Stage 2c.**
>
> **`compact()` is NOT in Stage 2b, and that is a considered call, not an omission.** The
> retention hazard below is real and now live — a small view keeps its whole backing. But
> `compact()` is a *user-facing method*, and OQ-3 ruled that the 15 `std:str` names stay in
> `std:str` rather than becoming intrinsics precisely because a core string method costs
> ~48 hand-synced emitter ladder arms. Adding one in the stage whose entire claim is
> *behavioural identity against master* would forfeit that claim: a new method changes what
> the corpus can express, so a corpus that comes back identical would no longer be evidence.
> It also cannot be written in VL over today's surface — `s.slice(0, s.length)` returns a
> view of the same backing, so there is no spelling that copies. **It belongs with Stage 2c**,
> where the element type changes anyway and the copy has to be written regardless.

**Why a header, when the previous revision's header was just deleted.** The old
header existed to carry an `ascii` flag so code-point `s[i]` could be O(1). That flag
is gone. This header exists for a different and much better reason: **`slice` becomes
O(1) and allocation-free.**

Substring extraction is *ubiquitous* — split, trim, tokenize, every parser, every
field extraction. Without views, splitting a 1 MB file into 10k lines allocates 10k
arrays and copies 1 MB. With views it allocates 10k small structs and copies **zero
bytes**. This is Go's `{ptr, len}` and Rust's fat pointer, and it is a large part of
why both are fast at text.

It is also **what makes §Scanning work**: if `slice` is O(1), then `s = s.slice(1)` is
a cursor, and VL needs no cursor *type*.

**The retention hazard — real, and given an escape.** A 3-byte view keeps its whole
backing alive. This is Go's known gotcha (`strings.Clone` is the manual fix), and it
is why **Java changed `substring` from view to copy in 7u6**. VL has GC and no borrow
checker, so it inherits Go's situation exactly.

The mitigation is **`s.compact()`** — an explicit copy into a fresh exactly-sized
backing, for the "I am keeping a small slice of a large buffer for a long time" case.
A documented sharp edge rather than a silent leak. (Whether the compiler should
*automatically* compact a small view of a large backing that survives into a
long-lived structure is filed as **OQ-4**; the default is explicit.)

**Cost accounting, stated plainly.** Every string is now **two objects** — the header
struct and the backing array — where today it is one. For very short strings the
second object header can exceed the byte savings. **The break-even point WAS measured
before this landed** (§Migration step 0 → `../internals/string-rep-measurements.md`
Part 1: the crossover is 8–16 bytes for a string that does NOT share a backing, but
**100 %** of the strings the compiler's lexer allocates are slices of one source string,
so the amortized object count is 1.00004 and the verdict is a large win). The rest of this
paragraph is kept as the statement of what had to be measured, because the compiler's own workload
is dominated by short interned identifiers and the headline "4× leaner" claim is
per-*character* while the header cost is per-*string*. The previous revision asserted
the 4× win without a denominator; the roadmap's own standing rule applies — *quote
that number with its denominator or not at all.*

Note that many strings **share** a backing (every slice of one), so the amortized
per-string cost across a parse is much closer to one object than two.

### API: byte-indexed — DECIDED

- **`s[i]` is a byte.** An `i32` in 0–255 (`array.get_u` zero-extends), O(1).
- **`.length` is the byte count.** O(1) — it is `$len`.
- **`s.slice(a, b)` takes byte offsets** and returns a **view**, O(1).
- **`s.bytes()`** is the same bytes as a `u8[]` view — also O(1), also zero-copy.
- **One coordinate system.** Byte offsets are what `slice` takes, what `indexOf`
  returns, what `std:regex` reports as match positions, and what crosses the I/O
  boundary. There is no second kind of integer, so there is nothing to confuse, no
  converter on any hot path, and no branded-offset type to invent.

**Boundary discipline.** Slicing at a non-character-boundary is *permitted* and
produces a string whose leading or trailing bytes are a partial sequence. Under
Go-lean validity (§Validity) that is not an error — it decodes leniently to U+FFFD.
`s.isCharBoundary(i)` is available for code that wants to check (Rust's primitive; it
is O(1), a single lead/continuation bit test).

**What this gives up.** `s[i]` no longer means "the i-th character." That is a real
walk-back of the ergonomic the previous revision was built around, and it is taken
deliberately on the evidence in §Reversal: the indexing programs actually perform is
*scanning*, which re-slicing serves better than an index does.

**This is not the Swift camp.** Swift removed integer subscript entirely and made you
navigate opaque cursors — precisely the ergonomic VL rejects. VL keeps integer
subscript, keeps it O(1), and keeps it on the string itself. What changes is **what
the element is**, not whether you can index.

### Code points: by iteration, explicitly — DECIDED

```
for cp in s        { … }   ;; forward,  O(1)/step, O(n) total   — works today
for cp in s.backwards() { … }  ;; reverse, O(1)/step, O(n) total
s.cpAt(i)                  ;; the code point at BYTE offset i   — O(1)
s.cpLen()                  ;; count of code points              — O(n), named
```

- **`for cp in s` is the canonical loop** and already works — `"héllo→"` yields
  `104, 233, 108, 108, 111, 8594` on today's build. It survives the storage swap with
  its surface unchanged; only its lowering changes.
- **`s.backwards()` is cheap because UTF-8 self-synchronizes.** Scanning back over
  continuation bytes to the lead byte takes **at most 3 steps**, so reverse iteration
  is O(1) per element with no reversal, no allocation, and no side table.
- **`s.cpAt(i)` takes a BYTE offset** — consistent with the one coordinate system —
  and is O(1): decode the sequence beginning at `i` (at most 4 bytes). It is *not*
  "the i-th code point"; that operation is `s.cpLen()`-shaped and deliberately has no
  subscript sugar.
- **`s.cpLen()` is O(n) and named so.** A method call at the point of use, where the
  cost is visible, rather than a `.length` that is O(1) on some strings and O(n) on
  others depending on runtime data.

The principle: **operations whose cost depends on the data get a name, not a
subscript.** A subscript should mean O(1), always, on every input.

### The char-literal trap — closed by the type system

This is the one genuine hazard of the byte-indexed camp, and the one place VL can
improve on the camp it joins.

```
if s[i] == 'é' { … }        ;; silently ALWAYS FALSE
```

`'é'` is code point 233; the UTF-8 bytes of "é" are `0xC3 0xA9`. **No single byte of
the string can ever equal 233**, so the comparison is dead code that looks correct.
Go escapes this only by accident of its constant rules: an untyped rune constant that
does not fit in a `byte` is a conversion error, so `s[i] == 'é'` fails to compile —
but only because the literal is constant.

**VL closes it structurally**, using literal-preserving inference (**A5c**, on the
roadmap): `'é'` carries a literal type whose value and UTF-8 width are both known, so
the checker rejects the comparison outright with a message that names the fix:

```
a char literal that encodes to 2 UTF-8 bytes can never equal a single byte
  — use `s.cpAt(i) == 'é'`, or compare the byte sequence
```

This is the same principle ruled on `u8` during the `std:fs` work: **a type may brand,
but must not claim a value range it does not enforce.** A byte and a code point are
both `i32` at runtime; the type layer is where they are kept apart.

**Dependency, stated:** the *ergonomic* form of this diagnostic needs A5c. A weaker
version — rejecting a **literal** char comparison against a byte-typed expression when
the literal's code point exceeds 127 — needs nothing new and should land with the
storage swap. A5c generalizes it to non-literal cases later.

### Scanning: re-slicing is the cursor — DECIDED

VL introduces **no cursor type**. A `String.Index`-style object is the ergonomic this
language exists to avoid, and it is unnecessary: with O(1) slicing, "the rest of the
string" *is* the cursor.

```
while s.length > 0 {
  if s[0] == ' ' { s = s.slice(1); continue }
  …
}
```

`s[0]` is the current byte; `s.slice(1)` is the remainder; `s.startsWith("…")` is
lookahead; saving `s` into a local is a backtrack point. No new concept — this is how
most Rust and Go parsers are written, and it composes with everything else on the
type.

**The more ambitious direction — bit-syntax pattern matching — is filed as OQ-1.**
Erlang/Elixir's binary patterns (`<<"GET ", Path/binary>>`) destructure a string by
*structure* instead of walking it:

```
match request {
  "GET " + path  => get(path)
  "POST " + path => post(path)
}
```

This serves the scanning case — 63% of measured string access — better than either
indexing or re-slicing, and it fits VL unusually well: `match`, literal unions, and
`u8[]` all exist, and **flat types are conceptually the same idea** (structural
destructuring of packed data). Almost nothing mainstream has copied it, which makes it
one of the few genuinely differentiating moves available in this area. It needs its own
design pass and does **not** gate the storage swap.

### `reverse()` — a `std:unicode` operation, not a core one

The core provides **backward iteration** (§Codepoints), not string reversal. Reversal
itself belongs in `std:unicode`, because every cheap definition of it is wrong:

- **Byte-reversing UTF-8 produces garbage** — it shreds multi-byte sequences into
  invalid ones.
- **Code-point-reversing is also wrong for display** — it detaches combining marks
  from their base characters, so `"café"` written with a combining acute reverses into
  a broken cluster with the accent on the wrong letter.
- **Grapheme-reversing is what people actually mean**, and it needs the UAX #29 tables
  that §Unicode keeps out of the core.

So `s.reverse()` lives in `std:unicode`, returns a **new string** (not a view — the
bytes genuinely differ), and is grapheme-correct. A program that wants to walk
backwards wants `s.backwards()` and should not allocate anything.

### Equality and hashing — DECIDED

- **`==` is byte equality, no normalization.** Compare `$len`, then the byte ranges.
  Two strings that render identically but encode differently (`"é"` as U+00E9 vs
  `"e"` + U+0301) compare **unequal**. Normalization-aware comparison is `std:unicode`,
  never the core `==`.
- **The hash is over the bytes,** consistent with byte-domain `==`: two strings hash
  equal **iff** their bytes are equal, which is exactly the contract maps require.
- **The hash is cached in the header** (`$hash`). Strings are immutable, so this is
  compute-once-never-invalidate. It is per-*header*, not per-backing — a slice's hash
  differs from its parent's.

> **Migration note — atomic switch.** `__map_hash__` and `__string_eq__` must move to
> byte-level in the **same** step. A mismatch — one on code points, the other on bytes
> — leaves two byte-equal strings hashing to different buckets, **silently corrupting
> every map** with no error. Indivisible; do not land one without the other.

**Why map lookups are slow today, and what actually fixes it.** Maps already cache the
FNV hash *per entry* (`emit_state.vl:866` — "CACHED FNV hash of `keys[i]`, stored on
append"). What is **not** cached is the hash of the **lookup key**: every `m[k]`
re-hashes `k` from scratch. Three fixes, in descending value:

1. **Cache the hash in the string header** (above). The compiler is overwhelmingly
   map-key-heavy — symbol tables, scopes, interned names — and hashes the *same
   immutable key object* repeatedly. Largest win, one `i32` field.
2. **Replace FNV-1a.** Its serial `mul` chain is already documented as a bottleneck in
   this codebase (`emit_sections.vl:1887` — *"FNV is a SERIAL dependency chain — each
   `i32.mul` waits on the previous `h`"*). xxHash/wyhash-family hashes process
   **independent lanes and combine**, worth 4–8× on plain scalar hardware. **The catch
   over a GC `(array i8)`:** building a lane word costs 4 `array.get_u` + shifts where
   linear memory does one `i64.load`, which eats much of the gain — so this fix argues
   for the `Buffer` tier on long keys (§Memory).
3. **Intern compiler-side keys to integers.** The fastest string hash is the one not
   computed.

**SIMD is not the answer here** and should not be reached for: setup cost dominates
below ~16 bytes, and identifiers — the actual key population — are 3–20.

### Memory: `string` is GC; `Buffer` is the linear/SIMD tier — DECIDED

Two hard facts about wasm frame this:

1. **Wasm SIMD (`v128`) operates on linear memory only.** There is no SIMD over GC
   arrays and no proposal for it. A GC-backed string is **never** vectorizable.
2. **A GC `(array i8)` cannot be read word-at-a-time.** `array.get_u` reads one
   element; linear memory offers `i64.load` (8 bytes) and `v128.load` (16). That is an
   8–16× gap on every scan-heavy operation — hashing, comparison, search, validation.

**The decision: `string` stays GC. Scan-heavy work lives in `Buffer` (B-mem).**

- The ubiquitous case is **small strings** — identifiers, map keys, diagnostics. For
  those, scan throughput is irrelevant and *lifetime* is everything; GC is exactly
  right and an allocator on that path would be a regression.
- The cases where vectorization pays — regex, large-text search, UTF-8 validation,
  bulk parsing — **already want an explicit buffer**, and `std:regex` is already
  scoped to run over bytes (§Regex).
- **H-M2 needs the linear tier regardless** (WASI's ptr/len ABI cannot take GC refs).
- The roadmap already lands here: B-mem scopes `Buffer` "once for FFI / SIMD /
  bulk-I/O rather than accreted as intrinsics," and files "SIMD over Buffer" as
  unlocked-but-unrequested.

**Rejected: a string that views *either* backing.** A `GC-array | linear-region`
tagged backing would let one type serve both. Rejected because **every access would
branch on the tag** — and a ladder whose arms must be kept in sync is the single
defect shape this emitter is most prone to (nine instances in one recent session, every
one "a ladder with an arm its sibling lacks"). It also doubles the retention story. The
explicit `string` ↔ `Buffer` boundary is more honest and vastly safer.

**The honest cost.** VL's `indexOf` over a large string will never be SIMD-fast; the
answer is "use a `Buffer`," which is a real ergonomic seam. It is taken knowingly, and
recorded here so it is a stated consequence rather than a discovered one.

### Byte view: `s.bytes()` is zero-copy — DECIDED

`s.bytes()` returns a **`u8[]` view over the same backing** — not a copy. Because
strings are immutable (§Mutability), the view aliases `$backing`/`$start`/`$len`
directly with no defensive copy and no invalidation risk; constructing it is O(1).
This is the FFI and host-boundary path, and it now composes with the `u8[]` surface
that shipped with `std:fs`.

### Validity: bytes that are usually UTF-8 (Go-lean) — DECIDED

A string is bytes that are *usually* UTF-8, **not a validated invariant**. No
validation at the host boundary; malformed sequences decode **leniently to U+FFFD**
rather than trapping or rejecting. Rust-strict is the rejected alternative — it puts
an O(n) scan on every host boundary to uphold a guarantee VL's own producers already
satisfy (the lexer only emits valid code points), and it turns a routine "read a file
with one bad byte" into an error path.

This also means **slicing off a character boundary is legal**, producing partial
sequences at the edges that decode as U+FFFD. `s.isCharBoundary(i)` is there for code
that cares.

### Unicode scope: graphemes / normalization / collation are out of the core — DECIDED

The core string is **bytes + byte indexing + code-point iteration** — nothing more.
The richer operations each need **large, Unicode-version-dependent tables**:

- **Grapheme segmentation** (UAX #29) — the user-perceived "character."
- **Case mapping** (`ß`→`SS`, Turkish dotless `i`), **normalization** (NFC/NFD), and
  **collation** (locale-aware sorting).

These live in an opt-in **`std:unicode`**, matching precedent — Rust ships segmentation
as an external crate, Go puts normalization/collation/segmentation in
`golang.org/x/text`, not core `string`.

**Consequences for the core surface:**

- **No grapheme `length` and no grapheme subscript in core.** `s.graphemes()` comes
  from `std:unicode` without changing the core.
- **`toUpper`/`toLower`:** the core provides the **ASCII-only** forms, and they must be
  *named* as such (`toUpperAscii`) or documented as ASCII-only — an unqualified
  `toUpper` that silently ignores non-ASCII is the same class of quiet lie this design
  rejects elsewhere. Full-Unicode case mapping and folding are `std:unicode`. *(The
  previous revision claimed `"hello".toUpper()` was "core and free"; no case-mapping
  method exists today at all — see §Methods.)*
- **`reverse()` is `std:unicode`** (§Reverse).
- **Comparison stays byte-exact in core**; normalization-aware comparison and collation
  are `std:unicode`.

### Regex: `std:regex`, a byte engine over the backing — DESIGN

Regex **reinforces** this design rather than straining it, and under byte indexing the
fit is now seamless.

- **Lives in `std:regex`.** Programs that never match never link the engine.
- **Runs over the UTF-8 bytes directly** — the Rust-`regex`/RE2 model: a byte-indexed
  NFA/DFA consuming `$backing` as-is, **no per-character decode in the hot path**. A
  multi-byte code point is just a fixed byte sequence in the automaton.
- **Match positions are byte offsets — the same coordinate system as everything
  else.** This is the change from the previous revision, and it removes a seam rather
  than documenting one: `s.slice(m.start, m.end)` now simply *works*, with no
  converter, no O(n) coordinate translation, and no risk of feeding a byte offset to a
  code-point-indexed operation. **Slicing a match is O(1)** — it is a view over the
  same backing (§Header).
- **Unicode character classes share `std:unicode`'s tables.** `\w`, `\d`, `\p{L}` are
  compiled to byte-class transitions; ASCII-only patterns (`[a-z0-9_]`) need no tables.
- **Lenient on malformed bytes**, consistent with §Validity.

The framing that now holds end to end: **bytes are the unit — of storage, of the
index, of the regex engine, of the match offsets, and of the I/O boundary. Code points
are a decoding you ask for by name.**

### Mutability: strings are immutable — DECIDED

Immutability is what makes the cached hash (§Equality) a pure win, the byte view
(§Bytes) safe to alias, and slice views (§Header) free of invalidation. In-place
update stays an opportunistic compiler optimization, never a surface guarantee.

> **CORRECTION — B7b DOES NOT SHIP, AND THE PERF TRAP IS OPEN.** An earlier version of
> this section said "B7b string-accumulation fusion already ships on this basis," and
> cited it as precedent that the compiler can pattern-lower a whole loop shape.
> **`DECISIONS.md` records B7b as shipped, but it shipped in `compiler/toWasm.ts` and
> died with the TS core — it was never ported to `compiler/*.vl`.** There is no
> recognizer: `grep -rn "accumulat" compiler/*.vl` finds only unrelated comments.
>
> Measured on the native compiler, `s = s + piece` in a loop is **quadratic**:
>
> | appends | time |
> |---|---|
> | 20,000 | 0.31 s |
> | 40,000 | 1.44 s |
> | 80,000 | 9.47 s |
>
> **And the fixtures named for it are blind to it.** `tests/cases/strings/accum-*.vl`
> assert only the RESULT — `accum-basic.vl` pins `@log 5` and `@log xxxxx` over a
> five-iteration loop — which per-append concat produces just as correctly. They pass,
> and always would have, on a compiler with no fusion at all. A fixture that pins a
> value cannot pin a cost class.
>
> Consequences: **(a)** the O(n²) string-build trap is OPEN, not closed, and is now the
> live half of OQ-2; **(b)** the argument that pattern-lowering an indexed loop has
> in-repo precedent is **withdrawn** — the precedent does not exist; **(c)** every
> builder in `std:str` therefore fills an `i32[]` and calls `fromCodePoints` once (the
> `compiler/format.vl` idiom), measured at **28 ms vs 12,475 ms** for a 40,000-piece
> `join`.

In-place update stays an opportunistic compiler optimization, never a surface
guarantee — but today no such optimization exists for strings.

---

## The method surface — the largest user-facing gap

> **Step 1 has SHIPPED as `std:str`.** The gap described below is closed as a
> LIBRARY: `std/str.vl` implements `split`, `join`, `trim`/`trimStart`/`trimEnd`,
> `startsWith`/`endsWith`, `lastIndexOf`, `replace`/`replaceAll`, `repeat`,
> `padStart`/`padEnd` and `toUpperAscii`/`toLowerAscii` in ordinary VL over the six
> primitives — no emitter change, no new intrinsic, no rep dependency. It rides UFCS
> (`self`-first parameters), so `"a,b".split(",")` reads as a method on a string
> receiver. Fixtures: `tests/cases/std/str-*.vl`. **Whether these names ultimately
> live in the CORE rather than behind an import is still OQ-3** — the table below is
> the proposal, and `std:str` is deliberately the reversible half of it: promoting a
> name from `std` to the core is additive, demoting one is not.
>
> Two things the implementation found that this document did not predict:
> **(1)** the B7b string-accumulation fusion recorded in `DECISIONS.md` (and cited by
> §Mutability below) exists only in the DELETED TS emitter — `s = s + piece` in a
> loop is measured quadratic on the native compiler today, so every builder in
> `std:str` fills an `i32[]` and calls `fromCodePoints` once. **(2)** a bare member
> CALL in implicit-return (tail) position — `function f(s: string) { s.slice(1, 2) }`
> — passes `vl check` and fails at emit with `unsupported member-call statement`; the
> adjacent shape `s.slice(a, b).length` is pinned by
> `tests/cases/strings/slice-member-tail.vl` and works. An explicit `return` is the
> workaround.

VL's entire string method surface in the CORE is **six operations**: `slice`,
`indexOf`, `includes`, `charCodeAt`, `fromCodePoint`, `toString` — plus `+`, `==`,
`.length`, `s[i]`, and `for cp in s`.

**You could not split a string in VL** before `std:str`. No `split`, `join`, `trim`,
`replace`, `startsWith`, `endsWith`, `padStart`/`padEnd`, `repeat`,
`toUpper`/`toLower`.

This matters for sequencing, because **the method surface is rep-independent**: every
one of these is writable today against `array i32` and survives the UTF-8 swap
unchanged, since the operations are defined on the surface and not the storage. And
there is a second reason to land them first — **the string library is the test suite
for the string rep change.** Migrating the representation with only six methods'
worth of fixtures, against an emitter whose known failure mode is a silently missing
ladder arm, is a thin instrument.

Proposed core-vs-`std` line (OQ-3 refines it):

| Core | `std:unicode` | `std:regex` |
|---|---|---|
| `split`, `join`, `trim`/`trimStart`/`trimEnd` | `graphemes()` | pattern compile/match |
| `startsWith`, `endsWith`, `indexOf`, `lastIndexOf`, `includes` | `toUpper`/`toLower` (full) | capture groups |
| `replace`, `repeat`, `padStart`, `padEnd` | `normalize` (NFC/NFD) | `split`/`replace` by pattern |
| `toUpperAscii`, `toLowerAscii` | `collate` | |
| `slice`, `bytes`, `cpAt`, `cpLen`, `backwards`, `compact`, `isCharBoundary` | `reverse()` | |

Splitting returns **views** (§Header), so `s.split(",")` over a large input allocates
headers, not bytes.

---

## Migration / phasing

Each step is independently shippable. The gate that used to precede this list —
"not before bootstrap" — is satisfied.

**Step 0 — measure the header cost.** Before any rep change, measure the two-object
break-even (§Header): at what byte length does `{header, backing}` cost more than
today's single `array i32`? The compiler's own workload is short interned identifiers,
so this is where the memory claim is weakest and it must carry a denominator. If the
crossover is bad enough, the fallback is a bare `array i8` with copying slices — which
costs §Scanning its cursor idiom, so the measurement genuinely decides a design
question, not just a number.

**Step 1 — the method surface, on the current representation. DONE, as `std:str`.**
`split`, `trim`, `join`, `replace`/`replaceAll`, `startsWith`/`endsWith`,
`lastIndexOf`, `repeat`, padding, ASCII case — all pure VL over the six primitives,
all UFCS-reachable, none of it touching the emitter. Rep-independent, immediately
useful, and it builds the fixture corpus the rep change will be validated against:
`tests/cases/std/str-*.vl`, 163 pinned lines over 7 files whose assertions are written against
the SURFACE and not the storage (equality and slices, never a `.length` over a
multi-byte character), so they survive step 2 unchanged and go red if it goes wrong.
`std:fmt`'s four string helpers were re-pointed at it rather than duplicated.

**Step 2 — the storage + header swap, in ONE rep migration.** `array i32` of code
points → `{backing: (array i8), start, len, hash}` of UTF-8, with `s[i]`/`.length`
becoming byte-valued and `slice` becoming a view. Host boundaries become bulk copies.
Go-lean validity lands here.

> **One migration, not two.** An earlier plan sequenced this as bare-array first, then
> promote to a struct. That is **two full rep migrations of the most-used type in the
> compiler**, each with its own fixpoint, corpus, and rep-fuzz exposure — and doubling
> rep migrations doubles exposure to the one defect class this emitter demonstrably
> has. Go to the final shape once.

> **STAGE 2b DEVIATES FROM THAT RULING, DELIBERATELY, AND HERE IS THE ARGUMENT — plus the
> one place it turned out to be weaker than claimed.** Step 2 shipped in two pieces: **2b**
> is the header WITH views and the element type UNCHANGED (i32 code points); **2c** is the
> UTF-8 byte swap. That is *not* the pair the ruling above rejects, on two counts.
>
> **1. The rejected pair is bare-`array i8` first, then promote.** Its intermediate state is
> a *different unit with no views* — every `s[i]` changes meaning AND every `slice` still
> copies. §1.7 row 3 of `../internals/string-rep-measurements.md` prices exactly that state
> at a **net loss** (+1.7 % null / +15.2 % copying / +26.8 % DRC on the per-string
> population), worse than either endpoint. Stage 2b's intermediate state is the opposite:
> the unit does not move at all, and the views land in the SAME change as the header, so the
> state §1.7 prices as worse than both endpoints is never entered. There is no rung of this
> ladder where `slice` copies under a header.
>
> **2. It buys a check the combined change could not have.** Because 2b changes no
> semantics, it is verifiable by **behavioural identity against master** — the 1,619-file
> corpus sweep must come back *file-for-file identical*, not merely green, and it did
> (PASS 1617 / CHECKFAIL 2 / RUNFAIL 0 / LOGDIFF 0, the same set). Once the element type
> moves, that instrument is gone: three fixture assertions legitimately change output
> (§2.0), so "identical" stops being the expected answer and every diff has to be
> adjudicated by hand. Splitting the migration spends the strongest available check on the
> half that can use it.
>
> **AND THE ARGUMENT IS WEAKER THAN IT LOOKS IN ONE SPECIFIC WAY — stated because the point
> of recording a deviation is to make it auditable, not to make it look good.** Behavioural
> identity is only as strong as the corpus's ability to express the disagreement, and this
> area holds a live instance of exactly that limit: `emitNarrowedMem`'s `D-UNION-ATOM-KIND`
> string arm is reachable, but **nothing in the 1,618-file corpus reached it** until #1844
> added a fixture. A gate that cannot see a site cannot certify it, and a byte-identical
> sweep says nothing about the arms no fixture exercises. The completeness gate is real (a
> wrong heap index IS invalid wasm) but it is a *reachability* gate, and its reach is the
> corpus, not the emitter.
>
> **The honest cost of the split, measured.** Stage 2b's own numbers: the self-compile
> fixpoint grows **1 311 933 → 1 361 951 bytes (+3.8 %)** and self-compile wall time
> **1.96 s → 2.00 s (+2 %)**, against a **7.2× drop in bytes allocated** by split-heavy
> substring work (525 900 kB → 73 272 kB over 100 splits of a 1.22 M-code-point input).
> An indexed read costs **+10 %** on an 800 M-iteration scan, because a view's bounds check
> has to be explicit where a bare array's `array.get` trapped for free. Those are costs 2c
> would have absorbed into one number; splitting makes them separately attributable, which is
> the point. Full table in `../internals/string-rep-measurements.md` §2.5.

> **The heap-type split (2a) is DONE and is not one of the two.** `string` had no heap
> type of its own: it shared `aTypeIdx` with the i32 list's backing, so "change the
> storage" had no single place to happen. It now has `sTypeIdx` — still
> `(array (mut i32))` of code points, so **no value, no unit and no lowering changed**,
> and the corpus buckets are file-for-file identical. This is index bookkeeping, not a rep
> migration: it does not build the header, does not touch a unit, and never produces the
> half-migrated state §1.7 of `docs/internals/string-rep-measurements.md` prices as worse
> than either endpoint. What it buys is that step 2 edits one type DEFINITION instead of
> hunting 168 shared call sites while also changing their meaning. The eight sites that
> had to stop sharing are enumerated and closed in §2.2 of that file.

Gates for step 2 are the full ladder, non-negotiable: `deno task test`, the native
align suites, `scripts/native-fixpoint.sh` (byte-exact), `scripts/lint-self.sh`, and
**`scripts/rep-fuzz-check.sh`** — mandatory, since this is a representation change and
the corpus, the suites, and the fixpoint are all blind to REJECT→MISMATCH.

Note the fixpoint is a genuinely load-bearing instrument here: the compiler's **97
non-ASCII string literals** are all diagnostic messages, so a broken multi-byte
encode/decode surfaces as a fixpoint break rather than passing silently.

> **Read `docs/internals/str-byte-semantics.md` before starting Step 2.** It is the
> per-function audit of what this step does to the 15 `std:str` exports: 7 unchanged,
> **0** that get more correct, 5 that were BROKEN as shipped, and 3 that need an owner
> ruling. The broken five are already repaired (every builder in `std:str` filled an
> `i32[]` by `buf.push(s[i])` and drained it through `fromCodePoints`, whose contract
> is code points — so the day `s[i]` becomes a byte, `join`/`replaceAll`/`repeat`/
> `padStart`/`padEnd`/`toUpperAscii`/`toLowerAscii` all start double-encoding, with no
> type error, because a byte and a code point are both `i32`. Measured on today's
> build: `fromCodePoints([195, 169])` is `"Ã©"`.) **`std/utf8.vl` had the same defect
> class in 2 of its 5 exports and is NOW AUDITED —
> `../internals/utf8-byte-ready.md`.** `utf8Length` and `encodeUtf8` both indexed
> a string and are repaired the same way, byte-identically on today's build; the
> other three exports take a `u8[]` and are untouched by the swap. The module
> does **not** collapse: §Validity's Go-lean ruling means the core will never
> validate, so strict decode, positioned `Utf8Error` reporting and WHATWG
> sanitization stay its job — 2 of 5 exports become core one-liners, 3 stay.
> That audit ruled `Utf8Error.at` (a byte offset, relative to `off`) and filed
> three questions the swap forces on the **CORE** — `../internals/open-rulings.md`
> §B `utf8-byte-swap-core-rulings` — of which the one that fails silently is what
> `fromCodePoints` does with a non-scalar element once there is no `i32` to store
> it in. Its companion fixture `tests/cases/std/utf8-invariant.vl` is to
> `std:utf8` what `str-multibyte.vl` is to `std:str`.
>
> The audit also verified this document's own load-bearing claim rather than
> restating it: *a substring match IS a byte match* holds — 73,800 exhaustive
> haystack/needle pairs over a byte-colliding alphabet plus 200,000 randomized
> trials, in `findFrom`/`lastIndexOf`/`startsWith`/`endsWith`/`split`/`replaceAll`/
> `trim`, **zero disagreements** — with one precondition worth carrying: it needs the
> NEEDLE to be valid UTF-8, and a needle sliced at a non-character boundary can
> legitimately match mid-character.
>
> The new fixture `tests/cases/std/str-multibyte.vl` is the instrument for this step.
> Every other `str-*.vl` file is pure ASCII and **cannot tell the two representations
> apart**; that one can.

**Step 3 — `__map_hash__` and `__string_eq__` to byte level, atomically** (§Equality),
together with the header's cached hash.

**Step 4, independent and opt-in:** `std:unicode` (graphemes, normalization,
collation, full case, `reverse`) and `std:regex` (§Regex). Neither gates the above.

**Also unblocked by step 2, tracked elsewhere:** `ArrayRef::new_from_i8_slice` for
single-memcpy host staging (B-mem), and the UTF-8 encode/decode half of **H-M2**
(killing the Rust host).

---

## Open questions

Decided above and not open: the index unit (bytes), what `'a'` denotes (a code point),
validity (Go-lean), graphemes/case/collation (opt-in module), mutability (immutable),
equality and hashing (byte-level, cached), reversal (`std:unicode`), and the GC/linear
split (`string` GC, `Buffer` linear).

**OQ-1 — bit-syntax pattern matching (§Scanning).** Erlang-style structural
destructuring of strings/binaries. The strongest differentiating idea in this area and
the best fit for the 63% scanning case, but it is a language-surface feature needing
its own design pass. Does not gate anything here. *Owner call: worth a design pass, or
is re-slicing enough?*

**OQ-2 — string building, interpolation, and formatting.** The perf half is **done**
(B7b fusion, §Mutability). The ergonomic halves remain: an explicit builder type for
cases fusion cannot see, interpolation syntax (`f"Hello {name}"` or
`` `Hello ${name}` ``), and a `std:fmt`. *Recommendation: interpolation is the highest
ergonomic value now that fusion covers the perf trap; `std:fmt` can back it.*

**OQ-3 — the core-vs-`std` line for the method surface. RESOLVED (owner ruling): the 15
names STAY IN `std:str`.** Not promoted to compiler intrinsics. Three reasons, in order
of weight:

1. **Emitter cost, against this compiler's known weakness.** A core string method is not
   one site: `slice` spans **5** across `emit_collect`/`emit_classify`/`typecheck`,
   `includes` 3, `indexOf` and `charCodeAt` 1 each — and 10 of the 15 return *strings*,
   the expensive kind that needs rep classification. Promotion buys roughly **48 new
   hand-synced ladder arms** in an emitter whose signature defect is *a ladder with an
   arm its sibling lacks* — twelve instances in one month, including `decodeStr`'s
   missing line-continuation arm (#1837).
2. **Promotion is one-way, and the representation is about to move.** Demoting a core
   name breaks code, so intrinsics would freeze 15 semantics immediately before Step 2
   changes what they mean. In VL those semantics cost a library edit; in the emitter
   they cost a compiler release. (`split`/`indexOf`/`replace` written byte-wise give the
   IDENTICAL answers for free under UTF-8 — a substring match **is** a byte match,
   now verified rather than asserted; see `../internals/str-byte-semantics.md`
   §Property. "*More* correct" was the wrong word: the audit found **nothing** in
   `std:str` that code-point semantics was getting wrong, so what the search family
   gains is speed and view-slices, not correctness. But `padStart(s, 3)` must decide
   bytes-or-characters, and that ruling wants to be cheap — it is filed as §R1 of the
   audit and indexed in `../internals/open-rulings.md`.)
3. **The optimization argument for intrinsics is not real here.** It was tabled as
   "core methods can be constant-folded and fused." **VL does neither, for any of the
   six existing core methods.** `print("abcdef".slice(1,3))` is **932 bytes** against
   **797** for `print("bc")`, and the gap survives `-O` (**235** vs **159**) — a core
   intrinsic with two literal operands is emitted as runtime work. Folding is also not
   intrinsic-exclusive: a pure function called with literal arguments can be
   const-evaluated whatever module it lives in.

**The ergonomic follow-on is the prelude, not promotion.** "No import line" and
"discoverable" are the only advantages promotion retained, and both are served by the
**configurable prelude** already specified in `../internals/modules-design.md` — as
*data*, reversibly, with local definitions shadowing prelude names (B16). Under that
document's selection principle (*a module belongs in the default set iff it operates on
a type with literal syntax*), `std:str` qualifies on `"…"`. Cost of an ambient module in
a shipped `-O` build is **~210 bytes**, and it does not scale with module size. Nothing
further to decide here; it needs the prelude mechanism to exist.

**OQ-4 — automatic compaction.** Should the compiler ever auto-`compact()` a small
view of a large backing that escapes into a long-lived structure, or is the retention
hazard always the programmer's to manage explicitly (Go's answer)? *Recommendation:
explicit by default; revisit only if a real leak shows up.*

**OQ-5 — how strict the char-literal diagnostic should be** (§Char-literal trap)
before A5c lands. The literal-vs-byte case is unambiguous and should ship with step 2;
how far to push it over non-literal expressions is a tuning question.

---

## Sources

- Rust: `std::str` docs (`chars`, `is_char_boundary`, byte-range slicing); the `regex`
  crate's byte-automaton design.
- Go: the `string` type as an immutable `{ptr, len}` byte slice; `for i, r := range s`;
  `strings.Clone` and the substring-retention idiom.
- Swift: SE-0180 and the Swift 5 UTF-8 migration; `String.Index` and grapheme-cluster
  `Character`.
- Python: PEP 393, flexible string representation.
- Ruby: `coderange` (`7BIT`/`VALID`/`BROKEN`/`UNKNOWN`).
- V8 / JavaScriptCore: one-byte (Latin-1) vs two-byte string forms.
- Java: JDK 7u6 `substring` change from view to copy (retention).
- Erlang/Elixir: binary/bit-syntax pattern matching.
- Unicode: UAX #29 (grapheme cluster boundaries), UAX #15 (normalization).
- WebAssembly: the GC proposal (packed `i8` array storage, `array.get_u`/`array.copy`);
  the SIMD proposal (`v128` over linear memory); the `wasm:js-string` builtins.
- In-repo: `docs/guide/collections-design.md`, `docs/internals/memory-gc-design.md`
  (§2.2 word-at-a-time, §4.4 allocation), `docs/internals/modules-design.md`,
  `ROADMAP.md` B7 / B-mem / H-M2, `DECISIONS.md` A7 / B7b.

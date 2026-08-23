# `std:str` under byte-indexed UTF-8 — the semantic audit

> **Status: audit, complete. Three owner rulings open; nothing else in the module
> is undecided.** This document is what the string representation migration
> (`docs/guide/strings-design.md` §Storage / §API, "Step 2") implements against
> for `std/str.vl`. It classifies all 15 exports, states the property the search
> family depends on and reports the test that verified it, records the one defect
> the audit found in shipped code, and files the three questions the migration
> cannot answer for itself.
>
> Companion fixture: **`tests/cases/std/str-multibyte.vl`** — the assertions that
> must be *identical* before and after the swap. Companion filing:
> `docs/internals/open-rulings.md` §C `str-byte-index-unit-rulings`.

## The question

`docs/guide/strings-design.md` decides it: storage becomes UTF-8 `array i8`,
`s[i]` becomes a **byte**, `.length` becomes a **byte count**, `slice` takes
**byte offsets** and returns a **view**, and code points come from `for cp in s`
/ `s.backwards()` / `s.cpAt(i)` / `s.cpLen()`.

`std/str.vl` shipped 15 UFCS exports written against today's code-point surface.
Which of them change meaning, which get silently more correct, and which need an
owner ruling?

The module's own header claims immunity — *"nothing here converts between units
or assumes which one it is, which is what makes the whole module survive
§Storage unchanged."* **That claim is true of the search half and false of the
building half**, and the failure is silent: it produces mojibake, not an error.

## Summary

| Class | Count | Exports |
|---|---|---|
| **(a) UNCHANGED** — byte-wise is already correct | **7** | `startsWith`, `endsWith`, `lastIndexOf`, `replace`, `trim`, `trimStart`, `trimEnd` |
| **(b) CHANGED, and the new behaviour is right** | **0** | — (see §No-b) |
| **(c) NEEDS AN OWNER RULING** | **3** | `padStart`, `padEnd` (§R1), `split` (§R2) |
| **(d) BROKEN as shipped** — needs reimplementation | **5** | `join`, `replaceAll`, `repeat`, `toUpperAscii`, `toLowerAscii` |

Every (d) is repaired in this PR, in the module, without an emitter change — the
repair is byte-identical on today's build (all seven pre-existing `str-*.vl`
fixtures pass unmodified) and correct after the swap. **The (d) class is the
finding that matters**: seven of the fifteen exports (the five above plus the two
padders, which reach the same defect through `padFill`) would have shipped
silently wrong output the day the representation changed.

The classification is the *worst* thing that happens to each export. `split` is
(a) for every non-empty separator — the whole real use — and (c) only for `""`;
`padStart`/`padEnd` were mechanically (d) as well as (c).

---

## §Property — "a substring match IS a byte match": VERIFIED, with its precondition

**Claim.** For strings the search family answers the same question whether it
compares code points or bytes, so `indexOf`/`split`/`replace`/`startsWith`/
`endsWith` written byte-wise give identical answers and get faster.

**Why it should hold.** UTF-8 is self-synchronizing. Every byte of a multi-byte
sequence after the first is a *continuation byte* `10xxxxxx` (0x80–0xBF); every
first byte is either ASCII (0x00–0x7F) or a *lead byte* (0xC2–0xF4). Neither an
ASCII byte nor a lead byte is ever a continuation byte, so:

1. A needle that is **valid UTF-8** begins with an ASCII or lead byte, which can
   only occur in a valid haystack at a character boundary. A byte match therefore
   **cannot start mid-character**.
2. A match that starts on a boundary consumes exactly the needle's complete
   sequences, so it also **ends on a boundary**.

Hence *byte match ⟺ code-point-sequence match*, and the matched byte offset is
exactly the byte offset of the code-point index.

**How it was checked.** Not by accepting the argument. `std/str.vl`'s algorithms
(`matchAt`, `findFrom`, `lastIndexOf`, `split`, `replaceAll`, `spanStart`/
`spanEnd`/`trim`) were re-implemented generically over a sequence and run in two
domains — code points and UTF-8 bytes — over the same inputs, with the byte
answer mapped back through the code-point↔byte offset table:

- **Exhaustive:** all haystacks up to length 3 and all needles up to length 2
  over the alphabet `{a, b, é, Ã, ©, →, 𝄞, U+0301, space}` — **820 haystacks ×
  90 needles = 73,800 pairs**, each checked for `findFrom`, `lastIndexOf`,
  `startsWith`, `endsWith`, `split`, and `replaceAll` against three replacement
  strings of 1, 2 and 3 bytes. Plus every string up to length 4 over
  `{a, space, tab, é, →}` for `trim`.
- **Randomized:** **200,000 trials**, haystacks up to 12 characters, needles
  biased 50% toward real substrings of the haystack, pool widened to include
  U+10FFFF (the last code point), U+FEFF (BOM), U+07FF/U+0800/U+FFFF (the width
  boundaries) and a combining mark.

**Result: zero disagreements, in every operation, on every input.** The alphabet
was chosen adversarially and that is the part worth keeping: `é` is `C3 A9`, `Ã`
is `C3 83`, `©` is `C2 A9`, so the three collide pairwise on a lead byte or a
trailing byte — the shape that would expose a straddling match if one existed.
None does.

**The precondition, which is not academic.** The property needs the **needle** to
be valid UTF-8. Once `slice` takes byte offsets, a program can *manufacture* an
invalid needle, and §API deliberately permits it ("slicing at a
non-character-boundary is *permitted* … it decodes leniently to U+FFFD"):

```
"héllo"        bytes 68 C3 A9 6C 6C 6F
"héllo".slice(2, 3)   ->  the single byte A9, a lone continuation byte
"héllo".indexOf(that) ->  2     <- a NON-boundary offset, correctly reported
"é→".slice(1, 3)      ->  bytes A9 E2, the tail of one character and the head
                          of the next; found at offset 1, matching ACROSS a
                          character boundary
```

Both are *correct byte answers* to the question asked. They are noted here so the
migration does not later read them as a search bug: **the search family has no
boundary logic and needs none; validity is a property of the inputs, and
`isCharBoundary` (§API) is the tool for a caller that cares.** No function in
`std:str` produces such a slice — every offset it hands to `slice` comes from a
match position or `.length`.

**What is NOT covered by this property.** It says nothing about the *empty*
needle (§R2), nothing about a *width* argument (§R1), and nothing about the
builders (§Builders) — those write bytes rather than compare them.

---

## §Builders — the defect the audit found in shipped code

**Every builder in `std/str.vl` fills an `i32[]` and drains it through
`fromCodePoints`.** That idiom is in the module header as the answer to the
measured O(n²) string-accumulation trap, and the cost argument is right. The
**unit** argument was missing.

`fromCodePoints` is a core builtin typed `(i32[]) => string` (`driver.vl:1123`)
and its contract is fixed by its name: **each `i32` is a code point.** The
buffers were filled by `buf.push(s[i])`. Today `s[i]` *is* a code point, so the
producer and the consumer agree by coincidence. §API changes `s[i]` to a byte,
and the two stop agreeing — with no type error, because a byte and a code point
are both `i32` (exactly the hazard §Char-literal-trap names).

The result is **double encoding**, measured on today's build rather than
predicted — the UTF-8 bytes of `é` are `C3 A9` = 195, 169:

```vl
const bytes: i32[] = [195, 169]
print(fromCodePoints(bytes))          // Ã©
print(fromCodePoints(bytes) == "é")   // false
```

So `"é→".repeat(3)` would have returned six mojibake characters, `["é"].join("·")`
would have mangled its own input, and `"café".toUpperAscii()` would have returned
`"CAFÃ©"`. Silently — the output is a perfectly valid string, just the wrong one,
and no ASCII test can see it.

**Reach: 7 of the 15 exports.**

| Helper | Defect | Exports reached |
|---|---|---|
| `pushRange` / `pushStr` | `buf.push(s[i])` | `join`, `replaceAll`, `repeat` |
| `replaceAll`'s empty-`from` arm | `buf.push(self[c])` | `replaceAll` |
| `mapAsciiCase` | `buf.push(self[j] + caseShift(…))` | `toUpperAscii`, `toLowerAscii` |
| `padFill` | `buf.push(pad[i % pad.length])` | `padStart`, `padEnd` |

**The repair, applied here.** Feed the buffers by **iteration** instead of by
index: `for cp in s { buf.push(cp) }`. `for cp in s` yields code points today and
§Codepoints keeps it yielding code points after the swap, so producer and consumer
are a matched pair whose meanings move together — i.e. not at all. `pushRange`
becomes `pushStr(s.slice(lo, hi))`; `mapAsciiCase` and `replaceAll`'s empty arm
iterate; `padFill` becomes `repeat(pad, k).slice(0, n)`, which has no element read
at all. This is the *cheap migration-proofing* the audit was asked for: it is a
no-op today (proven — the seven pre-existing fixtures pass byte-identically) and
it removes the whole class.

**Two costs, stated.** (1) `pushRange` now materializes a slice; that is a copy
today and free after the swap (§Header makes `slice` a view), so the direction of
the cost is toward the target rep, not away. (2) After the swap these builders
decode and re-encode UTF-8 where a byte copy would do. That is the price of being
correct with a code-point-typed `fromCodePoints`; the follow-on optimization is a
`fromBytes`-shaped primitive (or `Buffer`), and it is **an optimization on a
correct implementation, not a prerequisite**. Filed here, not done.

**Adjacent, out of scope, worth someone's attention:** `std/utf8.vl` has the same
defect class and is *not* covered by this audit. `utf8Length` and `encodeUtf8`
both walk `while i < self.length { … self.charCodeAt(i) … }` — a code-point walk
over what will be byte indices — so after the swap `encodeUtf8` re-encodes bytes
as UTF-8 and `utf8Length` returns the byte length of the *doubly*-encoded form.
It may be that most of `std:utf8` simply becomes `s.bytes()` after §API, which is
a design call rather than a repair; either way it is not the 15 functions this
document was scoped to and it was left alone.

---

## §Table — the 15, one by one

Legend: **(a)** unchanged · **(b)** changed for the better · **(c)** needs a
ruling · **(d)** broken as shipped.

### Search — `startsWith`, `endsWith`, `lastIndexOf`

| | |
|---|---|
| **Class** | **(a) UNCHANGED** — all three |
| **Why** | All three are policies about *which offset* to hand `matchAt`, and `matchAt` is an element-by-element compare. §Property says that compare gives the same verdict byte-wise, so all three give the same verdict. `endsWith`'s `self.length - suffix.length` is a byte subtraction over byte lengths and lands on the same character; a suffix longer than the string still goes negative, and `matchAt`'s `at < 0` guard still catches it. |
| **What moves** | `lastIndexOf`'s **return value** is a byte offset, so `"héllo".lastIndexOf("l")` is 3 today and 4 after. That is `.length` changing, not `lastIndexOf` changing: the number is in the same coordinate system as `slice`, `indexOf` and `std:regex` (§API's "one coordinate system"), so `h.slice(at, at + n.length)` is invariant. Pinned that way in the fixture. `-1` for absent is unit-free and invariant. |
| **What gets better** | Faster: the compare is over `array i8` instead of `array i32`, and the `at + needle.length > self.length` bail rejects earlier on multi-byte needles. |

### Split — `split`

| | |
|---|---|
| **Class** | **(c) NEEDS A RULING** (§R2) — but **(a)** for every non-empty separator |
| **Why (a) for a real separator** | A separator is a needle; §Property covers finding it, and the pieces are `slice`s at match boundaries, which are character boundaries. `"a→b→c".split("→")` is `["a","b","c"]` before and after. |
| **Why (c)** | An **empty** separator has no match to be a boundary — the boundary is whatever the implementation says it is, and the index unit changes what that is. `"héllo".split("")` is 5 pieces today; a byte reading gives **6**, two of which are half a character. §R2. |
| **What gets better** | Pieces become **views** (§Header): splitting a 1 MB file into 10k lines allocates 10k headers and copies zero bytes. On a compiler whose heap does not free, that is a real change, but it is a cost change, not a semantic one. |

### Join — `join`

| | |
|---|---|
| **Class** | **(d) BROKEN as shipped** → repaired here |
| **Why** | Pure `pushStr` + `fromCodePoints` (§Builders). `["é"].join("·")` would have returned `"Ã©"`-class mojibake. The `length == 0` / `length == 1` early returns were always safe — they never touch the buffer — which is why a one-element join (the common result of splitting on an absent separator) would have looked fine while everything else broke. |
| **After repair** | (a). Values invariant; the buffer decodes and re-encodes where a byte copy would do (§Builders). |

### Replace — `replace`

| | |
|---|---|
| **Class** | **(a) UNCHANGED** |
| **Why** | The one builder-free builder: `self.slice(0, at) + to + self.slice(at + from.length, self.length)`. `slice` and `+` are rep-independent by construction — `+` concatenates *strings*, never elements — and `at` comes from `findFrom` in the same unit `slice` consumes. Two `+`s, no unit anywhere. |
| **Note** | The empty-`from` case is `at == 0`, i.e. `to` is prepended. That is a *position*, not a boundary rule, so §R2 does **not** reach `replace`: `"héllo".replace("", "-")` is `"-héllo"` under either ruling. |

### Replace-all — `replaceAll`

| | |
|---|---|
| **Class** | **(d) BROKEN as shipped** → repaired here; also carries §R2 |
| **Why** | Both arms. The non-empty arm is `pushRange`/`pushStr` + `fromCodePoints` (§Builders). The empty-`from` arm is worse — `buf.push(self[c])` interleaved with the replacement would have put `to` between the **bytes** of a character, so `"é".replaceAll("", "-")` would emit the invalid `-\xC3-\xA9-`. |
| **After repair** | The empty arm iterates code points, which preserves today's answer **and** is Go's documented rule verbatim: *"if old is empty, it matches at the beginning of the string and after each UTF-8 sequence, yielding up to k+1 replacements for a k-rune string."* Still §R2 if the owner prefers the byte reading. |
| **The law** | `s.replaceAll(f, t) == s.split(f).join(t)` for non-empty `f` survives, and is pinned over multi-byte inputs in the fixture. It is the cheapest single check that `split` and `replaceAll` did not drift apart during the migration. |

### Trim — `trim`, `trimStart`, `trimEnd`

| | |
|---|---|
| **Class** | **(a) UNCHANGED** — all three |
| **Why** | `isSpace` tests six ASCII values. **No byte of a multi-byte UTF-8 sequence is ever below 0x80**, so a byte scan for ASCII whitespace finds exactly the characters a code-point scan finds — never a fragment, never a false positive. `spanStart`/`spanEnd` return offsets consumed by the same `slice`, so the span is invariant even though its numbers move. `spanEnd` walking backwards is fine for the same reason: it stops at the first non-space byte, and a continuation byte is never a space byte. |
| **What gets better** | Faster, and `trim` becomes allocation-free once `slice` is a view — trimming a field stops copying it. |
| **Ruling nearby** | Whether the whitespace **set** should be ASCII-only at all is §R3. That question is **rep-independent** — the answer does not change with the representation — and it surfaced here only because the audit had to check the six-character set against the precedent the module claims to follow. It does not gate the migration. |

### Repeat — `repeat`

| | |
|---|---|
| **Class** | **(d) BROKEN as shipped** → repaired here |
| **Why** | `pushStr` + `fromCodePoints` (§Builders). |
| **No ruling needed, contrary to expectation** | `n` is a **multiplier, not a length**: "three times" is three times whatever a string is, in any unit, so the bytes-or-characters question does not arise. `n <= 0 → ""` and `n == 1 → self` are unit-free. This is the one place the audit's brief expected a ruling and there is none to make. |
| **After repair** | (a). An optional follow-on: `repeat` can be written with `+` and repeated doubling (`out = out + base; base = base + base`), which is *linear* in the output rather than quadratic, uses no buffer at all, and is therefore rep-independent with no decode. Not taken — the module header's loud rule is "never accumulate into a string", the doubling exception is subtle, and the buffer version is already correct after the repair. Recorded so it is not re-derived. |

### Padding — `padStart`, `padEnd`

| | |
|---|---|
| **Class** | **(c) NEEDS A RULING** (§R1); also mechanically (d), repaired here |
| **Why (d)** | `padFill` read `pad[i % pad.length]` into a code-point buffer (§Builders). Repaired to `repeat(pad, k).slice(0, n)`, which is the same string today and has no element read. |
| **Why (c)** | `len` is the module's only **width**, not an offset — there is no matching `slice` for it to cancel against, so the unit is observable. `"héllo".padStart(8, " ")` prepends **3** spaces today and **2** after, and the column stops lining up. §R1. |
| **Invariant regardless** | "Never truncates" (`self` already `len` or longer → `self` unchanged), "empty `pad` is a no-op", `len <= 0` → unchanged. Those hold under either ruling and are the only padding cases the fixture pins. |

### ASCII case — `toUpperAscii`, `toLowerAscii`

| | |
|---|---|
| **Class** | **(d) BROKEN as shipped** → repaired here |
| **Why** | `mapAsciiCase` built through `fromCodePoints` from indexed reads (§Builders). |
| **Why the *mapping* was always right** | `caseShift` moves exactly `a`–`z` (0x61–0x7A) and `A`–`Z` (0x41–0x5A). Every byte of a multi-byte sequence is ≥ 0x80, so **no byte of a non-ASCII character can land in either range** — the mapping selects the identical set of characters whether it walks bytes or code points. The `Ascii` in the name stays exactly as true. Only the *rebuild* was broken. |
| **After repair** | (a). The scan-before-build fast path (return `self` untouched when nothing changes) is preserved and still allocation-free. |

---

## §No-b — why nothing lands in class (b)

The brief expected some functions to get "silently more correct". **None do, and
the reason is structural rather than luck:** `std:str` contains no
code-point-dependent logic that was wrong. It inspects a code-point *value* in
exactly two places — `isSpace` and `caseShift` — and both test **ASCII**, which
is the one region where a byte and a code point are the same number by
definition. Everywhere else the module compares elements to other elements, or
passes offsets from a producer to a consumer in the same unit.

So the migration has nothing in this module to *fix*. It has things to preserve
(7), things to repair that its own idiom broke (5), and questions to answer (3).
Where the module gets better it gets **faster or leaner** — byte compares, view
slices, allocation-free trim — never *righter*. That is a good result for the
module and worth stating plainly, because "byte semantics fixes things" is a
claim someone will otherwise make on its behalf during the migration.

---

## §R1 — Is `padStart`/`padEnd`'s `len` a byte count or a character count?

**The question.** `padStart(self, len, pad)` pads until `self` is `len` long.
After §API, `self.length` is a byte count. `"héllo".padStart(8, " ")` gets 3
spaces today (5 code points → 8) and 2 after (6 bytes → 8). Which is right?

**What other languages do — measured, not assumed.** Run locally except Go,
which is quoted from its documentation:

| Language | Spelling | Unit | Measured result |
|---|---|---|---|
| **Go** | `fmt.Sprintf("%8s", s)` | **runes** | doc, verbatim: *"Width and precision are measured in units of Unicode code points, that is, runes. (This differs from C's printf where the units are always measured in bytes.)"* |
| **Rust** | `format!("{:>8}", s)` | **chars** | `[   héllo]` — 3 spaces; padded result is **9 bytes** for a width of 8 |
| **Python** | `s.rjust(8)` | **code points** | `[   héllo]` — 3 spaces; `"a😀".rjust(4,"-")` → `"--a😀"` |
| **JS** | `s.padStart(8, " ")` | **UTF-16 code units** | `[   héllo]` — 3 spaces; but `"a😀".padStart(4,"-")` → `"-a😀"` (the emoji counts as **2**) |
| **C** | `printf("%8s", s)` | **bytes** | `[  héllo]` — **2 spaces**. The column is short. |

Two things fall out. **Not one language measures padding in bytes except C, and C
is the one that visibly misaligns.** And **Go — the byte-indexed language VL is
joining — went out of its way to differ from C on exactly this point, and said so
in its documentation.** Go has byte-indexed strings, byte-offset `Index`,
byte-length `len(s)` — and *still* measures width in runes, because width is a
different kind of number from an offset.

JS is the instructive near-miss: it pads by its own index unit, which is why an
astral emoji counts as two and `"a😀".padStart(4)` produces three visible
characters. That is precisely the failure mode a byte reading would give VL, at
2–4× the rate.

**Options.**

- **(i) Bytes** — `len` stays `self.length`'s unit. O(1), consistent with §API's
  one coordinate system, zero new machinery. Cost: padding stops aligning
  anything the moment a non-ASCII character appears, and `padFill`'s truncation
  can split a character and emit a partial sequence. It also makes `padStart` the
  only operation in the module that is *wrong* on real data rather than merely
  differently-numbered.
- **(ii) Code points** — `len` counts characters, i.e. `self.cpLen()`. Matches
  Go, Rust, Python and (modulo surrogates) JS. Cost: O(n), and it needs `cpLen`
  (§Codepoints already specifies it) or, today, a four-line `for cp in s` count.
- **(iii) Split the name** — `padStart` (characters) plus a byte-exact variant
  for callers building fixed-size records. Cost: two names for one idea, in a
  module whose header argues hard against exactly that.

**Recommendation: (ii), code points.** Three reasons in order of weight.

1. **The operation's purpose is visual alignment, and bytes align nothing.** A
   padder exists to make a column; `padFill`'s own comment says so ("a column
   that is sometimes one unit wider is not a column"). A byte count produces a
   column that is right for ASCII and silently ragged otherwise — the
   *works-on-my-input* class VL rejects on principle, and the same class as the
   O(n²) cliff the byte-index decision was taken to eliminate.
2. **The precedent is unanimous among the languages that have an opinion, and the
   nearest neighbour is emphatic.** Go is byte-indexed and still pads in runes,
   with a documentation sentence that names C's byte measurement as the thing it
   differs from. VL joining Go's camp on the index unit is not a reason to join
   C's camp on width.
3. **"One coordinate system" is about OFFSETS and does not reach this.** §API's
   argument is that `slice`, `indexOf`, `regex` and I/O must agree so no
   converter sits on a hot path. `len` is a width: it is never handed to `slice`,
   never compared to a match position, never crosses the I/O boundary. There is
   nothing for it to be inconsistent *with*. And §Codepoints' own principle —
   *"operations whose cost depends on the data get a name, not a subscript"* — is
   satisfied: `padStart` is already a named call, not a subscript, so paying O(n)
   inside it is visible exactly where that principle wants it.

Note code points are still not *display width* (CJK characters are two columns
wide, combining marks zero). Go, Rust and Python all accept that; the honest
framing is that grapheme- or width-correct padding belongs to `std:unicode`
alongside `graphemes()`, and code points are the right floor beneath it —
strictly better than bytes and reachable without tables.

**Blast radius today: two functions, one line each, plus `padFill`.** `std:str`
has no importer outside `std/fmt.vl` (whose `padLeft` delegates to `padStart`)
and `tests/cases/std/str-*.vl`. Nothing in `compiler/*.vl` imports it. This
ruling is at its cheapest right now and gets monotonically more expensive.

## §R2 — What is a "boundary" for an EMPTY needle in `split` / `replaceAll`?

**The question.** `"abc".split("")` is `["a","b","c"]` and `"abc".replaceAll("",
"-")` is `"-a-b-c-"`: an empty needle matches at every boundary. After §API,
"every boundary" can mean every **byte** boundary or every **character**
boundary. `"héllo"` has 5 characters and 6 bytes, so the two readings differ in
both piece count and validity.

**What other languages do — measured:**

| Language | `"héllo"` split on `""` | `"héllo"` replace `""` → `"-"` |
|---|---|---|
| **Go** | doc: *"If sep is empty, Split splits after each UTF-8 sequence"* | doc: *"…matches at the beginning of the string and after each UTF-8 sequence, yielding up to k+1 replacements for a k-**rune** string"* |
| **Rust** | `["", "h", "é", "l", "l", "o", ""]` — 7, with boundary empties | `"-h-é-l-l-o-"` |
| **Python** | `list(s)` → `['h','é','l','l','o']` | `"-h-é-l-l-o-"` |
| **JS** | `["h","é","l","l","o"]` | `"-h-é-l-l-o-"` |

**Unanimous: nobody splits a character.** Go — again the byte-indexed one —
documents the unit explicitly as the UTF-8 *sequence*, not the byte. (Rust's
extra leading/trailing empties are a separate disagreement about the *count* of
boundaries, which VL already ruled against in `std:str`'s header; it is not a
disagreement about the unit.)

JS is the counterexample that proves the cost of the other reading: JS splits at
its **index unit**, so `"a😀".split("")` is `["a","\uD83D","\uDE00"]` — two
lone surrogates — and `"a😀".replaceAll("", "-")` produces a string with broken
halves in it. That is exactly what a byte reading gives VL, and more often.

**Options.**

- **(i) Code-point boundaries** — today's answer, preserved. `"é".split("")` is
  one piece; `"é".replaceAll("", "-")` is `"-é-"`. Every output is valid UTF-8.
- **(ii) Byte boundaries** — mechanically consistent with `.length` and with
  `s.slice(i, i+1)`. `"é".split("")` is two pieces, each an invalid partial
  sequence; `"é".replaceAll("", "-")` is `-\xC3-\xA9-`, invalid.

**Recommendation: (i), code points — and this PR already implements it**, because
it is also the *conservative* choice: it is what the shipped module does today,
so the migration changes no answer. The loops now iterate (`for cp in self`)
rather than index, which is what makes the answer survive; reverting to (ii) is a
two-line change if the owner rules the other way.

The argument for (i) beyond precedent: an empty needle is the only input in the
module where the implementation *chooses* a boundary rather than being handed
one by a match, and it is the only place `std:str` can emit an invalid string at
all. A library whose documented degenerate case produces broken UTF-8 is a worse
trade than one whose degenerate case is O(n) — especially since `split("")` is a
"give me the characters" idiom, and the thing a caller wants back is characters.

## §R3 — Should `trim` strip ASCII whitespace or Unicode whitespace?

**Rep-independent — this does not gate the migration.** Filed because the audit
had to verify the six-character set and found the module's stated justification
does not hold.

**The question.** `trim`/`trimStart`/`trimEnd` strip six ASCII characters (space,
`\t`, `\n`, `\v`, `\f`, `\r`). `std:str`'s header defends this by "follow the
unanimous precedent", citing "the same six C's `isspace` takes and Go's
`strings.TrimSpace` **starts from**".

**"Starts from" is doing the work, and it is wrong.** Measured:

| Language | `" x ".trim()` | Definition |
|---|---|---|
| **Go** | strips NBSP | doc: *"…with all leading and trailing white space removed, **as defined by Unicode**"*. The six ASCII bytes are a **fast path** in the implementation; it falls through to `TrimFunc(s, unicode.IsSpace)` on the first byte ≥ 0x80 |
| **Rust** | `"x"` | `char::is_whitespace` — the Unicode `White_Space` property; `'\u{00A0}'.is_whitespace()` is `true` |
| **Python** | `'x'` | `str.strip()`; `'\xa0'.isspace()` is `True` |
| **JS** | `"x"` | WhiteSpace + LineTerminator; also strips U+FEFF |
| **C** | does not | `isspace(0xA0)` is `0` in the C locale |

So **all four of the languages this module's rulings defer to strip NBSP, and
only C does not.** VL implemented Go's *optimization* and stopped, which is not
the same as implementing Go. The module's own tie-breaker — *"where JS, Python,
Rust and Go agree … that agreement is the answer"* — points the other way from
the behaviour it was used to justify. That is the finding; the behaviour itself
may still be the right choice.

**Options.**

- **(i) Keep ASCII-only.** Fast (a byte test, no decode even after §API), tiny,
  and *correct for scanners*: a lexer must not treat NBSP as whitespace, and the
  compiler is the biggest text program in this tree. Cost: `trim` silently leaves
  the NBSP that web-, Word- and PDF-pasted input is full of — the failure lands
  on user data, not on the author's tests, which is the shape the module's
  `toUpperAscii` naming rule exists to prevent.
- **(ii) Unicode `White_Space`.** Matches all four precedents and the promise the
  bare name `trim` makes. **The "needs Unicode tables" objection is false**:
  `White_Space` is a fixed 25-code-point list (U+0009–U+000D, U+0020, U+0085,
  U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000) — a
  hardcoded predicate, no table, no `std:unicode` dependency. Cost: the ends need
  a code-point decode after §API, and it changes a shipped answer.
- **(iii) Both, named.** `trim` = Unicode (the name promises whitespace, not
  ASCII), `trimAscii`/`trimAsciiStart`/`trimAsciiEnd` = the six, for scanners.
  Cost: three more exports, and the module's D1 admission principle says nothing
  lands without a caller.

**Recommendation: (iii), but only when a second caller exists; (ii) if one name
must serve.** The module already resolved this exact tension once and got it
right — `toUpperAscii` puts ASCII in the name *because* an unqualified `toUpper`
that skips `é` is a quiet lie. A `trim` that skips U+00A0 is the same lie in the
same module under a shorter name, and the header's defence of the asymmetry
rested on a precedent that is not there. What genuinely differs is that
whitespace-trimming's ASCII answer is *useful* to a whole class of caller
(scanners) rather than merely incomplete, which is what makes (iii) better than
(ii) rather than redundant.

**Whatever is ruled, correct the header.** The precedent claim is false as
written and this PR has already rewritten it as a CORRECTION with the measurements
above; the behaviour is unchanged.

---

## §Fixture — what is pinned, and what is deliberately not

**`tests/cases/std/str-multibyte.vl`** — 56 assertions, all of which must be
**identical** before and after the swap. Every other `str-*.vl` fixture is pure
ASCII, where the byte index *is* the code-point index and the byte length *is*
the code-point length: **not one of them can tell the two representations
apart.** This one can, and it is the reason "the suite is green" will mean
something after Step 2.

The rule it follows: **nothing unit-bearing is printed.** No `.length`, no
`indexOf`, no offset compared to a literal — those are the numbers that move. It
pins string *values*, booleans, `-1`, list shapes, and offsets consumed by the
same `slice` that produced them. It covers all four UTF-8 widths and the
adversarial `é`/`Ã`/`©` byte-collision triple.

**What it deliberately does NOT pin — the expected changes.** A fixture rewritten
to match new behaviour has checked nothing, so these are listed here instead:

| Expression | Today | After §API | Why not pinned |
|---|---|---|---|
| `"héllo".length` | 5 | 6 | §API, by design |
| `"héllo"[1]` | 233 (`é`) | 195 (`0xC3`) | §API, by design |
| `"héllo".lastIndexOf("l")` | 3 | 4 | offset unit; the *use* is pinned instead |
| `"héllo".padStart(8, " ")` | 3 spaces | 2 spaces (option i) | **§R1 open** |
| `"héllo".split("")` | 5 pieces | 5 (as repaired) / 6 (option ii) | **§R2 open** |
| `"é".replaceAll("", "-")` | `-é-` | `-é-` (as repaired) / invalid (option ii) | **§R2 open** |
| `" x".trim()` | unchanged | unchanged | **§R3 open**, rep-independent |
| `s.split(sep)` piece identity | copies | views (§Header) | cost, not value |

## §Migration checklist

For whoever executes Step 2, in order:

1. **Do not reintroduce `buf.push(s[i])` anywhere in `std/`.** It is the whole
   defect class (§Builders). `for cp in s` is the spelling; `fromCodePoints` is
   why.
2. **Run `tests/cases/std/str-multibyte.vl` first.** It is the only fixture in
   the tree that can distinguish the two representations for this module.
3. **Answer §R1 before the swap ships**, or `padStart` changes meaning silently.
   It is two functions and one line each *today*; it is a breaking change later.
4. **§R2 is already resolved conservatively in code** — if the owner rules the
   other way, the two `for cp in` loops in `split` and `replaceAll` become
   indexed loops again.
5. **§R3 does not gate anything.** Rule it whenever.
6. **`std/utf8.vl` is not covered by this audit** and has the same defect class
   (§Builders, last paragraph). Audit it separately before Step 2 ships.

## Sources

- Property check: exhaustive (73,800 haystack/needle pairs) + randomized
  (200,000 trials) two-domain differential over `std/str.vl`'s own algorithms.
  Zero disagreements. Method in §Property; the harness was a throwaway.
- `fromCodePoints([195, 169]) == "Ã©"`: run on this build, `vl run`.
- `slice` clamping and JS-style negative indices (`"abc".slice(-1, 3)` is `"c"`):
  run on this build. That second convention is worth remembering for the
  migration — after §API, `s.slice(-1)` means "the last **byte**", which for a
  multi-byte trailing character is a partial sequence.
- Rust, Python, JS and C survey rows: run locally (rustc, python3, node, gcc).
- Go rows: `pkg.go.dev/strings` and `pkg.go.dev/fmt`, quoted verbatim; Go is not
  installed in this environment and the rows are marked as documentation rather
  than measurement.
- `fromCodePoints`'s signature: `compiler/driver.vl:1123`,
  `blPush("fromCodePoints", 1, "(i32[]) => string")`.

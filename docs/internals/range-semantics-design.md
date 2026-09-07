# Range iteration semantics — should `to` stay inclusive, and what carries `[0, n)`?

VL's counted loop is `for v in <from> to <to> [step <s>]`, and **`to` is inclusive** at the top
(`docs/guide/soundness.md`, "A constant range must be able to run"): `for i in 0 to 4` runs five
times, binding `0,1,2,3,4`.

The problem is that the **dominant** use of a counted loop is array iteration, and the honest
spelling of "visit every index of `a`" is then `for i in 0 to a.length - 1`. Drop the `- 1` — the
shape a newcomer reaches for, and the shape the guide itself taught until a companion doc-fix — and
`for i in 0 to a.length` reads `a[a.length]` on its last turn and **traps**. The natural, English
spelling of the most common loop is an off-by-one that the type checker cannot catch, because it is
a value error, not a type error.

This doc surveys how other languages split the two range kinds, argues the principled position, and
recommends a resolution. **It informs an owner decision; it does not make one.** The one aesthetic
question left open for the owner is named in §6.

---

## 1. The survey — how languages split `iterate 0..n-1` from `enumerate a..b inclusive`

| language | exclusive (half-open) | inclusive (closed) | which is the array-iteration default |
| --- | --- | --- | --- |
| **Rust** | `0..n` | `0..=n` | **exclusive** — `for i in 0..v.len()` is idiomatic; `..=` is the marked case |
| **Python** | `range(n)` / `range(a, b)` | *(none)* | **exclusive** — the only range; inclusive is `range(a, b+1)` by hand |
| **Zig** | `for (0..n)` | *(none in `for`)* | **exclusive** — the range form is half-open by construction |
| **Go** | `for i := 0; i < n; i++`; `for i := range n` (1.22) | *(none)* | **exclusive** — `< n` by construction; `range n` is 0..n-1 |
| **Swift** | `0..<n` | `0...n` | **exclusive** — `for i in 0..<a.count`; `...` is the marked case |
| **Kotlin** | `0 until n`; `0..<n` (1.9+) | `0..n` | **exclusive** — `..` was inclusive, `until`/`..<` were **added for iteration** |
| **Nim** | `0..<n`; `countup` | `0..n` | **exclusive for indexing** — `for i in 0..<a.len`; `..<` is a stdlib template |
| **Ruby** | `0...n` | `0..n` | **exclusive** — `(0...arr.size)`; `..` (two dots) is inclusive |
| **Julia** | *(none; step it)* | `1:n` | **inclusive**, but **1-based**, so `1:length(a)` = every index with no `- 1` |
| **Pascal / BASIC** | *(none)* | `for i := 0 to n` | **inclusive** — the `to`-keyword heritage VL inherited |

**The lesson is one-directional.** Every dominant or modern language reaches for the **half-open**
interval as the array-iteration default: Rust, Python, Zig, Go, and Swift-by-idiom are exclusive out
of the box. The two exceptions prove the rule rather than breaking it — Pascal/BASIC are the
inclusive-`to` lineage VL followed, and Julia only escapes the `- 1` because it is 1-based, so its
inclusive top bound *equals* the length.

**And the languages that started inclusive and cared about iteration ergonomics all did the same
thing: they added an exclusive form and steered you to it.** This is the crux, and Kotlin is the
sharpest precedent for VL's exact situation:

- **Kotlin** shipped `..` as inclusive (`rangeTo`). It was a repeated iteration footgun, so they
  added the `until` infix function (`0 until n`), and later, in 1.9, promoted it to a first-class
  operator `..<`. Kotlin's own docs now steer index iteration to the exclusive form. VL's `to` is
  Kotlin's `..` — same keyword-flavoured inclusive default, same footgun.
- **Swift** kept `...` (inclusive, `ClosedRange`) but the idiom for indexing is `0..<count`, a
  distinct half-open operator.
- **Nim** kept `..` inclusive and shipped `..<` (a template, literally `a .. pred(b)`) as the
  index-iteration spelling.
- **Ruby** kept `..` inclusive and `...` exclusive, and steers index work to the exclusive triple-dot.

Nobody who owned an inclusive-keyword default and then took iteration seriously chose to *flip the
keyword's meaning*. They all **added a second, correct-reading spelling** and moved the common case
onto it. That is the resolution this doc recommends VL copy.

---

## 2. The principle — half-open `[0, n)` is the right interval for INDEXING

Dijkstra settled the interval question for indexing in EWD831 ("Why numbering should start at zero"):
for a sequence of integers, prefer the convention **lower bound inclusive, upper bound exclusive** —
`[lo, hi)`. The reasons are structural, not stylistic:

1. **The length is the subtraction.** The number of elements in `[lo, hi)` is exactly `hi - lo`. For
   a zero-based array that is `n - 0 = n`: the loop bound you write *is* the length, with no `± 1`.
2. **The empty range is representable and unsurprising.** `[n, n)` is empty and legal; the upper
   bound never has to dip below the lower to express "nothing". A closed interval has no clean empty
   form — `[0, -1]` is the least-ugly option and it is ugly.
3. **Adjacent ranges compose.** `[a, b)` and `[b, c)` tile `[a, c)` with no gap and no overlap and
   no `b ± 1` at the seam. Closed intervals force a `+ 1` at every join.
4. **Valid indices are exactly the half-open range.** For a zero-based array of length `n` the legal
   indices are precisely `[0, n)`. The natural loop and the array's own shape are the same object.

Array iteration is the dominant use of a counted loop, and it wants the half-open interval. On the
principle alone, exclusive-top is the correct default for the common case.

---

## 3. The counter-principle — the KEYWORD `to` reads INCLUSIVE

The principle argues for exclusive-top; it does **not** argue for making the word `to` mean it.

`to` is an English preposition and a Pascal/BASIC/Ruby-lineage range keyword, and in all of those it
reads **inclusive**: "count 1 **to** 10" includes 10; "Monday **to** Friday" includes Friday; `for i
:= 1 to 10` in Pascal binds 10. A reader's built-in parse of `1 to 10` is the closed interval.

So flipping `to` to exclusive would fix the array-iteration footgun but **buy a permanent, low-grade
surprise on every single use** — `for day in 1 to 7` would now stop at 6, and `for hour in 0 to 23`
would be the only correct way to name a 24-hour day, reading as if it stopped at 22. That trades a
**localizable, fixable, lintable** problem (a missing `- 1`, in exactly one syntactic position) for
an **unfixable, everywhere** one (a keyword that permanently reads against its plain meaning). It is
a bad trade, and it is the trade none of the survey languages made. **VL should not flip `to`.**

---

## 4. The options

### (A) Keep `to` inclusive; ADD an exclusive form and TEACH it as the array-iteration idiom
The Kotlin/Swift/Nim resolution. `to` keeps its honest inclusive meaning for genuine enumeration;
a new half-open form becomes the taught, primary spelling for index iteration:

```vl
for i in 0 until a.length { … }   // visits 0 … a.length-1; the common case, no `- 1`, no trap
for day in 1 to 7 { … }           // visits 1 … 7; genuine inclusive enumeration, reads right
```

- **Pros:** both interval kinds get a spelling that reads correctly; non-breaking (adds surface, flips
  nothing); moves the common case onto a footgun-free spelling; matches every language that faced this.
- **Cons:** `to` remains reachable for iteration, so someone *can* still write `0 to a.length - 1` or,
  worse, `0 to a.length`. §4C's lint closes exactly that residue.

### (B) FLIP `to` to exclusive; add an inclusive form (`through` / `..=` / `to … inclusive`)
The Rust/Python/Zig/Go camp, reached by re-pointing the existing keyword.

- **Pros:** the common case `for i in 0 to a.length` becomes correct with the shape everyone reaches
  for; one spelling, no new primary form to teach.
- **Cons:** **breaking**, and — decisively — it makes `to` permanently read against its English/Pascal
  meaning (§3). Every inclusive enumeration in existence silently changes iteration count, and every
  future one carries the surprise. Trades a fixable problem for an unfixable one.

### (C) Status quo + a lint on `<lo> to <expr>.length`
Keep inclusive `to`; add a checker lint that flags `for i in <lo> to <expr>.length` (and `.count` /
`.size`) — an inclusive `to` whose upper bound is a length-like accessor — as a likely off-by-one that
will trap at the last index.

- **Pros:** cheapest; makes the exact footgun **loud** instead of a runtime trap.
- **Cons:** leaves the ergonomics unchanged — the correct spelling is still the noisy `- 1`, and the
  lint only catches the bare-`.length` shape, not `0 to n` where `n` is a length in a variable.

These are **not exclusive.** (A) and (C) compose: add the form, teach it, *and* lint the residual
`to … .length` so the footgun is closed by construction, not merely by convention.

---

## 5. Recommendation — (A) with `until`, made primary, plus (C)'s lint

**Add a half-open range form, spell it `until`, teach `for i in 0 until a.length` as THE index-
iteration idiom, keep `to` inclusive for enumeration, and land the `to … .length` lint alongside.**
Written as an owner-ratifiable ruling:

> **Range iteration.** `to` stays inclusive (`0 to 9` binds `0…9`), for genuine enumeration.
> A new keyword `until` spells the half-open range: `for i in <lo> until <hi>` binds `lo … hi-1`,
> and is the taught, primary spelling for iterating indices (`for i in 0 until a.length`). A lint
> flags `for … in <lo> to <expr>.length` / `.count` / `.size` as a likely off-by-one.

Reasoning, in one breath: half-open is the right interval for the dominant case (§2), so the common
loop must have a correct-reading exclusive spelling; but `to` reads inclusive (§3), so the fix is to
*add* that spelling, not repurpose `to`; that is exactly what every inclusive-keyword language that
took iteration seriously did (§1); and the lint (§4C) converts the residual footgun from convention
into enforcement so reaching for `to` first is caught at check time, not at a runtime trap.

**Why `until` over other spellings.** VL's counted loop is already keyword-flavoured — `in`, `to`,
`step` are words, not punctuation. `until` joins that family and reads in English: `0 until n` is
"up to but not including n". `until` is not a VL keyword today (it appears only in comments), and VL
has no `while`/`until` loop for it to collide with, so the name is free. It is the same word Kotlin
chose for the same reason.

**Semantics to pin when it is built** (details for the build, not decisions for the owner):
- `for v in lo until hi step s` counts by `s` (default `+1`) with the loop condition `v < hi`
  (positive step) — the existing range loop with `<` where `to` uses `<=`. Mechanically it is a
  one-token variant of the emitter's range lowering.
- **The empty range is first-class and must NOT be refused.** `for i in 0 until 0` compiles and runs
  **zero** times — that is the point of §2's half-open interval (contrast `for i in 0 to 0`, which
  runs once, and `for i in 3 to 0`, which soundness.md *refuses* as a provably-empty const range).
  `until`'s const-range refusal fires only on a provably **backwards** range (`5 until 0` with a
  positive step), never on `hi == lo`. So `0 until a.length` on an empty array is a clean no-op, with
  no special-case and no trap — the property the inclusive form cannot express.

**Migration cost is not the deciding factor, and under this recommendation it is nil.** VL is 0.1.0
with two known consumers; the choice is a design choice, not a cost trade. And because (A) *adds* a
form rather than flipping one, **no existing loop changes meaning** — every current `to` loop keeps
its behaviour, and adoption of `until` is opt-in per loop. (For reference only: a census of the 130
in-tree range loops found the array-iteration shape dominant in real code — `bench/nbody`, the
capability probes, the `std` buffer tests all carry `0 to X.length - 1` or `0 to n - 1` — while most
literal-bound loops are test fixtures pinning a specific iteration count. This is context, not a
lever.)

---

## 6. The one open question for the owner — `until` vs `..<`

The recommendation is (A)-primary-plus-lint; the **spelling** is the single aesthetic call left:

- **`until`** (recommended) — keyword, fits `in`/`to`/`step`, reads in English, Kotlin precedent.
- **`..<`** — the symbolic half-open operator (Swift, Nim 1.9 Kotlin). Terser, and it visually pairs
  with a possible future `..=`/`...`. The cost is that it would be the **only** punctuation operator
  in an otherwise all-keyword range grammar (`for i in 0 ..< a.length step 2` mixes a symbol into a
  wordy line), and it presumes a `..`-family redesign VL has not otherwise committed to.

Everything else in §5 is independent of which spelling wins. This is the decision the doc is asking
the owner to make.

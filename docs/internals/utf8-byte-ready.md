# `std:utf8` under byte-indexed UTF-8 — the semantic audit

> **Status: audit, complete. One ruling made (§at), three filed for the
> compiler-side agent (§NonScalar, §Ownership, §Wrap). Two exports were BROKEN by
> the migration and are repaired here, behaviour-identically.** This is the
> companion to `str-byte-semantics.md`, which audited `std/str.vl` and closed
> with *"`std/utf8.vl` is not covered by this audit and has the same defect class
> … audit it separately before Step 2 ships."* This is that audit.
>
> Companion fixture: **`tests/cases/std/utf8-invariant.vl`** — 38 assertions that
> must be *identical* before and after the swap. Repaired in the same change:
> `tests/cases/std/utf8-lossy.vl`, whose one non-invariant assertion is now
> invariant with its `@log` block unchanged.

## The question this was asked to answer first

**Does `std:utf8` still have a reason to exist after the migration?**

Once a string *is* UTF-8 bytes, `encodeUtf8(s)` is close to `s.bytes()` and
`decodeUtf8(bytes)` is close to wrapping bytes in a header. The module could
collapse to near-nothing.

**Answer: (B) — it keeps a distinct job, and the job is exactly the one
`strings-design.md` §Validity says the core will never do.** But the collapse is
real for part of it, so the honest shape of the answer is **B with a 2-of-5
collapse**:

- **2 exports collapse to core one-liners** (`utf8Length` → `self.length`,
  `encodeUtf8` → `self.bytes()`). These are also **the only two that read a
  `string`**, and therefore **the only two the migration breaks**.
- **3 exports plus `Utf8Error` survive intact** (`decodeUtf8`, `decodeUtf8At`,
  `decodeUtf8Lossy`). They take a `u8[]`, which is already bytes and does not
  move. Nothing in them changes meaning.

**Why the survivors are not redundant, stated as the load-bearing argument.**
§Validity is Go-lean: *"A string is bytes that are usually UTF-8, **not a
validated invariant**. No validation at the host boundary; malformed sequences
decode leniently to U+FFFD."* That is a decision to have **no validator in the
core, ever**. So after the swap the core can wrap arbitrary bytes into a string,
and the three things it still cannot do are:

| job | who does it | why the core won't |
|---|---|---|
| **Reject** bytes that are not text, and say **where** | `decodeUtf8` / `decodeUtf8At` → `Utf8Error` | §Validity: no validation at the boundary. `std:fs`'s `readTextFile` is built on this — *"the honest answer to 'this file is not text'"* |
| **Repair** bytes into guaranteed-well-formed UTF-8 | `decodeUtf8Lossy` | the core's lenient wrap **keeps the bad bytes**; see §Wrap — these are different operations, not two spellings of one |
| **Position** a failure in the caller's own coordinate system | `Utf8Error.at`, and the `decodeUtf8At` range form | there is no core type to carry it |

Option (A) — total collapse — is refuted by that table. Option (C) — delete or
merge — is refuted twice over: the module has **7 live call sites** outside its
own fixtures (`std/fs.vl`: 5 × `encodeUtf8`, 1 × `decodeUtf8`, 1 ×
`decodeUtf8At`; `std/args.vl`: 1 × `decodeUtf8`, and it **re-exports
`Utf8Error`** as its own failure type), and the decoder's ill-formed-input table
is the kind of thing whose whole point is existing once.

**The one export that should be DELETED rather than collapsed is `utf8Length`** —
see its row.

---

## Summary

| Class | Count | Exports |
|---|---|---|
| **(a) UNCHANGED** — byte-domain already, nothing moves | **3** | `decodeUtf8`, `decodeUtf8At`, `decodeUtf8Lossy` |
| **(b) CHANGED, and the new behaviour is better** | **1** | `Utf8Error.at` — acquires a second true reading it does not have today (§at) |
| **(c) NEEDS AN OWNER RULING** | **3 questions, 0 exports** | §NonScalar, §Ownership, §Wrap — all three are questions for the **core**, not for this module |
| **(d) BROKEN as shipped** — silently wrong after the swap | **2** | `utf8Length`, `encodeUtf8` |

Both (d)s are repaired in this change, in the module, with no emitter change. The
repair is **byte-identical on today's build** — proven in §Repair, not asserted —
and correct after the swap.

**The (d) count is 2 of 5, against `std:str`'s 5 of 15, and the reason for the
lower rate is worth stating**: `std:utf8` is mostly a `u8[]` library. The defect
class only reaches code that reads a `string` by index, and only two exports do.
The prose framing that this module "walks strings as `while i < self.length {
self.charCodeAt(i) }`" is true of exactly those two functions and false of the
other 60 % of the file — `decodeCore`, the 40-line heart of the module, is
entirely byte-domain and comes through the migration untouched.

---

## §Exports — one by one

### `utf8Length(self: string): i32` — **(d) BROKEN**, and should be **DELETED**

| | |
|---|---|
| **Today** | O(n) walk summing `utf8Width(cp)` over the string's code points. Contract: *"the exact length of `s.encodeUtf8()`, without encoding it."* |
| **After the swap** | **`self.length`.** Exactly, with no residue: the string *is* its UTF-8 bytes, so the number it computes is the number `.length` already holds. O(n) → O(1). |
| **What breaks** | The shipped spelling was `while i < self.length { n = n + utf8Width(self.charCodeAt(i)) }`. After the swap that walks **bytes** and asks the width of each byte *re-read as a code point*: `"é"` is `C3 A9` = 195, 169, each of which is a 2-byte code point, so it answers **4** for a 2-byte string. Wrong, silently, with no type error — a byte and a code point are both `i32`. |
| **Repaired to** | `for cp in self { n = n + utf8Width(cp) }` — see §Repair. |

**Why deletion, not a wrapper.** After the swap `utf8Length(s)` and `s.length`
are the same number by construction. A second name for `.length` is worse than no
name: a reader who meets `utf8Length(s)` sitting next to `s.length` will
reasonably assume the two differ, which is precisely the confusion the function
was created to resolve in the other direction. It also has **zero consumers in
the tree** — `grep -rn utf8Length --include='*.vl' .` finds its own definition,
its own doc comment, and `tests/cases/std/utf8-roundtrip.vl`. Nothing else. It is
the cheapest export in the module to remove and the most expensive to keep.

**Caveat that decides it, and it is not cosmetic.** `utf8Length` == `.length`
only if `encodeUtf8` returns the string's **raw** bytes. If `encodeUtf8` were to
keep *sanitizing* (§Wrap), then for a string holding malformed bytes the two
diverge — `.length` counts the malformed bytes, the sanitized encoding counts
3 per replacement. The module's header states the invariant that these two cannot
drift (*"one width function, so the measurement and the encoder cannot drift"*),
so they must be ruled together. §Wrap rules both: raw.

### `encodeUtf8(self: string): u8[]` — **(d) BROKEN**, collapses to `self.bytes()`

| | |
|---|---|
| **Today** | O(n) transcode: `scalar()` each element, then emit 1–4 bytes. |
| **After the swap** | **`self.bytes()`** — the O(1) zero-copy `u8[]` view §Byte view promises. |
| **What breaks** | Same shape as `utf8Length`: `while i < self.length { scalar(self.charCodeAt(i)) }` re-encodes each **byte** as if it were a code point. `"é"` (`C3 A9`) would encode to `C3 83 C2 A9` — four bytes of mojibake for a two-byte string. This is `str-byte-semantics.md` §Builders' double-encoding defect **in the opposite direction**: there a byte-producer fed a code-point-consumer (`fromCodePoints`), here a byte-producer would feed a code-point-consumer (the encoder body). Same class, same absence of a type error, same measured signature (`fromCodePoints([195, 169])` is `"Ã©"`). |
| **Repaired to** | `for cp in self { const c = scalar(cp) … }` — see §Repair. |

**Should it be deleted too?** No — **keep it, as a one-line wrapper over
`self.bytes()`.** Three reasons, and the third is the one that matters:

1. It has **5 call sites in `std/fs.vl`** and they read as intent: `__fs_read__(encodeUtf8(path))` says *this is a host boundary and here is the encoding it takes*, which `__fs_read__(path.bytes())` says less clearly.
2. Unlike `utf8Length`, its name does not collide with a core name that means the same thing — `bytes()` and `encodeUtf8()` are not two spellings a reader will meet side by side and have to distinguish.
3. **It is the one place a returned-ownership change can be documented** — see §Ownership, which is a real behavioural difference between today's `encodeUtf8` and tomorrow's `bytes()` and is currently invisible.

### `decodeUtf8(self: u8[]): string | Utf8Error` — **(a) UNCHANGED**

| | |
|---|---|
| **Why nothing moves** | It never touches a `string` on the way in. `decodeCore` reads `self[off + i]` where `self: u8[]` — already bytes, unaffected by §API — and pushes genuine **code points** into `cps: i32[]`, which it drains through `fromCodePoints`, whose contract is code points. Producer and consumer are in the same unit today and after. The defect class does not reach here. |
| **What it costs after the swap** | A decode-then-re-encode: `cps` is materialized as an `i32[]` (4 bytes per code point) and `fromCodePoints` re-encodes it to the bytes that were already sitting in the input. For a validated-strict decode the output bytes are **byte-identical to the input**, so the whole intermediate is provably redundant. The fix is a `fromBytes`-shaped primitive (or `Buffer`); `str-byte-semantics.md` §Builders files the same follow-on for `std:str`. **It is an optimization on a correct implementation, not a prerequisite** — and it is exactly today's cost, so the swap does not make it worse, it makes the fix *available*. |
| **What it gains** | `at` becomes an offset in the caller's own coordinate system — §at. |

### `decodeUtf8At(self: u8[], off: i32, len: i32)` — **(a) UNCHANGED**

Same body, same reasoning. Its reason to exist is unchanged too: a consumer that
splits a byte block into records must attribute a failure to the **record**, not
the block. `std/fs.vl:328` is that consumer (`decodeUtf8At(block, start, i - start)`
per directory entry). The `off`-relative origin of `at` is ruled in §at.

### `decodeUtf8Lossy(self: u8[]): string` — **(a) UNCHANGED**, and its *job* sharpens

The code is unchanged. What changes is what it is *for*, and this is the finding
that most decides the does-it-still-exist question — see **§Wrap**. In one line:
after the swap the core gains a free "wrap these bytes, don't check" path that
looks like a competitor to this function and is **not the same operation**.

### `Utf8Error = { at: i32, byte: i32, msg: string }` — **(b) BETTER**

`byte` and `msg` are unit-free and unchanged (`msg`'s *"at offset N"* was already
a byte offset, so the prose stays true). `at` gets its own section.

### The private helpers

| helper | class | note |
|---|---|---|
| `decodeCore` | **(a)** | 40 lines, entirely `u8[]`-domain. The module's largest function and the migration does not touch it. |
| `scalar` / `utf8Width` | **(a)**, but the *ruling* they encode moves | They exist because a VL string can hold a non-scalar `i32`. After the swap it cannot — see **§NonScalar**, which is the item on this checklist most likely to be missed. |

---

## §Repair — the two (d)s, and the proof they are behaviour-identical today

**The repair is the `str-byte-semantics.md` #1842 move: pair operations whose
meanings move together, rather than ones that agree by coincidence.**

```
-  while i < self.length { … self.charCodeAt(i) … ; i = i + 1 }
+  for cp in self        { … cp … }
```

`for cp in s` yields code points today, and §Codepoints keeps it yielding code
points after the swap — it is named in the design as *the canonical loop* that
*"survives the storage swap with its surface unchanged; only its lowering
changes."* Both function bodies are **code-point consumers** (`utf8Width` takes a
code point; the encoder's four branches each read a code point and write bytes),
so the iterating spelling is a matched pair and the indexed spelling was a
coincidence.

**Proof of behaviour-identity — measured, not argued.**

1. **A differential probe, 400 lines, byte-identical before and after.** For every
   input it prints `utf8Length(s) | encodeUtf8(s).length | every byte`. Coverage:
   the width boundaries and every non-scalar an `i32` can hold (`0, 1, 0x7F,
   0x80, 0x7FF, 0x800, 0xFFFF, 0x10000, 0x10FFFF, 0xD7FF, 0xD800, 0xDBFF, 0xDC00,
   0xDFFF, 0xE000, 0x110000, 0x7FFFFFFF, -1, -0x80000000, 0xFEFF, U+0301,
   U+1D11E`); a dense sweep of `0 … 0x900` step 7; 8 × 5 two-element pairs drawn
   from the non-scalar set; and the ordinary literals. **`diff` is empty.** The
   non-scalar coverage is the part that matters — it is the only thing that
   exercises `scalar()`'s substitution, which is the branch a naive rewrite would
   drop.
2. **All four pre-existing fixtures pass with their `@log` blocks unmodified** —
   `utf8-roundtrip.vl`, `utf8-lossy.vl`, `utf8-reject.vl`,
   `utf8-error-carries-byte.vl` — plus both downstream consumers,
   `std/fs-roundtrip.vl` and `std/args-none.vl`.

**The cost, measured, and it is negative.** The iterating walk is **faster** on
today's build: 0.806 s vs 0.913 s for 160 M code points encoded (400 000 × 400
iterations; scaling verified live at 10× work → 9× time, so the probe is not
measuring startup). ≈ 12 % better. The plausible cause is Stage 2b's own recorded
result — *"an indexed read costs +10 %… because a view's bounds check has to be
explicit where a bare array's `array.get` trapped for free"* — which `for cp in`
does not pay per element. Whatever the cause, the direction is stated because
`str-byte-semantics.md` had to report a small cost for the analogous repair and
this one does not have one.

---

## §at — is `at` a byte offset or a code-point index? **RULED: bytes.**

**The ruling is "bytes", and the strongest thing to say about it is that it was
never anything else.** `at` counts positions in `self: u8[]`. There is no
code-point reading of an index into a byte array to lose. So this is a
*confirmation and a documentation* ruling, not a change — which is the cheapest
kind and worth banking explicitly, because the alternative reading was
conceivable and someone would eventually have proposed it.

**Why the alternative was conceivable.** Both decoders produce a `string`, and a
caller might reasonably want *"where in the RESULT did this go wrong"* rather
than *"where in the INPUT"*. Today those are genuinely different numbers: for
input `C3 A9 C0 80`, `at` is **2** (bytes consumed), while the decoded prefix
`"é"` has `.length` **1**. A code-point-indexed `at` would have answered 1.

**Why bytes wins, in the order that decides it.**

1. **§API's one coordinate system.** *"Byte offsets are what `slice` takes, what
   `indexOf` returns, what `std:regex` reports as match positions, and what
   crosses the I/O boundary. There is no second kind of integer."* A
   code-point-indexed `at` would be the second kind of integer, in the one module
   whose entire purpose is the I/O boundary. `s.slice(0, e.at)` is the valid
   prefix, with no converter and no O(n) translation.
2. **It costs nothing and the alternative costs O(n).** `at` falls out of the
   decode loop's own cursor. Converting it to a code-point index would mean
   counting the code points decoded so far — a counter the loop does not need,
   on the failure path of every decode.
3. **Rust does exactly this.** `Utf8Error::valid_up_to()` is documented as a byte
   index into the slice handed to `from_utf8`, and its companion `error_len()` is
   likewise in bytes.

**The origin sub-question — relative to `off`, or absolute? RULED: relative,
unchanged.** `decodeUtf8At(block, 3, 3)` reports `at == 1`, not `at == 4`. This
is *not* a violation of one-coordinate-system, which is a rule about the **unit**
(is this integer a byte count?) and not about the **origin**. Relative wins on
three counts: it is the shipped contract; it has a live consumer that depends on
it (`std/fs.vl`'s per-entry attribution); and `off + at` is a conversion whose
two operands the caller already holds, where the reverse (`at - off`) requires the
caller to know an `off` the error did not carry. Rust's `valid_up_to()` is
likewise relative to the slice passed in. Pinned both ways in
`utf8-invariant.vl` §7.

**The byte-era payoff, which is the (b) in the classification.** After the swap,
decode is a byte identity for the valid prefix, so `at` acquires a **second
simultaneously-true reading**: it is both *the byte offset of the failure in the
input* and *the byte length of the successfully decoded prefix*. Those two numbers
are equal after the swap and unequal today for any non-ASCII prefix. That is a
strict gain in what one integer tells you, and `utf8-invariant.vl` §6 pins it in
the form that is true on **both** sides — `at == encodeUtf8(prefix).length`.

**Not recommended: adding Rust's `error_len()`.** It would distinguish "truncated,
ask for more input" from "genuinely invalid", which is the streaming-decoder use
case. There is no streaming decoder in the tree and this module's admission
discipline is *nothing lands without a caller*. Filed, not built.

---

## §NonScalar — the substitution ruling moves from this module to the CORE

**This is the item on this checklist most likely to be missed, because nothing
fails when you miss it — the wrong answer is a valid string.**

`std:utf8`'s header carries a ruling: *"ENCODE IS TOTAL … A VL string is an i32
sequence and nothing stops it holding -1, 0x110000 or a lone surrogate
(`fromCodePoints` accepts any `i32[]`) … Each such element is encoded as U+FFFD."*
That ruling exists because the **core** has no opinion. Measured on this build:

```
fromCodePoints([0xD800]).charCodeAt(0)     ->  55296      stored verbatim
fromCodePoints([0x110000]).charCodeAt(0)   ->  1114112    stored verbatim
fromCodePoints([-1]).charCodeAt(0)         ->  -1         stored verbatim
```

**After the swap, storing it verbatim is not an option** — the backing is UTF-8
bytes and a non-scalar has no UTF-8 encoding. So `fromCodePoints` itself must
pick: **substitute U+FFFD**, **trap**, or **drop**. This is a core ruling that
the swap forces, and today's tree contains **two different answers to it
already**:

```
encodeUtf8(fromCodePoints([97, 0xD800, 98]))  ->  61 EF BF BD 62   substitutes
print(fromCodePoints([97, 0xD800, 98]))       ->  61 62            DROPS
```

(both measured; the `print` line is a `hexdump -C` of the process's stdout.) The
host's `print` silently drops non-scalars while this module substitutes — the
tree already holds the two-decoders-with-two-opinions situation this module's
header says it exists to prevent, and the swap is the moment one of them has to
win.

**Recommendation: SUBSTITUTE U+FFFD, in `fromCodePoints`.** It matches the
shipped `encodeUtf8` ruling and its stated argument (a fallible constructor would
infect every caller for an input no correct program produces, and it would still
have to emit *some* bytes); it matches WHATWG; and it makes the invariant
*"every VL string produced by `fromCodePoints` is well-formed UTF-8"* true by
construction, which is the strongest form of the guarantee available. `print`'s
drop should be brought into line with it. Trapping is the defensible alternative
and should be rejected explicitly rather than by omission — it turns a `u8[]` →
`i32[]` → `string` pipeline into a panic on data.

**Consequence for this module either way:** once the core substitutes, `scalar()`
and `utf8Width()`'s substitution branches become unreachable-but-harmless
defensive code, because a post-swap string cannot contain a non-scalar. Leave
them; they are three comparisons and they document the rule.

---

## §Ownership — `s.bytes()` is a VIEW, and `encodeUtf8` today returns a fresh array

Collapsing `encodeUtf8` to `self.bytes()` is not a pure win, and the difference
is invisible in a type. Measured on today's build:

```vl
const b = encodeUtf8("hello")
b[0] = 74          // element assignment: allowed
b.push(33)         // growth: allowed
decodeUtf8(b)      // "Jello!"      length 6
```

Today's result is a **fresh, mutable, growable `u8[]` the caller owns**. §Byte
view specifies `s.bytes()` as *"a `u8[]` view over the same backing — not a
copy"*, justified by immutability: *"Because strings are immutable, the view
aliases `$backing`/`$start`/`$len` directly with no defensive copy and no
invalidation risk."* **That justification is one-directional.** It establishes
that the *string* cannot change under the *view*. It does not establish that the
*view* cannot change under the *string*, and `u8[]` in VL is demonstrably mutable.

**The question for the compiler-side agent: is `s.bytes()` writable?**

- If **yes**, string immutability — which §Equality's cached hash, §Header's
  slice views and §Bytes' defensive-copy-free aliasing all rest on — is breakable
  from ordinary VL, via one method call and one element assignment.
- If **no**, VL needs a read-only array notion it does not have today, or
  `bytes()` must copy (giving up the O(1) claim), or the two must be split into
  `bytes()` (view, read-only) and something copying.

**Recommendation: `s.bytes()` is READ-ONLY**, and `encodeUtf8` is kept as the
named wrapper precisely so the ownership change has somewhere to be documented.
Nothing in the tree mutates an `encodeUtf8` result today (`std/fs.vl` passes all
five straight to a host builtin; `std/args.vl` reads), so the change is safe to
make — but it is a **silent contract change** for any future caller, which is
exactly the shape of defect this document exists to catch. If a copying form is
wanted later, it is `encodeUtf8`'s to grow.

---

## §Wrap — the lenient wrap and `decodeUtf8Lossy` are DIFFERENT operations

After §Validity, the core will be able to turn arbitrary bytes into a string with
no check. That looks like it makes `decodeUtf8Lossy` redundant. It does not, and
the difference is the clearest single answer to *does this module still exist*:

| | core lenient wrap (§Validity) | `decodeUtf8Lossy` |
|---|---|---|
| bytes in the result | **the original bytes, unchanged** | **rewritten** — `EF BF BD` where each ill-formed subpart was |
| `s.bytes()` afterwards | round-trips to the input | the input is **gone** |
| `s.length` afterwards | counts the malformed bytes | counts the replacement bytes |
| when U+FFFD appears | only at *decode* time, i.e. `for cp in s` | at *construction* time, permanently |
| guarantee | none — a string that is not valid UTF-8 | **valid UTF-8, always** |
| use | *show me something* — a log tailer, an editor | *give me bytes I can hand onward as text* — a filename, a JSON field, an HTTP header |

Go draws exactly this line between `string(b)` (no substitution; `for range`
yields U+FFFD lazily) and `strings.ToValidUTF8` (eager rewrite). **After the swap
`decodeUtf8Lossy` stops being a decoder and becomes a sanitizer** — its name is
then very slightly wrong, and renaming it is *not* recommended: it is the WHATWG
substitution algorithm under the name every other language gives that algorithm
(Rust's `from_utf8_lossy`), and the rename would cost a breaking change to buy
precision that this table buys for free.

**The consequence for `encodeUtf8`, which is what §Wrap has to rule.** Post-swap,
should `encodeUtf8(s)` return the string's **raw** bytes (a view, O(1), possibly
malformed) or **sanitized** bytes (a copy, O(n), always well-formed)?
**Recommendation: RAW.** §Byte view already specifies `bytes()` as the raw
zero-copy view and `encodeUtf8` should not silently be a different, more
expensive operation wearing the same shape; a caller who wants the guarantee
composes it — `decodeUtf8Lossy(s.bytes())` — and pays visibly, which is
§Codepoints' own principle (*operations whose cost depends on the data get a
name*). This is also what forces `utf8Length` → `.length` rather than a
sanitizing count; the two are one ruling, per the module's no-drift invariant.

---

## §Fixture — what is pinned, and what is deliberately not

**`tests/cases/std/utf8-invariant.vl` — 38 assertions, all of which must be
identical before and after the swap.** The rule it follows, borrowed from
`str-multibyte.vl`: **nothing whose unit is about to move is printed.** No
`string` `.length`, no `charCodeAt`, no `s[i]` over a string, no offset compared
to a character count. What it pins instead: `u8[]` lengths and element values
(already bytes); string values via `==` (byte equality before and after);
`Utf8Error.at`/`.byte` (byte-domain readings of a `u8[]`); code-point counts
obtained by `for cp in s`; and pure-ASCII numbers, where the two units are the
same number by definition.

Sections: round-trip identity at all four widths · ASCII as the migration's fixed
point · the `utf8Length` ≡ `encodeUtf8().length` invariant at every width · the
wire bytes spelled out (`61` / `C3 A9` / `E4 B8 AD` / `F0 9F 98 80`) · decode by
value · `at` as a byte offset, pinned as `at == encodeUtf8(prefix).length` ·
`decodeUtf8At`'s relative origin · strict-rejects at all five ill-formed families
· the maximal-subpart rule counted in code points *and* in bytes · empty in both
directions.

**One existing fixture was repaired, and its `@log` block did not change.**
`utf8-lossy.vl:27` was `print(decodeUtf8Lossy(twoBad).length)` — pinned at 4
today, **8** after the swap, and `string-rep-measurements.md` §2.0 lists it as
one of exactly three corpus assertions the swap was scheduled to break. It now
counts by `for cp in`, which is 4 under both representations and still pins the
thing the file exists to pin (*the count of replacement characters*, a count that
only means anything in code points). **This reduces the swap's fixture blast
radius from 3 assertions in 2 files to 2 assertions in 1 file**
(`tests/cases/strings/escapes.vl`, which is outside `std/` and untouched here).

**What is deliberately NOT pinned — the expected changes:**

| Expression | Today | After §API | Why not pinned |
|---|---|---|---|
| `utf8Length(s)` cost | O(n) | O(1) — it *is* `s.length` | cost, not value; and the export should be deleted |
| `encodeUtf8(s)` cost | O(n) copy | O(1) view | cost, not value (§Ownership is the behavioural half) |
| `encodeUtf8(s)` ownership | fresh, mutable | aliased view | **§Ownership open** |
| `decodeUtf8Lossy(b).length` | code points | bytes | §API, by design — repaired to a `for cp in` count instead |
| `decodeUtf8(b)` cost | `i32[]` + re-encode | ditto, until `fromBytes` | cost, not value |
| `fromCodePoints([0xD800])` | stores 55296 verbatim | must substitute / trap / drop | **§NonScalar open** |
| `print(fromCodePoints([97,0xD800,98]))` | `ab` (drops) | should be `a�b` | **§NonScalar open** |

---

## §Migration checklist

For whoever executes Step 2, in order. Items 1–2 are already done in this change.

1. **DONE — `utf8Length` and `encodeUtf8` no longer index a string.** Both walk
   `for cp in self`. Do not reintroduce `self.charCodeAt(i)` or `self[i]` over a
   `string` anywhere in `std/`; after this change there is **no remaining
   `charCodeAt` call in `std/` at all** (`std/utf8.vl` held the last one).
2. **DONE — `tests/cases/std/utf8-invariant.vl` exists and
   `tests/cases/std/utf8-lossy.vl` is migration-invariant.** Run
   `utf8-invariant.vl` *first* after the swap: it is the only fixture in the tree
   that can distinguish the two representations for this module.
3. **Rule §NonScalar before the swap ships.** `fromCodePoints` must decide what a
   non-scalar element becomes once there is no `i32` to hide it in. Recommended:
   substitute U+FFFD, and bring `print` into line. **This one fails silently** —
   drop and substitute both produce a valid string.
4. **Rule §Ownership.** Is `s.bytes()` writable? If yes, string immutability is
   breakable from VL and §Equality's cached hash is unsound. Recommended:
   read-only.
5. **Rule §Wrap's consequence:** `encodeUtf8` returns RAW bytes, not sanitized —
   which is what makes item 6 correct.
6. **Then collapse the two exports, together, in one change**, because the
   module's no-drift invariant ties them: `utf8Length` → delete (call `.length`;
   its only caller is `utf8-roundtrip.vl:35`), `encodeUtf8` → `{ self.bytes() }`.
   Do **not** collapse before item 3 — a `fromCodePoints` that drops non-scalars
   plus an `encodeUtf8` that returns raw bytes is a silent data-loss path.
7. **Leave `decodeCore`, `decodeUtf8`, `decodeUtf8At`, `decodeUtf8Lossy` and
   `Utf8Error` alone.** They are `u8[]`-domain and correct. If the corpus reports
   a diff in them after the swap, the bug is in `fromCodePoints`, not here.
8. **`utf8-roundtrip.vl` needs one edit and only one** — dropping the
   `utf8Length` import and its `print` if item 6 deletes the export. Its other
   eight assertions are `u8[]` lengths and printed text, all invariant.
9. **File the `fromBytes` follow-on**, don't build it. `decodeUtf8` materializes
   an `i32[]` of code points and re-encodes bytes that were already correct. It
   is an optimization on a correct implementation — the same follow-on
   `str-byte-semantics.md` §Builders filed for `std:str`, and the same reason to
   defer it.

---

## Sources

- Differential probe (400 lines, byte-identical before/after the repair): dense
  code-point sweep + every non-scalar an `i32` can hold + multi-element pairs +
  literals, printing `utf8Length | encodeUtf8().length | every byte`. Run on this
  build with `scripts/vl-host/target/release/vl run … --compiler
  build/vl-compiler.wasm`. The harness was a throwaway.
- Loop-shape cost (0.913 s indexed vs 0.806 s iterating, 160 M code points;
  liveness confirmed by 10× scaling): run on this build, both bodies inlined so
  only the walk differs.
- `fromCodePoints` storing non-scalars verbatim (55296 / 1114112 / -1) and
  `print` dropping them (`hexdump -C` of stdout: `61 62 0a`): run on this build.
- `encodeUtf8`'s result being mutable and growable (`b[0] = 74`, `b.push(33)` →
  `"Jello!"`, length 6): run on this build.
- Core string method surface today — `slice`, `indexOf`, `includes`,
  `charCodeAt` only; **no `bytes`, `cpAt`, `cpLen`, `backwards`,
  `isCharBoundary` or `compact` exists yet**: `compiler/check_query.vl:516–519`.
- `fromCodePoints`'s signature: `compiler/driver.vl:1123`.
- Call sites: `std/fs.vl` (5 × `encodeUtf8`, 1 × `decodeUtf8`, 1 ×
  `decodeUtf8At`), `std/args.vl` (1 × `decodeUtf8`, re-exports `Utf8Error` at
  `:189`).
- `Utf8Error::valid_up_to()` / `error_len()` as byte indices relative to the
  passed slice; `from_utf8_lossy`; Go's `string(b)` vs `strings.ToValidUTF8`:
  language documentation, not run here (neither toolchain is installed in this
  environment).
- In-repo: `docs/guide/strings-design.md` §Storage / §API / §Codepoints /
  §Validity / §Byte view / §Equality; `docs/internals/str-byte-semantics.md`
  §Builders / §Migration checklist item 6, which asked for this audit;
  `docs/internals/string-rep-measurements.md` §2.0 (the fixture blast-radius
  inventory this change shrinks).

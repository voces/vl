# `std:json` v1 — critique, angle: consistency with std and the rubric

> Status: CRITIQUE, 2026-09-01, of docs/json-design.md as of commit e40ffbf8ce854cdf65241d0c35859b15b35e5f47

Graded as the `std-api-reviewer` would, against `docs/internals/std-api-review.md` and the
four headers the proposal claims to follow (`std/fs.vl`, `std/fmt.vl`, `std/utf8.vl`,
`std/base64.vl`). Findings are ordered by how much they should change the SURFACE: 1–3 are
surface edits, 4–8 are header work, 9–11 are checks that came back clean or nearly so.

**What was run.** Five probes on the 2026-09-01 seed, `VL_STD=<worktree>/std`; the programs are
in §Probes. They are the only claims here marked (RUN); everything else is a citation.

## 1. `JsonError` is not structurally distinct from `Base64Error`, and the doc's own distinctness argument never checks its nearest neighbour — CHANGE THE SURFACE

> **Language ruling, 2026-09-02 (owner), after this finding:** `is A` over same-shape struct
> arms is a DISCRIMINANT-VALUE test — the `kind` literal sets DO distinguish `Base64Error`
> from `JsonError` by rule, and `Base64Error | JsonError` is a legal union once D1023 is
> built. The finding's premise ("the rep erases the sets") describes today's compiler, not
> the language. The surface change it asked for (`path`) stands on its own merits and shipped;
> the interim std rule (a field NAME no other std error has) stays until D1023 closes.
> DECISIONS.md §"`is A` over same-shape struct arms is a DISCRIMINANT-VALUE test".

**The choice.** §2.2: `JsonError = { at: i32, kind: "syntax"|"duplicate"|"depth"|"nonfinite",
msg: string }`, with the argument that `kind` "is also the third field that keeps `JsonError`
structurally distinct from `IoError` and from any `{ at, msg }` a program of its own declares."

**The precedent.** `std/base64.vl:124-128` already occupies that shape:
`Base64Error = { at: i32, kind: "character"|"length"|"padding"|"bits", msg: string }` — the
same three field names, the same three types modulo the literal-union CONTENTS. Its header
(`std/base64.vl:97-103`) and `std/utf8.vl:122-129` are the two places std records why a third
field exists at all: VL aliases are STRUCTURAL, so two error types that agree on their fields
are ONE type, and a union naming both fails. `Utf8Error` bought its distinctness with `byte`,
a field carrying information that was previously "only stringified into `msg`"
(`std/utf8.vl:105-107`). The json proposal buys nothing new — it re-spends base64's field.

**Measured (RUN), and it is worse than a style point.** With the two types declared as above
and `function f(n: i32): Base64Error | JsonError`:

- `r is Base64Error` and `r is JsonError` are **both `true`** on the same value (probe `a2`).
- A two-arm consumer — narrow one arm, print `msg`, narrow the other — **traps**:
  `wasm trap: cast failure … a value was not an instance of the type it was narrowed to`
  (probe `a`). Check is clean.
- Add ONE distinguishing field to `JsonError` and both go right: `true` / `false`, and the
  program runs (probe `a3`).

That consumer is not hypothetical — a base64-embedded JSON payload, or any helper returning
"the reason this document did not load", spells exactly that union.

**Rubric item.** §1 "the module header explains WHY"; §3 "Can the caller SPELL the error
arm?"; and the standing rule the two existing headers state, that a std error type must be
structurally unique.

**Recommendation — CHANGE TO:** `JsonError = { at: i32, kind: …, path: string, msg: string }`,
where `path` is the key/index path to the offending value (`"$.users[0].name"`, `""` at the
root). §2.5 already says "the msg carries the key/index path when the walker has one" — this
promotes it out of prose, which is precisely `Utf8Error.byte`'s warrant, restores distinctness
against `Base64Error`, and fixes finding 2 at the same time. Verified to work today (probe
`a3`).

## 2. The render-side `at` indexes a buffer the caller never receives — CHANGE THE SURFACE

**The choice.** §1 and §2.5: `at` is "a byte offset into the input (parse) or into the output
produced so far (render)".

**The precedent.** Every `at` in std indexes THE VALUE THE CALLER HANDED IN.
`std/utf8.vl:100-104` — a byte offset within the decoded range, relative to the `off` passed
in, so `s.slice(0, e.at)` is the valid prefix. `std/base64.vl:114-117` — a byte offset into
the string that was handed in, "the same coordinate system `slice` and `indexOf` use", with
one documented exception (`"length"`, where the fault is the input's size). `IoError` has no
`at` at all (`std/fs.vl:113`). There is no std precedent for an offset into a value the
caller does not hold, and §1 of the proposal is explicit that a render "never emits a partial
document" — so the string that `at` indexes is discarded before the error is returned.

**Rubric item.** §2 "A name that promises more than it delivers … a type must not claim what
it does not enforce."

**Recommendation — CHANGE TO:** on the render side `at` is `0` and the location is `path`
(finding 1), with the header stating the split: *`at` is an offset into `self` on parse and is
not meaningful on render, where `path` locates the value.* If that is refused, the
`JsonRenderError` split §2.2 declined becomes attractive again — a position field meaning two
different things in two directions is exactly the shape a split is for.

## 3. `parseJson` can build a tree `toJson` refuses — CHANGE THE SURFACE

**The choice.** §2.3: range is not a parse failure, inherited from fmt — `1e999` parses to
`Infinity`, "which the tree can hold and the renderer will then refuse (§2.5)". The doc names
this as a critique item itself: "a round-trip that fails one step late."

**The precedent, and it is the strongest one in std.** `std/base64.vl:49-57` refuses
non-canonical trailing bits — a strictness nobody's decoder is obliged to apply — for exactly
one reason: *"That refusal is what makes `decodeBase64` followed by `encodeBase64` an exact
identity on every accepted string."* std has already paid ergonomics once to buy a round-trip
invariant. Meanwhile `std/fmt.vl:317-338` rules that out-of-range is `null` for `parseI64` and
`±Infinity` for `parseF64` — and gives the reason: a float HAS a value meaning "larger than any
of me", an integer does not. **JSON is the integer case, not the float case**: RFC 8259 has no
`Infinity` production, so `Infinity` is not a value the target format can denote, and the
inherited float rule is being applied to a type whose grammar excludes its result.

**Rubric item.** §2 "a type must not claim what it does not enforce" — `Json` is named for a
format it can hold values outside of.

**Recommendation — CHANGE TO:** the number lexer refuses a lexeme whose value is not finite,
as `kind: "syntax"` (or a fifth kind, `"range"`; serde_json's message is `number out of
range`). Then the header can state the invariant base64's header states: **every tree
`parseJson` returns, `toJson` renders.** `nonfinite` still has to exist, because a
PROGRAM-BUILT tree can hold `0.0/0.0` and nothing in VL can stop it — but it stops being
reachable from a parse, which is the round trip a config rewriter actually runs.

## 4. Names — `parseJson` is exactly right; `toJson` is right for a reason the doc does not give, and one dismissal is factually wrong

**What the tree actually does.** 123 exports, four naming families for a CONVERSION:

| family | members | the noun names |
| --- | --- | --- |
| `parse<T>` | `parseF64`, `parseI64`, `parseI32` (`std/fmt.vl:494,501,1226`) | the RESULT type; receiver is `string` |
| `to<Target>` | `toString` (`std/fmt.vl:212`), `toUpperAscii`/`toLowerAscii` | the TARGET form |
| `encode<Fmt>`/`decode<Fmt>` | `encodeUtf8`/`decodeUtf8`(`At`,`Lossy`), `encodeBase64`/`decodeBase64` | the FORMAT, direction per the format's own name (`std/base64.vl:19-26`) |
| noun-first ASK | `pathKind`, `pathExists` (`std/fs.vl:68-75`), `programArgs`, `bufferMark` | the subject |

Everything else is a verb-first UFCS method (`indexOf`, `split`, `trim`, `sorted`, `readFile`)
or a width-suffixed family member (`loadI32`, `getF32`).

**`parseJson` is unambiguously in family one** — `parseF64: string → f64` and
`parseJson: string → Json` are the same shape, the noun is the return type, and
`"{…}".parseJson()` is as sensible a receiver as `"1.5".parseF64()` (contrast `std/fs.vl:60-66`,
where `path` is deliberately not `self` because `"hello".readTextFile()` would be nonsense).
**Accept.**

**`toJson` is in family two** — the noun names the TARGET form, as `toString` does. The one
wrinkle is real and worth a header line: v1 is the only std export whose noun is the same word
as its receiver's type, so `toJson(self: Json): string` reads as a no-op until stage 3
generalises it. The doc's stage-3 argument (one name, generalised in place, no rename) is the
deciding one and I accept it — but the header must also note what `std/fmt.vl:49-61` notes
about `toString`: a `toJson<T>` defined for every `T` the deriver reaches IS the universal
renderer `toString` deliberately refused to become, and it is admissible only because serde
stage 2's derive is what delivers it.

**The `encodeJson`/`decodeJson` dismissal is wrong on its facts.** §2.4 declines it because
"those are byte-level codecs, and JSON is text" — but `encodeBase64(self: u8[]): string`
produces TEXT (`std/base64.vl:164`), which is the same shape as `encodeJson(self: Json):
string`. The real reason to decline is better and should replace it: both existing `encode*`
functions are TOTAL (`std/utf8.vl:40-49`, `std/base64.vl:28-30`) and their `decode*` twins are
the fallible half. `toJson` is fallible in the encode direction, so the codec framing would
promise a symmetry this module does not have.

**`jsonParse`/`jsonRender`:** `render*` exists in std only as PRIVATE names (`renderI64`,
`renderF64` behind `toString`), and noun-first is reserved in `std/fs.vl:68-75` for functions
that ASK ABOUT a subject rather than operate on it. Correctly declined.

**Recommendation:** accept `parseJson`/`toJson`; rewrite §2.4's dismissal of
`encodeJson`/`decodeJson` on the totality argument; add the `toString`-domain note to the
header.

## 5. `parseJson` + `fromJson<T>` is duplicated functionality by the doc's own admission — MUST BE JUSTIFIED IN THE HEADER

§2.4 concedes it: "when they land `fromJson<Json>` and `parseJson` will both exist and agree."
That is the rubric's §2 "Duplicated functionality" precisely. It is also precedented: `std:fmt`
keeps `padLeft` as a one-call DELEGATION to `std:str`'s `padStart` (`std/fmt.vl:151-156,
225-233`) and re-exports `join`/`repeat`/`split` so that "these are the SAME functions … and
not second copies" (`std/fmt.vl:160-164`). In both cases the header names which spelling is
canonical.

**Recommendation:** keep both; the header must say `parseJson` is the canonical tree entry and
that `fromJson<Json>` is the same function reached through the typed door — not a second
implementation. Without that sentence a reader has two names and no rule for choosing.

## 6. `get`/`at` — the decline is right, and for a stronger reason than either the doc gives

§2.8 declines them on (1) "the two most generic names in the language" and (2) the cost being
a compiler gap. Both are true; neither is the decisive one.

- **`get` is already claimed by the checker as a MAP BUILTIN.** `compiler/typecheck.vl:18505-18513`
  lists the map/set builtin methods: `set`, `get`, `has`, `delete`, `add`, `keys`, `values`.
  The `Json` object arm IS a VL map, so `o.get("k")` on a narrowed object resolves to the
  builtin and `v.get("k")` on an un-narrowed `Json` would resolve to the std export — the same
  spelling meaning two functions depending on narrowing state. (Measured: `m.get("a")` passes
  check and refuses at emit today, `emitProgram: callee is not a function name` — probe `c`. So
  the name is taken at check level and unimplemented at emit level, which is the worst of both.)
- **`Json | null` cannot express "missing".** `null` is already an arm of `Json`, so a lax
  accessor has no return type in which the two answers differ. The map arm's `m.has(k)` is the
  only spelling that carries it, and it RUNS (probe `c2`) — which is what §2.1 claims.

**Recommendation:** accept the decline; replace the grounds with these two. If a consumer ever
forces them, the names are `jsonGet`/`jsonAt` — `std/fs.vl:68-75` and `std:buffer`'s
`getF32`/`getI32` (never a bare `get`) have already ruled the flat-scope question, so this is
not a new precedent to set.

## 7. `string` not `u8[]` — right answer, wrong precedent — MUST BE FIXED IN THE HEADER

§2.9 argues that "the file→JSON pipeline is `readFile(p)` → `decodeUtf8()` → `parseJson()`,
three steps that each own one failure kind, rather than one function with an
`IoError | Utf8Error | JsonError` return."

**std already refuses that framing.** `readTextFile(path): string | IoError`
(`std/fs.vl:257-272`) is the one-step spelling, and it folds the decode failure into `IoError`
as `EILSEQ` — "Two failures, one type". So the pipeline a real consumer writes is TWO steps
with `IoError | JsonError`, and std's own answer to "should the composed function exist" is
YES, with the second error type absorbed by the first. `std/fs.vl:78-84` gives the actual rule
being followed here — text is a DECODING on top of bytes, "which is why `readFile`/`readTextFile`
are two functions with two types and not one function with a flag."

Also: "a `u8[]` overload is a later, additive export" (§2.9 last line) — **VL has no
overloading.** The additive paths are a widened union receiver (`std/fmt.vl:205-211`: one
`toString`, four arms, "a flat namespace has room for exactly one") or a second name. `u8[]`
sits outside the generic surface (`std/base64.vl:105-107`), which is a further reason the
union-receiver route may not be available; the header should say which one is intended.

**Recommendation:** accept `string`-only; rewrite the paragraph around `readTextFile` and drop
the word "overload".

## 8. The silently-lossy trio — two need the header, one is already settled

Rubric §2: "Silently lossy operations … Either the name says it (`decodeUtf8Lossy`) or the
type does; never both silent."

- **Integers beyond exact f64 range (§2.3).** The TYPE says it — the arm is `f64` — which is
  the same defence `parseF64` has. But `std/fmt.vl:240-244` and `271-281` show the standard to
  match: fmt states the loss with its witness (`parseF64("9007199254740993")` is
  `9007199254740992`) and names the exact alternative in the same paragraph. **Must be
  justified in the header**, with that witness and a pointer to `parseI64` as the exact path.
- **`-0.0` renders as `0` (§2.5).** Inherited from `toString`; `std/fmt.vl:309-312` already
  records that `parseF64` answers −0.0 where `parseI64` answers 0. **Must be in the header**,
  not only in this design doc — a design doc is not the file a caller reads.
- **The lax `get`/`at` conflating missing with null** is declined, so nothing is owed
  (finding 6).

**And the header owes one list the doc does not assemble.** §2.1 sells insertion-ordered
objects on "parse→render is an identity on key order, which is what a config-file rewrite
wants". That is a round-trip claim, and it currently has three exceptions living in three
different sections: integers past exact range, `-0`, and `1e999` (finding 3). One paragraph,
one list. If finding 3 is taken, the list is two entries and the claim gets much stronger.

## 9. One `JsonError` for both directions is NOT a second error channel — ACCEPT

Checked against the rubric's §2 "second error channel" (sentinels, an `ok` boolean, a
thrown-equivalent). This is none of those: it is one `T | E` in the ruled model.

It is also directly precedented: `IoError` (`std/fs.vl:113`) serves `readFile`, `writeFile`,
`listDir`, `pathKind`, `pathExists` AND a folded decode failure — one type across both
directions and five operations, with codes only some of them can produce (`ENOSPC` on write,
`ENOTDIR` on list). The proposal's split alternative (`JsonRenderError`) has no std precedent.

One cost the doc should name: `IoError`'s discriminator is an OPEN i32 errno, while
`JsonError.kind` is a CLOSED literal union, so a parse-only consumer writing an exhaustive
`match` must still handle `"nonfinite"`. §2.2 already promises "the header lists which kinds
each function can produce" — that promise is what settles this, and it must actually land in
the header. Growing the union later (a fifth `"cycle"`) is safe and precedented:
`std/fs.vl:131-135` rules that a new arm "makes every existing `match` fail loudly instead of
silently falling through."

## 10. Depth cap 128 — ACCEPT, and match the form fmt already uses

std does carry a fixed limit, and it is the closest possible analogue: `const MAX_SIG_DIGITS =
800` (`std/fmt.vl:1187`), documented at `std/fmt.vl:614-616` — the number, the reason, and the
cross-language citation (*"Go's `strconv` uses 800 for the same reason"*). `std/fmt.vl:391-397`
then explains why the integer parsers have NO cap, and names the motive as
"a denial-of-service surface for the JSON reader both halves are being built for" — this
module is that reader.

**Recommendation:** accept 128 and the refusal to make it a parameter; match the form — a
private named const (`MAX_DEPTH`, not a bare `128` at two call sites), a header paragraph with
the number, the DoS argument and serde_json's citation, and one sentence borrowed from
`std/fmt.vl:296-302`: the cap can be RAISED later and can never be lowered, so the
conservative number keeps both options.

## 11. Speculative — naming a signature you do not ship is not speculation; fixing its PARAMETERS is

**Position: it is the cheapest moment to be critical, and std already has the pattern.** The
rubric's §2 "anything speculative" cites `std-design.md` D2's ADMISSION principle — it governs
what LANDS in std, and a signature in a design doc lands nothing. The worked precedent is
`std/base64.vl:59-63`: the URL-safe alphabet is named in WHAT IS NOT HERE, together with the
name it will take (`encodeBase64Url`) and the shape it must not take ("never a boolean
parameter"). Naming `toJsonPretty` and `jsonKind` now does the same job — it stops the next
person shipping `toJson(v, pretty)`.

Three corrections, though:

1. **They are in the wrong place.** §1 presents them in an `export function` block under
   "The surface". They belong in the header's WHAT IS NOT HERE, in base64's form.
2. **Do not fix `toJsonPretty`'s parameter list.** `indent: i32` is the magic-number parameter
   §2.6 objects to, with no consumer to say whether `0` means "no indent", whether tabs are
   spellable, or whether JS's string-or-number `space` is the better shape. Fix the NAME (so
   the mode-switch spelling stays refused); leave the parameters to the consumer that arrives.
3. **`jsonKind` needs a named return alias.** `pathKind` returns `FileKind`, an exported alias
   with its own comment (`std/fs.vl:131-135`); `Base64Error.kind`'s union is inline because it
   is a FIELD. `jsonKind` returns one, so it takes `export type JsonKind = "null" | …`.

**Cross-module note, and it is live.** `std/fmt.vl:246-257` admits `parseI64`/`parseI32` with
the sentence *"the consumer that will spell it is `std:json`, next in the same slice"* — and
this proposal's v1 does not spell either of them (§2.3 routes exactness to stage 3's lexer).
That header shipped one day before this doc. The json header must say that the tree's number
arm is `f64` and that the STAGE 3 decoder is the consumer fmt named, or fmt's admission
sentence is orphaned and the next reviewer will read it as false.

**Also checked, clean.** Union returns explicitly annotated on both exports (rubric §1's
exceptionless row, `docs/internals/std-api-review.md:39`); `self`-first on both;
lowerCamelCase; no ambient state, no order-dependent calls, no boolean parameters, no
out-parameters; no borrowed error arm, so nothing is owed under the re-export rule (§3). The
mechanical §0 check (`std/embedded.ts`) does not apply yet, but it is the first thing the
BUILDER owes.

---

## Verdict

The five decisions in §6, with a vote:

1. **Names — `parseJson`/`toJson`.** **Agree.** `parseJson` is `parseF64`'s shape exactly; the
   stage-3 one-name argument carries `toJson`; the dismissal of `encodeJson`/`decodeJson`
   needs rewriting (finding 4) but reaches the right answer.
2. **Large integers — silent rounding, documented.** **Agree**, conditionally: the arm is
   declared `f64`, so the type says it, which is the rubric's test — but the header must carry
   fmt's witness and point at `parseI64`, and a `precision` error would make a document with
   one large id unparseable, which is a worse failure than a rounded one.
3. **Helpers — none in v1.** **Agree**, on stronger grounds: `get` is already a checker-claimed
   map builtin, and `Json | null` has no spelling for "missing" (finding 6).
4. **Error type — one `JsonError` for both directions.** **Agree** on the single type
   (`IoError` is the precedent), **disagree** on its fields: it needs a fourth to be
   structurally distinct from `Base64Error`, and `path` is the field that also repairs the
   render-side `at` (findings 1–2).
5. **Input type — `string` only.** **Agree**; the reasoning must be rebuilt on `readTextFile`
   rather than on a three-step pipeline nobody writes (finding 7).

**Overall: REVISE** (rubric §5: INCONSISTENT — naming the smallest change that fixes it).

The smallest change is three surface edits and a header:

- add `path: string` to `JsonError` (finding 1 — measured, and the shape traps without it);
- make render-side `at` `0` and document `path` as the render coordinate (finding 2);
- refuse non-finite number lexemes on parse, so every tree `parseJson` returns renders
  (finding 3).

Everything else is header work and none of it blocks. Worth saying plainly: the surface is
unusually well argued for a first draft — every decision already has its alternative beside
it, which is most of what this rubric asks for — and it does not compile today (D1021), so
these edits land before a line of it is written, which is the moment CLAUDE.md calls cheapest.

---

## Probes

Run from the worktree root, `VL_STD=$PWD/std`, 2026-09-01 seed.

`a` — two sibling error structs in one union: prints `b64`, then **traps**
(`wasm trap: cast failure … a value was not an instance of the type it was narrowed to`),
`vl check` rc 0:

    type Base64Error = { at: i32, kind: "character" | "length" | "padding" | "bits", msg: string }
    type JsonError = { at: i32, kind: "syntax" | "duplicate" | "depth" | "nonfinite", msg: string }
    function f(n: i32): Base64Error | JsonError {
      if n == 0 { return { at: 1, kind: "length", msg: "b64" } }
      return { at: 2, kind: "syntax", msg: "json" }
    }
    const r = f(0)
    if r is Base64Error { print(r.msg) }
    const r2 = f(1)
    if r2 is JsonError { print(r2.msg) }

`a2` — `a` with its last three lines replaced by `print(r is Base64Error)` and
`print(r is JsonError)`: prints **`true` `true`**.

`a3` — `a2` with `, path: string` added to `JsonError` and `path: "$.a"` in the second return,
plus `const r2 = f(1); if r2 is JsonError { print(r2.path) }`: prints **`true` `false` `$.a`**,
runs clean.

`c` / `c2` — the map builtins. `m.get("a")` over a `{ [string]: i32 }` is check-clean and
refuses at emit (`emitProgram: callee is not a function name`); `m.has("a")` / `m.has("zz")`
print `true` / `false`.

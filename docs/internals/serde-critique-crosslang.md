# A cross-language critique of `docs/serde-design.md` — read through other ecosystems' REGRETS

> **Role.** This is an adversarial second pass over `docs/serde-design.md`, taken from one
> angle only: **what other languages' serialization stories got wrong, and where the plan is
> standing in the same place.** It is not a summary of that document and does not repeat its
> survey. Where the survey is right, this document says so once and moves on; the credit
> section at the end is deliberately short and specific rather than polite.
>
> **Written 2026-09-01.** Ten probe programs (p1–p10) were run against that day's seed and are inlined
> in the appendix; every claim marked **(RUN 2026-09-01)** was executed, not recalled. Claims
> about other ecosystems are from spec and ecosystem knowledge **without web access** — where
> a detail is version-sensitive or I am recalling rather than reading, it says so in the
> sentence. That hedge is load-bearing: a critique whose evidence is "as I remember it" is
> worth less than one that says which half is which.
>
> **Probe setup**, per CLAUDE.md: `VL_STD=$PWD/std`, `--compiler build/vl-compiler.wasm`. A
> worktree probe without `VL_STD` measures the main checkout's `std`.

---

## The one-paragraph version

The plan is unusually well-read and it dodges more famous mistakes than most shipped
serializers (§Credit). Its exposures cluster in one place: **the document decided its format
questions in one section and its policy questions in another, and four of those pairs
contradict each other.** Snapshot wants evolution; VLB has none. Untagged JSON wants
distinguishable arms; the i64-as-string convention and the open-ended map arm destroy
distinguishability, and neither is in OQ-7. The ambiguity refusal is presented as free;
it is undecidable-in-practice unless it is narrowed to a rule, and it cannot be *computed
at all* until the unknown-field policy — which is in no OQ — is ruled. And the plan's own
recommended migration mechanism (`deserialize<ConfigV1 | ConfigV2>`) is exactly the union
shape its own ambiguity refusal rejects.

None of that argues for a different architecture. The derive is right for VL and the survey's
synthesis is correct. The findings below are mostly **one paragraph of ruling and one header
field** away from closed.

---

## Ranked findings

### F1 — §Snapshot recommends VLB for the one axis VLB fails at. Protobuf, Java, bincode, and BEAM all say the same thing, and the fix is 8 bytes.

**The ecosystems.** Protobuf's entire design is field numbers plus unknown-field
preservation, and it paid for the lesson twice: proto2's `required` was such a durable
mistake that "required considered harmful" became doctrine (a required field can never be
removed, and one missing field fails the whole message), and proto3 *dropped* unknown-field
preservation at launch and had to restore it in 3.5 because intermediary proxies were
silently destroying data they were only meant to forward. Java's `serialVersionUID` is the
opposite failure: a structural hash so eager that adding a method changed it, turning a
harmless edit into `InvalidClassException`. bincode's regret is the plainest one — add a
field and old bytes are *misread*, never rejected, which is why nobody stores bincode.

**And the closest match of all is missing from the survey: Erlang/BEAM.** The doc's use case
(b) — message passing between instances of one language, both ends "the same build" — is
exactly what ETF (External Term Format) was built for, and the BEAM has the *strongest*
same-build claim of any runtime, because a release is one artifact. It still chose a
**self-describing, version-tagged** format (the leading `131` byte). The reason is
instructive and directly transferable: hot code upgrade means two versions of a module
coexist **inside one node**, and distributed nodes routinely differ by a release. The
ecosystem VL's own type direction is modelled on looked at "both ends are the same build"
and did not believe it.

**The plan's exposure, and it is internal rather than hypothetical.** §Snapshot's argument
for application-level `serialize<T>` over a root state type is, verbatim, that byte-level
snapshots "die at every compiler upgrade — **precisely the evolution axis where a serde
encoding survives**". VLB does not survive that axis. It is positional in sorted-name order,
its union arms are indexed by a structural fingerprint sort (OQ-2), and OQ-2's own text
concedes that "adding a member to a union renumbers every member that sorts after it". So:

| edit | VLB effect | detected? |
| --- | --- | --- |
| add a struct field | every field at a later sorted position shifts | **no** — decode reads the next field's bytes as this one's |
| rename a field | sorted order may permute (F8) | **no** |
| add a union arm | every arm after it renumbers | **no** |
| change `i32` → `i64` | width changes | **no** — the reader consumes 4 bytes where 8 were written |

A byte-level snapshot at least dies *loudly* — the module hash does not match. VLB, as
specified, dies silently. The doc recommended the serde encoding over the byte image on an
evolution argument, and then designed an encoding that is **worse on that axis than the thing
it replaced.**

**"Rolling deploys" is not a hypothetical for this repo either.** The webcraft artifact is
"same wasm under Node/workerd" (`docs/webcraft-requirements.md`), which supports same-build
for server↔server. It does not support a browser tab open for three hours against a server
that redeployed, and it does not support a persisted queue, a saved replay, or a file. The
moment a VLB byte string outlives the process that wrote it — which is what §Snapshot is
*for* — same-build is false.

**Remedy, and it is cheap because the machinery is already being built.** Put a **shape
fingerprint in the VLB header.** OQ-2 already commits to computing a recursive structural
fingerprint per type in order to sort union arms; hash the root shape's fingerprint into
4–8 header bytes beside the magic and format version, and have decode compare and refuse
loudly on mismatch. Cost: 8 bytes on the wire, one compare, and zero new machinery. Benefit:
every row of the table above becomes a named refusal instead of a wrong value. That is
bincode-plus-a-header, which is the format everyone wishes bincode had been.

Two constraints from the regrets, both important:
- **Compute it over wire-relevant structure ONLY** — sorted field names, leaf widths, arm
  order, container kinds. Nothing else. Java's `serialVersionUID` is the cautionary tale:
  its default computation included non-wire information, so irrelevant edits broke wire
  compatibility and everyone learned to pin it by hand, which defeated the point.
- **A format-version byte is not a substitute.** MessagePack's 2013 `raw` → `str`/`bin`
  split is the counterexample: the framing was unchanged and the *data model* moved, so
  version negotiation dragged on for years. The fingerprint is about the shape, not the
  format.

**Verdict: FIX.** One header field, one paragraph in §Approach 2's evolution list, and
§Snapshot's sentence about surviving compiler upgrades becomes true instead of aspirational.

---

### F2 — The unknown-field policy is in no OQ, and it is not an independent knob: it DECIDES the untagged ambiguity predicate.

**The ecosystem.** This is the single most documented serialization regret in any language.
Go's `encoding/json` v1 silently ignores unknown members, and the v2 effort
(`github.com/go-json-experiment/json`, discussed as golang/go#63397) lists it near the top of
what it exists to fix, adding `RejectUnknownMembers`. Zig went the other way from the start:
`std.json.ParseOptions.ignore_unknown_fields` defaults to **false**, so an unknown field is an
error unless you ask for tolerance. serde defaults to ignore, with `#[serde(deny_unknown_fields)]`
as the opt-in — and famously, `deny_unknown_fields` **does not compose with `untagged` or
`flatten`**, which is precisely the combination the plan has chosen.

**The plan's exposure is that the question is not asked.** Seven open questions, and this is
not one of them. Approach 1 mentions it in passing ("unknown fields by skipping tokens…
until someone writes that too"); stage 3's `fromJson<T>` has no policy at all.

**And it is load-bearing twice, not once.** The obvious half is evolution: for use case (a),
ignore-unknown is how a config file survives a schema addition and reject-unknown is how a
typo gets caught. The half the document misses is that **OQ-7's ambiguity refusal cannot be
computed until this is ruled.** Measured, on a union that runs today:

```vl
type A = { x: i32 }
type B = { x: i32, y: i32 }
type U1 = A | B                       // legal, runs, narrows in BOTH directions
```
`which({x:1, y:2})` → `B` and `which({x:1})` → `A` **(RUN 2026-09-01, probe p9)**.

Now ask whether `fromJson<U1>` is derivable:

| unknown-field policy | is `{"x":1,"y":2}` ambiguous? | the derive must |
| --- | --- | --- |
| **reject** unknown | no — `{x}` and `{x,y}` have distinct key sets | **accept** the union |
| **ignore** unknown | **yes** — the payload satisfies `A` too | **refuse** the union |

Same VL type, opposite answers, decided by a policy the document has not written down. A
refusal predicate whose domain depends on an unruled knob is not a design, it is a
placeholder.

**Remedy.** Rule it, and rule its three siblings in the same paragraph, because they are the
same regret wearing four sentences and every one of them is a named Go v1 mistake:

1. **Unknown fields: REJECT by default.** Matches Zig's default, go-json v2's direction, and
   this repo's standing loud-over-silent preference. State that the OQ-7 predicate is
   computed *under* this policy.
2. **Field-name matching: EXACT, case-SENSITIVE.** Go v1's case-insensitive matching is the
   regret most cited in the v2 rationale, and it is worse than an annoyance: two struct
   fields differing only in case become mutually ambiguous, and a wire field can bind to a
   field its author never named. VL's structural field names make the exact rule free.
3. **Duplicate keys: REJECT.** RFC 8259 leaves it unspecified; Go v1 takes the last; I-JSON
   (RFC 7493) forbids them; Zig's `duplicate_field_behavior` defaults to error. This repo's
   determinism culture has exactly one defensible answer here.
4. **`T | null` fields: ALWAYS EMIT `"f": null`, never omit** (see F9).

**Verdict: FIX — and this is the largest single gap in the OQ list.** Four sentences of
ruling, and one of them unblocks OQ-7.

---

### F3 — Untagged decoding needs a rewindable source and a value tree VL cannot build; the refusal must be narrowed to LL(1), and then the decidability problem goes away with it.

**The ecosystem, stated precisely — and this corrects the plan's own reasoning.** serde's
`#[serde(untagged)]` is not implemented as "try each variant against the input". It
**buffers the value into `serde::__private::de::Content`** — an in-memory value tree — and
then replays that buffer against each variant's `Deserialize` impl in declaration order,
taking the first `Ok`. Three consequences follow from the buffering, and the plan inherits
all three without naming any:

- untagged **cannot borrow** from the input (`#[serde(borrow)]` fails), which is why untagged
  enums are the one place serde's zero-copy story stops;
- error messages collapse to "data did not match any variant of untagged enum X", because by
  the time everything has failed there is no single failure to report;
- and **numbers are the worst case**: the buffer stores `Content::U64/I64/F64` and matching an
  integer content against an `f64` variant is a special case, which is where serde's untagged
  number bugs have historically lived.

**The plan's claim that serde "structurally cannot" refuse ambiguity at derive time is right
in conclusion and wrong in reason.** OQ-7 says serde's derive "runs per type without the
closed-world view". It has the closed-world view of its *own* variants — the `#[derive]` on an
enum sees every variant in its token stream. What a procedural macro cannot see is the
**resolved structure of the variants' field types**: it runs before type resolution and has
only syntax, so it knows a variant holds a `Foo` and cannot know what `Foo` *is*. That is the
real asymmetry, and it is a much better argument for VL, because VL's deriver runs on
monomorphized shapes where every leaf is resolved. Worth correcting in place — the current
sentence would not survive a serde maintainer reading it.

**The exposure the plan has not recorded.** VL cannot take serde's road at all: the doc's own
fact 5 measures that the idiomatic JSON value tree is **not emittable** on this compiler —
three separate walls, one of them a compiler trap (D982/D984/D985), with the self-reference
that defines a value tree as the ingredient. So untagged decoding in VL must **backtrack over
the source** instead of buffering a tree. Over a `string` plus an index that is cheap and
correct (reset `pos`). But it means, and the doc says neither:

- **`fromJson` over any union is permanently non-streaming.** You cannot backtrack a socket.
  This is F11's question arriving early, through a door nobody was watching.
- **Worst case is O(arms × value)** re-scan, per union node, recursively.

**Remedy — one rule that fixes the performance, the streaming, AND F4's decidability at
once.** Strengthen OQ-7's refusal from *"arms must be distinguishable"* to:

> **Arms must be distinguishable by the FIRST TOKEN, or — for object-shaped arms — by their
> required key set.**

That is an LL(1) condition. Under it the decoder dispatches once and never backtracks, so the
value tree is never needed, streaming stays open, and the predicate is a cheap syntactic
computation over the arm list rather than the language-intersection problem F4 describes. It
is an over-approximation — a few unions that are theoretically decidable get refused — but it
is an over-approximation **the user can predict and the refusal message can explain**, which
is the property that makes an over-approximation acceptable rather than arbitrary.

**Verdict: FIX (narrow the rule).** The refusal is the plan's best idea in the JSON section;
it just needs to be a *rule* rather than an aspiration.

---

### F4 — "The deriver decides distinguishability statically" is a tree-automaton problem, and the plan's list of ambiguous shapes is missing its two biggest members.

**The claim under attack.** OQ-7: the deriver "sees the whole union at once, at the
monomorphized shape, so it can decide distinguishability as a static property". True in
principle. The cost is understated, and the enumeration of *what is ambiguous* is short by
the two cases that matter most.

**Missing case 1 — an open-ended map arm overlaps EVERY object arm in its union.**
`{[string]: i32}` accepts every JSON object, so any union containing it and any struct is
ambiguous by construction, regardless of field names. Measured, and it runs today:

```vl
type U = { x: i32 } | { [string]: i32 }
const u: U = { x: 1 }
if u is S { print("S") }              // prints S  (RUN 2026-09-01, probe p8)
```
This is not exotic — `{[string]: string} | Config` is what half the world's config schemas
look like. OQ-7's ambiguity discussion names only struct-vs-struct and `{x:i32}` vs
`{x:f64}`; the open-ended map is not in it.

**Missing case 2 — JSON's single number type merges VL's four numeric widths.** `1` matches
`i32`, `i64`, `f32` and `f64`. So the plainest possible numeric union is underivable:

```vl
type N = i32 | f64                    // runs, narrows correctly (RUN 2026-09-01, probe p7)
```
OQ-7 reaches this only obliquely, as a *field* of two struct arms (`{x:i32}` vs `{x:f64}`).
At the top level it is a bare union anyone would write, and the JSON derive must refuse it.

**And once types recurse, the general problem is not pairwise field comparison.** "Do arms A
and B accept a common JSON document?" over recursive types (`Tree` with `kids: Tree[]`, which
works today) is **intersection-emptiness over regular tree languages**. That is decidable —
regular tree languages are closed under intersection and emptiness is decidable — but it is
not the one-line predicate the doc's example implies, and the two obvious approximations fail
in opposite, unacceptable directions:

| approximation | failure |
| --- | --- |
| **under-approximate** (miss some overlaps) | serde's silent-wrong-arm bug, reimported — the exact thing OQ-7 exists to escape |
| **over-approximate** (refuse some fine unions) | a legal, working VL type the compiler will not serve: a **clause-2 violation** by this repo's own goal statement |

**Remedy: F3's LL(1) rule is the principled over-approximation.** It is stated, predictable,
explicable in a refusal message, and it makes the predicate cheap. Ship the rule; do not ship
"the deriver figures out whether these overlap".

**And record the accepted cost honestly**, in the doc, with these three examples: `i32 | f64`,
`{x} | {[string]: V}`, and (F5) `i64 | string` are legal VL types with no JSON rendering.
That is the price of untagged, it is the right price to pay, and a user who hits it should
find the paragraph that says so.

**Verdict: FIX the enumeration; ACCEPT the cost, once it is written down.**

---

### F5 — The i64 policy and the untagged ruling were decided in different sections and collide. Also: JSON does not force the f64 funnel, and the plan has inherited JavaScript's limitation as if it were the spec's.

**Where the plan says what.** "i64 as decimal string" appears three times (the protobuf survey
entry, Approach 1's fidelity list, and §"The JSON bridge rides the same walk"). OQ-7 rules
untagged. Neither section mentions the other. The collisions:

1. **`i64 | string` becomes underivable.** A decimal-string i64 is byte-identical to a string.
   Under F3's rule the derive must refuse the union — correct, and nowhere stated.
2. **It contradicts stage 1's own constituency.** §Approach 1 sells JSON as the format "a hand
   written config file is writable by a human who has never heard of VL" (OQ-7's words). That
   human writes `{"retries": 3}`. If `retries` is an `i64`, the plan's convention demands
   `{"retries": "3"}`, which no human writes and no JSON schema tool expects.
3. **The asymmetry question is unasked.** Does the decoder *also* accept a bare number for an
   i64 destination? Accept, and `encode ∘ decode` is no longer byte-stable — a Postel's-law
   asymmetry, the exact shape that made Go v1's tolerances impossible to remove. Refuse, and
   (2) bites. Either is defensible; not choosing is not.

**And the premise is over-stated.** Fact 7 concludes: *"any format that funnels numbers through
an f64, JSON first among them, is lossy for VL by measurement, not by hypothesis."* The
measurement (2^53+1 prints exactly in VL) is correct; the attribution to JSON is not.
**RFC 8259 §6 places no limit on the number grammar** — it notes that binary64 is what
implementations generally provide and that staying in its range achieves good
interoperability, which is *interoperability advice about implementations*, not a data-model
constraint. I-JSON (RFC 7493 §2.2) is the profile that turns the advice into a rule and its
answer is the one worth copying: numbers outside the exactly-representable integer range
**SHOULD** be sent as strings.

The distinction matters here because **VL's decoder is type-directed and writes its own
lexer**. An integer token destined for an `i64` field can be read exactly, with no f64 in the
path, and then the decimal-string convention — and the `i64 | string` ambiguity it creates —
is unnecessary. The real cost of reading it exactly is *interop with JS consumers*, whose
`JSON.parse` will mangle it. That is a genuine trade-off and a different one from the trade-off
the doc actually argues.

**Measured: today the funnel is real, and it is std's, not JSON's (RUN 2026-09-01, probe p2).**

| input | `parseF64` answers | exact? |
| --- | --- | --- |
| `"9007199254740993"` (2^53+1) | `9007199254740992` | **no** — one ulp lost |
| `"9223372036854775807"` (i64 max) | `9223372036854776000` | **no** |
| the same value as an `i64` literal, via `toString` | `9007199254740993` | yes |

`std:fmt` exports exactly `toString`, `padLeft` and `parseF64` — **there is no `parseI64` or
`parseI32`**. So stage 1's only number path is the funnel, including in the doc's own appendix
sketch, whose `retries` field goes through `num()` → `parseF64` → `as i32`.

**Remedy.**
- Add **`parseI64` / `parseI32`** to stage 0's remainder, beside the still-open `f32 ↔ string`.
  Exact integer parsing is not a Burger–Dybvig-class problem and is a fraction of the work
  `parseF64` already cost.
- **Rule the number policy in OQ-7's own section**, where the untagged interaction is visible,
  and rule it against **I-JSON (RFC 7493)** rather than inventing a policy list. I-JSON already
  says what this document is separately deciding about numbers, duplicate keys and string
  validity; claiming a profile is cheaper than maintaining a list, and it gives a non-VL
  consumer something to point at.

**Verdict: FIX.** Two std functions and one paragraph, in the right section.

---

### F6 — Decoding untrusted data into a `{[string]: V}` inserts attacker-chosen keys into an unseeded FNV-1a open-addressing table. Here, uniquely, the mitigation is free.

**The ecosystem.** Hash-collision DoS is the most-repeated serialization security regret there
is: the 2011 wave took PHP, Java, Ruby, Python, ASP.NET and Node in one disclosure; Python
answered with `PYTHONHASHSEED` (and made it default-on), Rust's `HashMap` ships `RandomState`
specifically for this, and Haskell's **aeson** had to move off `HashMap Text Value` after
exactly this attack through JSON decoding. In every one of those languages the fix cost
something — a randomized seed makes iteration order vary run to run, which broke tests and
golden files everywhere.

**The plan's exposure.** §Approach 2's security paragraph is otherwise excellent: length
prefixes validated before allocation, depth caps, strict UTF-8, trailing bytes rejected,
errors as values. Hash-collision DoS on map decode is not in it, and both of VL's map key
types are exposed. In-tree, measured by reading the emitter:

- **string keys**: FNV-1a, offset basis `2166136261` (`compiler/emit_sections.vl`,
  `emitStrHashFnCode`) — **unseeded**, and FNV-1a is one of the easiest hashes to build
  multicollisions for, because its state update is invertible.
- **i32 keys**: the murmur3 32-bit finalizer (`compiler/emit_bytes.vl`, `fbI32HashMix`) —
  unseeded, and chosen precisely because *accidental* clustering was already a measured
  problem.
- **the table**: open addressing, whose own comment in `emit_bytes.vl` says a clustered table
  "degrades to a linear scan".

So `fromJson<{[string]: V}>` or `deserialize` over a hostile message is quadratic on demand.

**And here is why this is worth more than a routine security note: VL is the one language in
the list where the mitigation costs nothing.** Every other ecosystem had to trade iteration-order
stability for seed randomness. **VL map iteration is INSERTION order** — measured in
serde-design.md's own fact list, fixture-pinned for `Set`, and named by
`docs/webcraft-requirements.md` as "explicitly designed for replay". The hash decides only the
probe index. It is **not observable**. A per-instance seed therefore costs zero determinism,
zero replay fidelity, zero golden-file churn, and zero change to VLB's byte output.

**Remedy.** Before a decoder that builds maps from untrusted keys ships, choose one:
(a) seed the map hash per instance — free, as argued; or (b) if a seed is unwanted for some
reason not visible here, cap decoded map size and document the exposure. What is not
acceptable is shipping stage 2's decoder with this unlisted, since the whole security
paragraph's posture is that the standard answers are "generated *once* into every decoder
rather than re-decided per type".

**Verdict: FIX, and it is the cheapest fix in this document.**

---

### F7 — Field names are the wire schema and nothing can pin them: Swift's `CodingKeys` regret without Swift's escape hatch.

**The ecosystem.** Every derive-based serializer eventually grows a rename knob, and each one
grew it because a refactor silently broke a wire. Swift synthesizes a `CodingKeys` enum so a
property rename can be decoupled from the wire name — and its absence is the reason
`.convertFromSnakeCase` exists as a whole-decoder strategy, itself a well-known lossy hack
(it is not injective, so round-tripping key names is not guaranteed). Kotlin has
`@SerialName`. serde has `#[serde(rename)]` and `rename_all`. **And most tellingly, Roc — the
twin that made VL's exact bet, structural records with no nominal identity — added a
`fieldNameMapping` option to its JSON package** rather than holding the line that structural
field names are the wire names.

**The plan's exposure.** OQ-1 rejects a type-level marker, and rejects it *correctly*: a
marker is nominal, VL types are structural, and `Move` and `{player, at, note}` are the same
type — the doc calls it a category error and it is one. But the consequence is that VL has no
annotation surface at all, so:

- a JSON key is the field name, unchangeably;
- and because **VLB is positional in sorted-name order**, a rename can silently *permute the
  entire record*. Rename `code` → `status` in `{code: i32, msg: string}` and the sorted order
  goes from `(code, msg)` to `(msg, status)`: every field's wire position moves, from an edit
  no reviewer would flag as a wire change.

**Remedy — and it is F1's, which is the point.** A language that has decided against
annotations *cannot prevent* this break; what it can do is make it **loud**. The header shape
fingerprint changes on any rename, so decode refuses instead of misreading. That is the honest
answer and it costs nothing extra once F1 lands.

If a name-mapping need ever appears (and Roc's experience says it will, for foreign wires),
the only place a structural language can put it is **the call, not the type** —
`toJson(v, .snakeCase)`-shaped — and it should be filed as deferred-until-a-customer rather
than designed now. Note this is *also* the argument for keeping combinators permanently
(F10): a hand-written codec is the only place VL can express "this field is spelled
differently on the wire" at all.

**Verdict: ACCEPTED COST, conditional on F1.** Without the fingerprint it is an unrecorded
silent-break; with it, it is a loud refusal and a documented limitation.

---

### F8 — The format seam is closed-world: no third-party format can ever exist. That is defensible and it is not ruled.

**The ecosystem.** serde's value is not its speed, it is that **~40 formats were written by
people who never touched serde** — the `Serializer`/`Deserializer` traits are the product.
Roc keeps the same plurality with the format as a *value* (`Encode.toBytes val Json.utf8`,
where the format implements `EncoderFormatting`), paying with ability dispatch. Kotlin keeps
it with the derive emitting **data** — a `SerialDescriptor` that formats consume at runtime —
which is exactly why one `@Serializable` annotation serves JSON, CBOR and protobuf.

**The plan's exposure.** `serialize`/`deserialize`/`toJson`/`fromJson` are compiler-recognized
std symbols with emitter-side renderings (OQ-1(b)). CBOR, protobuf, a user's own framing, a
test-only format: **all of them are compiler work, forever.** §Recommendation's deferred list
already contains "CBOR rendering", filed as if it were a library-sized item; under this seam
it is an emitter track.

**The verdict is accept — the doc's own justification is sound** (VL has no trait, and a
runtime seam means real indirect calls, which is the cost serde's architecture exists to
avoid). But it should be recorded as a **ruling** — "formats are closed-world; a new format is
a compiler change" — because it is a permanent architectural commitment currently implied by an
implementation choice. And the doc should note the escape hatch it already half-describes:
§Print says "the derive's walk is an event stream, the plain string builder is one consumer,
the colorizing TTY sink is another". If that event stream is ever exposed as a
user-implementable sink (a record of function values), formats become a library concern at a
measurable price. **Reserve it; do not build it.** Kotlin's `SerialDescriptor` is the cheaper
variant of the same idea and the doc already names it as the deferred schema-artifact.

**Verdict: ACCEPTED COST — but write the ruling down.**

---

### F9 — Per-shape monomorphization has no size budget and no erasure story, on a target where binary size is a shipped cost.

**The ecosystem.** serde's derive is one of the largest single contributors to Rust build times
— enough that in 2023 `serde_derive` shipped a **precompiled binary blob** to cut them, which
triggered one of the loudest backlashes in the ecosystem's history and was reverted within a
release or two. `erased-serde` exists for exactly the failure mode the plan reproduces:
monomorphizing format × type explodes code size, so you re-introduce dynamic dispatch to stop
it. Embedded and `postcard` users hit the size wall routinely; Kotlin's equivalent complaint is
method count on Android.

**The plan's exposure.** The doc contains the phrase "code size" exactly once — as a cost of
*serde's* architecture — and never prices it for VL. VLB + JSON × encode/decode is up to
**four generated functions per distinct reachable shape**, and shapes are transitive (a
`Move` drags `{x,y}` and `string | null` in with it). Memoization per shape is committed to
and is the right call; growth is still linear in shapes and VL has **no erasure escape hatch
at all**, because it has no traits. Meanwhile the webcraft artifact ships to browsers and this
repo already treats **+5.3% wasm as a tax worth a CLI flag** (`--names`,
`docs/webcraft-requirements.md`).

**Remedy — small, and it is a gate, not a design change.** Stage 2's fixture set should carry a
**size row**: a fixture with N distinct reachable shapes whose emitted wasm byte count is
pinned, so the growth curve is visible while it is still a curve. Erasure is genuinely closed
off and that is an accepted cost; growth that nobody is measuring is not.

**Verdict: ACCEPT the architecture, FIX the instrumentation.**

---

### F10 — Elm and Gleam, steelmanned: combinators are not scaffolding, and the doc's "there is no third road" is measurably too strong.

**The ecosystems.** Elm refuses derive on principle: `Json.Decode` combinators make the wire a
*written-down contract*, so a refactor cannot silently move it, and the boundary between "the
world's data" and "my types" is explicit code. Gleam refuses derive for a stronger reason —
the language has **no metaprogramming at all, by design** — and hand-writes both directions.
Both have the same documented regret, and it is one to learn from rather than repeat: the
**arity family**. Elm has `map2 … map8` and then you are into `andThen` chains or
`Json.Decode.Pipeline`; Gleam shipped `dynamic.decode1 … decode9` and deprecated the whole
family in 2024 for a `use`-based `gleam/dynamic/decode`. *If VL ships combinators, do not ship
`object2..object9`.*

Elm's other honest lesson, usually omitted by people citing it: the community's answer to
scale was **code generation** (elm-graphql and friends). "Explicit decoders" never meant
"typed by hand" — it meant a derive living outside the compiler, which is strictly worse than
one inside it.

**The steelman for keeping combinators as the PERMANENT primary API for use case (a):**

- a decoder is a **value**, so versioning is ordinary code — `oneOf [decodeV2, decodeV1]` —
  rather than a union that F3/F4's ambiguity refusal may reject. The plan's own migration
  answer (§Approach 2, evolution (iii): "`deserialize<ConfigV1 | ConfigV2>` is a legal call")
  is precisely the shape most at risk of being refused, since two versions of a config differ
  by an added field: **the plan's recommended migration mechanism and its recommended
  ambiguity rule are in direct conflict, and neither section mentions the other.**
- it is the only place VL can express a wire name that differs from a field name (F7);
- it can be **chosen at run time**, which a monomorphized derive can never be;
- it costs no per-shape code growth (F9) and no new refusal class (F4).

**Why the derive still wins for VL — the honest verdict.** (i) The forcing customer is use case
(b), on the concurrency model's critical path, where the type *is* the schema and a hand
decoder is pure overhead; (ii) `show<T>` and composite `print` ride the same walk and have no
combinator analogue at all; (iii) Elm's own scaling answer was codegen, so the anti-derive
position does not actually survive contact with large schemas. The plan's sequencing is right.

**What should change is one sentence.** §Recommendation calls stage 1 "scaffolding … scheduled
for partial retirement". It should not be. For hostile, versioned, or foreign JSON — exactly
use case (a)'s hard half — a combinator layer is the *permanent* answer, and the doc already
half-says it ("`std:json`'s lexer/writer remain as the schemaless escape hatch"). Promote that
from a leftover to a deliverable.

**And the doc's fact 1 is too strong, measured.** Its dichotomy — *"Either every type gets
hand-written codec code, or the compiler walks the shape. There is no third road"* — misses
two roads:

1. **Combinators need neither field enumeration nor a bound, and their core WORKS TODAY.**
   ```vl
   function map2<A, B, C>(a: (Lex) => A, b: (Lex) => B, f: (A, B) => C, lx: Lex): C { … }
   ```
   compiles and runs on the current seed, printing `74` **(RUN 2026-09-01, probe p4)**. What is
   *not* expressible is the named alias: `type Dec<T> = (Lex) => T` is refused —
   `unknown type 'T' within '(Lex)=>T' in union 'Dec<T>'` — while the **non-generic**
   `type DecI = (Lex) => i32 | null` runs fine **(RUN 2026-09-01, probes p3/p5)**. So the gap
   between VL and Elm's decoder API is **one small, named, gradeable compiler defect: a type
   parameter does not resolve inside a function type in a generic alias.** That deserves a
   capability probe, and it is a prerequisite worth knowing about before stage 1 designs its
   API around its absence. (The refusal message also calls a function type a "union", which is
   the message-scope family CLAUDE.md tracks.)

2. **Zig gets a serde-class derive with ZERO compiler changes**, because `@typeInfo` is
   comptime reflection available to *library* code: `std.json.parseFromSlice(T, alloc, s, .{})`
   walks `T`'s structure in a library, at compile time. The accurate version of fact 1 is
   therefore narrower and more interesting than "no third road": **VL has no compile-time
   reflection surface for library code**, which is a language-design choice — a defensible one,
   since comptime is an enormous surface — rather than a logical impossibility. Say that.

**Verdict: FIX the fact-1 framing and the stage-1 sentence; ACCEPT the derive.**

---

### F11 — Streaming: choose the seam now, or bolt it on later like everyone else did.

**The ecosystem.** "Streaming was bolted on" is a named item in go-json v2's rationale:
`MarshalJSON`/`UnmarshalJSON` operate on `[]byte`, forcing whole-value buffering and
intermediate allocations, and v2 adds `MarshalerTo`/`UnmarshalerFrom` over
`jsontext.Encoder`/`Decoder`. The v1 `Decoder.Token` API never composed with the value API and
is the standard example of a streaming layer designed second. Zig designed it first
(`json.Reader` over an explicit buffer, `nextAllocMax(alloc, when, max_value_len)`); Roc
designed it first (`DecodeResult` carries `{result, rest}`).

**The plan's exposure.** Every signature is whole-value: `serialize<T>(v): u8[]`,
`deserialize<T>(bytes: u8[])`, `toJson<T>(v): string`. For use case (b) — the forcing customer,
on a hot path — every message allocates a fresh `u8[]`; for a snapshot, the state is
materialized twice. And §Flat types' "one bridge question" (Position A / Position B /
`toFlat<T>`) is **this question wearing an ergonomics costume**: "does the derive ever emit
into a `Buf`" is the streaming/sink question, and it is currently filed as a deferred
ergonomics nicety.

**Remedy — do not build streaming; shape the generated code for it.** The doc already describes
the walk as an event stream with pluggable consumers (§Print). Generate encoders
**sink-parameterized** and decoders **source-parameterized** from day one, even if exactly one
sink and one source ship. Then `serializeInto(v, buf, at)` is later a second *entry point* over
the same generated body rather than a second generated body — which is the difference between
Go v2's rewrite and a two-line addition. It also happens to answer the bridge question by
dissolving it, which the doc's own "third framing" was groping toward.

**Verdict: FIX (cheap now, a rewrite later).**

---

### F12 — Two smaller ones, and one internal tension.

**(a) `T | null` in JSON: emit or omit? Unruled.** Go's `omitempty` is the regret that had to be
split in two (`omitzero` + `omitempty` in v2) because it conflated zero, empty and absent;
Kotlin's `encodeDefaults = false` default omits fields equal to their default, so
`encode ∘ decode` is not the identity unless the defaults line up. **Rule: always emit
`"f": null`, never omit.** It keeps the round trip exact, and it is what makes F2's key-set
distinguishability computable. VL is well placed here — it has a real `null` distinct from
empty, so Go's nil-slice-vs-empty-slice regret cannot arise at all (§Credit) — but the
field-level question is still open.

**(b) The `Set` rendering is not specified, and it was the owner's original complaint.** The
brief that started serde-design.md opens with *"JSON is a bit annoying in that it does not
distinguish arrays from sets."* VLB answers it ("sets encode as what they structurally are —
boolean-valued maps"). **The JSON rendering never says.** A `Set` is `{[T]: boolean}`, so the
naive answer is `{"a": true, "b": true}` — which is what a *structural* rendering gives and is
awful for a human and for a non-VL consumer, both of whom expect `["a","b"]`. And if the answer
is `["a","b"]`, then a set arm and an array arm are indistinguishable in JSON (F4) and a
`{[string]: boolean}` map and a `Set` render identically. Whichever way it goes, **the question
the whole document was commissioned to answer should have an explicit paragraph.** The same
applies to `{[i32]: V}`, whose JSON keys must become strings: `{"1": v}` needs a stated parse
rule for the way back (is `"01"` a key? `"1.0"`? `" 1"`?), and `{[i32]:V}` vs `{[string]:V}`
arms are then mutually ambiguous.

**(c) OQ-3's NaN ruling is in tension with the repo's own flagship consumer.** OQ-3 recommends
bits-verbatim, arguing the engine divergence "is not observed on the engines VL runs on" —
carefully measured, and I do not dispute the measurement.
`docs/webcraft-requirements.md` lists, as a reason the bitcast intrinsics are a hard
requirement, **"NaN canonicalization (the WASM NaN-payload nondeterminism mitigation)"**. Two
documents in this repo currently give opposite advice about the same bits. Both can be right —
VLB wants round-trip fidelity, the sim wants a determinism floor — but a reader will find one
of them and not the other. **One sentence in OQ-3** pointing at webcraft's mitigation and
saying that canonicalization is the *hashing* answer (i.e. OQ-4's `canonicalize<T>` transform,
where CBOR §4.2's profile is the spec to copy) rather than the *encoding* answer would close
it.

**Verdict: three one-paragraph FIXes.**

---

## Where the plan already dodges famous mistakes — credit, specifically

These are not compliments; each names a regret that a shipped serializer actually has and that
this design cannot acquire.

1. **No type names on the wire → the entire deserialization-gadget class is unreachable.** Java
   `ObjectInputStream` (deprecated for removal, JEP 154; the source of a decade of RCEs),
   Python `pickle`, Ruby/Rails YAML. And the same property closes **Erlang's atom-table
   exhaustion** — `binary_to_term/1` on untrusted input creates atoms until the node dies,
   which is why `[safe]` and `Plug.Crypto.non_executable_binary_to_term` exist. The doc names
   the Java/pickle half; the Erlang half comes free from the same property.

2. **A real `null` distinct from empty → Go's nil-vs-empty regret cannot arise.** `[]byte(nil)`
   marshalling to `null` while `[]byte{}` marshals to `""`, and nil maps to `null`, is a v2
   option-bag item (`FormatNilSliceAsNull`, `FormatNilMapAsNull`). VL's `T[] | null` makes it a
   type distinction, so the encoder has nothing to guess.

3. **Structural typing → Swift Codable's #1 regret is impossible.** Codable's real pain is
   retrofit: you cannot conform a type you do not own if any stored property is non-Codable, so
   the ecosystem is full of wrapper types. VL has no conformance to attach — any shape the
   predicate accepts is serializable — so the failure mode does not exist. OQ-1's rejection of a
   type-level marker is what preserves this, and it is the right call for the right reason.

4. **A compiler-native derive version-locked to std → Kotlin's plugin-skew problem is
   structurally impossible.** kotlinx.serialization's plugin must match the Kotlin compiler
   version exactly; VL's std *is* version-locked to the compiler (CLAUDE.md), so the whole
   class evaporates. This is the good half of the coupling that F7 charges for.

5. **Errors as values (`T | DecodeError`), never traps.** Dodges Swift's throwing-decoder
   ergonomics and Java's `InvalidClassException`-at-runtime surprise, and matches Zig's
   error-union discipline. The doc is explicit that decode "never traps", which is the
   correct posture for parsing hostile input.

6. **NaN/Infinity are an encode-time ERROR in JSON, not a silent `null`.** `JSON.stringify(NaN)
   === "null"` is one of the most-cited silent-lossy behaviours in any serializer, and Python's
   `json` goes the other way and emits invalid JSON (`NaN`, `Infinity`) by default. Refusing is
   the only defensible third answer and the doc takes it.

7. **Float BITS in the binary form, argued from a measured host divergence.** Encoding bits
   rather than text dodges `-0.0` and every tie-break question — and the doc found its own
   host's ECMA-262 tie-break bug (14 of 50,000 doubles) and pinned it with a test rather than
   assuming parity. That is better evidence-handling than most format specs get.

8. **Insertion-ordered maps encoded in insertion order, explicitly REFUSING borsh's sorting,
   with the right argument.** Sorting would make `encode ∘ decode` non-identity because VL map
   order is observable. Most languages never face this because their maps are unordered; VL
   faced it and got it right, and OQ-4's analysis of why is the strongest passage in the
   document.

9. **The canonical mode is a `canonicalize<T>` TRANSFORM, never an encode flag.** This is
   better than every ecosystem surveyed. serde, Go, Kotlin and Zig all carry option bags whose
   *combinations* are effectively untested, and go-json v2 is currently rediscovering that an
   option is a permanent contract. Making the lossy step visible and attributable at the call
   site is the correct generalization, and the doc reaches it from the std rubric rather than
   from hindsight.

10. **The stage-1 lexer/writer surviving underneath the derive is exactly go-json v2's
    `jsontext` / `json` split** — syntax layer and semantics layer, separately usable — arrived
    at independently, and it is the layering Go had to do a v2 to get.

11. **OQ-5's "one form per format" beats the mode byte, for the reason given.** Two behaviours
    of one format is how you get a document that says "it depends" about schema evolution; two
    named formats with one story each is how you avoid it. The reasoning about the doubled
    fixture matrix being the cost that actually decides is the kind of argument most format
    designs never make.

12. **Refusing closures loudly at compile time.** Java's `NotSerializableException` is the
    runtime version of the same refusal, discovered in production; the doc's framing — that
    this converts "what silently didn't survive the snapshot" into "what the checker made you
    move out of your state type" — is exactly right, and it is the best argument in §Snapshot.

---

## Appendix: what was RUN

All ten probes on the 2026-09-01 seed, via `VL_STD=$PWD/std … vl run <probe> --compiler
build/vl-compiler.wasm`. Programs are complete and inlined so re-running is a paste; a
paraphrased witness is a different program.

```vl
// p1 / p3 / p5 / p10 — CAN VL EXPRESS AN ELM-STYLE `Decoder<T>`?  Four ablation steps.
type Lex = { src: string, pos: i32 }

// (p10) generic alias over a STRUCT — the control, run ISOLATED because p3's whole
// program fails to check on its OTHER line, so p3 alone proves nothing about it:  RUNS
type Box<T> = { v: T }
const b: Box<i32> = { v: 5 }
print(b.v)                                  // 5

// (p3) generic alias over a FUNCTION type — REFUSED AT CHECK:
//   type Dec<T> = (Lex) => T
//   → probes/p3.vl:4:23: unknown type 'T' within '(Lex)=>T' in union 'Dec<T>'
// (p1) same with a null union — same refusal:
//   type Dec<T> = (Lex) => T | null
//   → unknown type 'T' within '(Lex)=>T|null' in union 'Dec<T>'

// (p5) NON-generic alias over a function type + null union — RUNS
type DecI = (Lex) => i32 | null
const digit: DecI = (lx: Lex) => {
  if lx.pos < lx.src.length { const c = lx.src[lx.pos]; lx.pos = lx.pos + 1; c - 48 } else { null }
}
function runI(d: DecI, lx: Lex): i32 | null { d(lx) }
const lx: Lex = { src: "7", pos: 0 }
const r = runI(digit, lx)
if r == null { print("null") } else { print(r) }        // 7
```

```vl
// p4 — THE COMBINATOR CORE RUNS TODAY, with INLINE function types.
// This is the measurement behind F10: combinator decoding needs neither field
// enumeration nor a bound, and it is not blocked — only its named alias is.
type Lex = { src: string, pos: i32 }
function runDec<T>(d: (Lex) => T, lx: Lex): T { d(lx) }
function map2<A, B, C>(a: (Lex) => A, b: (Lex) => B, f: (A, B) => C, lx: Lex): C {
  const x = a(lx)
  const y = b(lx)
  f(x, y)
}
const digit = (lx: Lex) => { const c = lx.src[lx.pos]; lx.pos = lx.pos + 1; c - 48 }
const lx: Lex = { src: "74", pos: 0 }
print(map2(digit, digit, (p: i32, q: i32) => p * 10 + q, lx))    // 74
```

```vl
// p2 — F5: stage 1's ONLY number path is parseF64, and it loses i64.
import { toString, parseF64 } from "std:fmt"
const p = parseF64("9007199254740993")      // 2^53 + 1
if p == null { print("parse failed") } else { print(toString(p)) }   // 9007199254740992
const q = parseF64("9223372036854775807")   // i64 max
if q == null { print("parse failed") } else { print(toString(q)) }   // 9223372036854776000
const i: i64 = 9007199254740993
print(toString(i))                                                   // 9007199254740993
// `std:fmt` exports exactly toString / padLeft / parseF64 — there is no parseI64.
```

```vl
// p6 / p9 — F2: an overlapping-struct union is legal, runs, and narrows BOTH ways.
// Its JSON derivability therefore depends entirely on the unknown-field policy.
type A = { x: i32 }
type B = { x: i32, y: i32 }
type U1 = A | B
function which(u: U1): string { if u is B { return "B" } "A" }
const wide: U1 = { x: 1, y: 2 }
const narrow: U1 = { x: 1 }
print(which(wide))                          // B
print(which(narrow))                        // A
```

```vl
// p7 — F4: JSON's single number type merges VL's widths. This union runs today.
type N = i32 | f64
function kind(v: N): string { if v is i32 { return "i32" } "f64" }
const a: N = 1
const b: N = 1.5
print(kind(a))                              // i32
print(kind(b))                              // f64
```

```vl
// p8 — F4: an open-ended MAP arm accepts every JSON object, so it overlaps
// every struct arm in its union. Runs today.
type S = { x: i32 }
type M = { [string]: i32 }
type U = S | M
const u: U = { x: 1 }
if u is S { print("S") } else { print("M") }    // S
```

**Read from the tree, not run** (F6's hash facts): `compiler/emit_sections.vl`
(`emitStrHashFnCode` — FNV-1a, offset basis `2166136261`, unseeded),
`compiler/emit_bytes.vl` (`fbI32HashMix` — murmur3 32-bit finalizer, unseeded, with the
comment that a clustered open-addressing table "degrades to a linear scan").

**Not run, cited from documents in this repo:** webcraft's NaN-canonicalization requirement
and its "same wasm under Node/workerd" MP-server note (`docs/webcraft-requirements.md`), the
separate-instances messaging ruling (`docs/internals/concurrency-design.md`), and every claim
serde-design.md itself marks `(RUN)`, which was not re-measured here.

**Not run, and not runnable here — external ecosystem claims.** Everything about serde, Go
`encoding/json` and its v2 effort, Swift Codable, kotlinx.serialization, Elm, Gleam, Roc, Zig
`std.json`, protobuf, CBOR, borsh, MessagePack, Erlang ETF, aeson and the 2011 hashDoS wave is
from spec and ecosystem knowledge **without web access**, as of a mid-2026 cutoff. The
load-bearing ones — Go v1's four named regrets, serde's `Content`-buffering untagged
implementation, Zig's `ignore_unknown_fields = false` default, protobuf's unknown-field
restoration in 3.5, and I-JSON's number rule — I am confident in; the version-specific details
(exact option names, exact release numbers) should be re-verified before anything is scheduled
against them, and none of the findings above turns on one.

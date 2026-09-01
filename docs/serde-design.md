# VL serialization design — a survey, three plans, and where snapshot actually belongs

> Status: **SURVEY + PROPOSAL — nothing here is decided or built.** Written 2026-08-31 at
> the owner's ask: *"vl does not have a native serialization/deserialization format. This
> is fine, as I think it requires a think. JSON is a bit annoying in that it does not
> distinguish arrays from sets. It obviously also doesn't match different numeric types,
> chars vs strings vs enums, etc. What do other languages do? Is there a standard? …
> interesting in terms of IO with the host in the future, message passing, or 'pausing' an
> execution environment and restoring (but could always do that at the byte level I
> guess)."*
>
> Every claim about today's compiler marked **(RUN)** was executed against the current
> seed on 2026-08-31; the probe programs are inlined in the appendix so re-running them is
> a paste, not a paraphrase. Claims sourced from a design doc cite the doc. Claims about
> external formats are from spec knowledge, written without web access — where a detail is
> uncertain it says so rather than inventing.

---

## The question, split into its three real questions

"A serialization format" is three different asks wearing one name, and they pull in
different directions:

- **(a) Host IO / config / interop** — human-readable pressure, hand-editable files,
  talking to programs that are not VL. Wants text, tolerance, evolution.
- **(b) Message passing between VL instances** — the concurrency model already ruled
  (`docs/internals/concurrency-design.md` §1) puts CPU parallelism on *separate instances
  + message passing*, because **WasmGC references cannot cross threads**. So every
  cross-instance message is bytes or linear memory by construction; serialization is on
  that feature's critical path, not adjacent to it. Wants speed, type fidelity,
  determinism; evolution pressure is low when both ends are the same build.
- **(c) Pausing an execution environment and restoring it** — wants completeness. §Snapshot
  argues this is not a serialization-format question at all for VL, and that "could always
  do that at the byte level" is mostly *false* for a WasmGC language — the one part of VL
  that is byte-snapshottable is the linear-memory `Buffer` tier, and webcraft already
  exploits exactly that, deliberately.

The owner's JSON complaints are correct and measurable against VL's own inventory, so the
survey below grades every format against that inventory rather than in the abstract.

---

## Ground truth: VL's inventory, as measured

What a format must carry. Primitives: `i32`, `i64`, `f32`, `f64`, `boolean`, `string`,
`u8` (storage-only — an element read comes back as an `i32` in 0–255, and a computed
store truncates to the low 8 bits: storing 300 reads back 44 **(RUN)**; an out-of-range
*literal* is a compile error **(RUN)**), plus `void`, `null`, `never`. There is **no char
type** — `'a'` is an `i32` code point (97, comparable with a byte read of `"a"[0]`
**(RUN)**) — and enums are **literal unions** (`"file" | "dir"`). Collections: `T[]`
(growable, insertion-ordered), `u8[]` (packed bytes), maps `{[string]: V}` and
`{[i32]: V}` (both work; `.keys()` yields **insertion order** **(RUN)**), and `Set` —
which *exists today*, spelled `{[T]: boolean}` + `Set()`, with `.add/.has/.delete/
.length/.values()` and fixture-pinned insertion order (`tests/cases/sets/basics.vl`).
Structs are **structural**; unions include literal unions, null niches, and variants,
with three runtime encodings and a global tag registry keyed on the field-name shape
(`docs/guide/unions.md`).

Facts that constrain the design, each verified this session:

1. **There is no shape-generic code in userland.** `function getR<T>(x: T) { return x.r }`
   is a type error **(RUN)** — VL has no bounded polymorphism, no traits, no reflection.
   So a codec that works "for any struct" is not expressible in `std/*.vl`. Either every
   type gets hand-written codec code, or the **compiler** walks the shape. There is no
   third road.
2. **The compiler already walks shapes and generates per-shape machinery.** Union boxing
   (`coerceUnion`), struct-union `==`, shared-field dispatch, the per-shape variant-tag
   registry, per-key-type map hashing — all are emitter-generated per monomorphized shape.
   A derive is one more resident of that neighborhood, not a new kind of thing. (And the
   neighborhood's known defect shape — a per-rep ladder with a missing arm,
   `docs/internals/per-rep-ladder-audit.md` — is the honest risk line for it.)
3. **Structural struct spellings share a canonical field order already.** The emitter
   sorts fields by name per shape (`docs/guide/unions.md` — shared-field reads exist
   *because* "fields are sorted by name per shape"). So a positional encoding keyed on
   sorted-name order is spelling-independent: two aliases of one shape agree on it by
   construction. Structural typing does **not** force field-name-keyed encoding — it
   actually makes positional *safer* than in nominal languages, where declaration order
   varies per alias.
4. **Distinct field lists are unrelated wasm types.** A `{code, msg}` value flowing into a
   `{msg}` parameter is check-valid and codegen-rejected ("drops the field `code` …
   structural width subtyping … not yet supported by codegen") **(RUN)**. A decoder must
   construct values *at* the destination shape; there is no "build wide, pass narrow".
5. **The idiomatic JSON value tree is not emittable today.**
   `type Json = null | boolean | f64 | string | Json[] | {[string]: Json}` *declares* and
   accepts a string assignment, but `is Json[]` is refused as "not a variant" and
   `is string` over the union dies at emit with *"no interned arm representation
   (deferred value-union composition)"* **(RUN)**. Recursive *struct* types work fine
   (a `Tree` with `kids: Tree[]` runs **(RUN)**). A `std:json` v1 therefore cannot be
   value-tree-shaped without rep work; it can be event/token-shaped, or nominal-tree-shaped.
6. **VL cannot render or read a float.** `toString` accepts only `i32 | boolean`
   **(RUN)**; `std:fmt`'s `toStr` adds `i64`. `print(0.1 + 0.2)` gives
   `0.30000000000000004` — shortest-round-trip — but that formatter lives in the **host's
   print sink**, not in VL, and there is no string→number parser anywhere in std. Two
   asymmetries to not rediscover later: the printer emits `1e+40` for large values while
   the lexer cannot read `1e300` back (`undeclared identifier 'e300'`) **(RUN)**, and
   `-0.0` prints as `0` — the sign of zero does not survive today's print path **(RUN)**.
   `NaN` and `Infinity` are reachable values and print as those words **(RUN)**.
7. **i64 is a real 64-bit integer end to end.** `9007199254740993` (2^53 + 1) prints
   exactly **(RUN)** — so any format that funnels numbers through an f64, JSON first among
   them, is lossy for VL by measurement, not by hypothesis.
8. **The linear tier is the other half of the estate.** `std:buffer` (Buf, views,
   mark/release), exported memory, `flat` types with checker-folded layouts, and the
   **ruled** sub-byte widths (`u1`…`u7`, `u8/i8/u16/i16` — ROADMAP: *"a wire format spells
   itself"*, with "a real decoder" named as the forcing customer for generated accessors).
   And webcraft's requirement doc places every byte of authoritative sim state in linear
   memory *specifically* "so that snapshot/rollback/hash are memcpy-class"
   (`docs/webcraft-requirements.md` P0.1). The repo has already voted once on where
   byte-level snapshot lives.

---

## Survey: the formats

**Is there a standard?** No — there is a settled *landscape*. Four stable niches
(human-readable schemaless: JSON; standards-track binary schemaless: CBOR; schema-first
interchange: protobuf; zero-copy: FlatBuffers/Cap'n Proto), plus per-language canonical
binary codecs (borsh, bincode) where determinism matters more than interop. The axis that
actually sorts them is **where the schema lives**: in the bytes (self-describing), in a
separate IDL file, or in the *program's own types*. VL's position — structural types,
monomorphization, no reflection — points hard at the third cell, which is the one JSON
and CBOR don't occupy and borsh does.

**JSON** (RFC 8259). One number type, in practice an f64: VL's `i64` is lossy above 2^53
(measured above), `i32` vs `f64` is not distinguishable on the wire (`1` decodes as
either), `f32` has no width of its own, and `NaN`/`Infinity` — reachable VL values
**(RUN)** — have no spelling at all. No bytes type (`u8[]` needs base64, and VL has no
base64 today), no set (the owner's complaint — and VL *has* sets), object key order
carries no meaning (VL map order is observable), duplicate-key behavior unspecified.
What transfers: ubiquity for use case (a) is unbeatable, and *type-directed* decoding
(the program's type tells the decoder that this array is a set, this string an i64)
recovers most of what the format loses — the lossiness is fatal only when the reader has
no schema, and a VL decoder always has one: the type.

**CBOR** (RFC 8949). The standards-track answer to "typed JSON": distinct integer and
byte-string/text-string major types, 64-bit integers natively, float16/32/64 all
first-class, a tag system (bignums, timestamps; a *set* tag — 258 — exists in the IANA
tag registry, though not in the core RFC), a self-description tag, and — the part worth
stealing — **§4.2 deterministic encoding rules** (shortest forms, definite lengths,
bytewise-sorted map keys) as a *named spec section*, not an implementation accident. What
transfers: if VL ever wants a self-describing binary for foreign interop, CBOR is the one
to emit rather than inventing one; and "determinism is a spec section" is the right
posture regardless of format.

**MessagePack.** JSON's data model plus bytes, 64-bit ints, and f32/f64 distinction, in a
compact pre-standard binary; ext types bolt on application-specific tags. Widely
implemented, weaker spec discipline than CBOR, no set, no evolution story beyond
map-keyed convention. What transfers: essentially nothing CBOR doesn't also offer with an
RFC behind it — if the self-describing-binary niche is wanted, prefer CBOR.

**Protobuf.** The schema lives in a `.proto` file; the wire carries field *numbers*, not
names — compact, and the **evolution story is the whole point**: add fields freely, never
reuse a number, unknown fields are preserved (restored in later proto3 releases after an
early proto3 misstep of dropping them). Costs: an IDL and codegen toolchain beside the
language; no self-description; and deterministic bytes are explicitly *not* guaranteed
across implementations. Two details transfer directly: the canonical **JSON mapping
encodes int64 as a decimal string** — the right answer to VL's i64-in-JSON problem — and
"the wire carries numbers, the schema carries names" is the template for any future
schema-carrying VL mode. The IDL itself does not transfer: VL's types are already a
schema language, and a second one beside it would be exactly the duplicated-functionality
smell `std-api-review.md` exists to catch.

**FlatBuffers / Cap'n Proto.** Zero-copy: the "decode" is generated accessors chasing
offsets inside the buffer; nothing is materialized. Both need an IDL + codegen; both pay
with awkward construction APIs and (FlatBuffers) a verifier pass before trusting foreign
bytes. What transfers to VL is the *layer*, not the format: accessor-reads-over-bytes is
precisely VL's linear tier — `Buffer` + `flat` types with checker-folded offsets — and a
GC-heap value can never alias a byte buffer anyway (a VL struct *is* a WasmGC struct; the
rep layer offers no way to overlay it on bytes). Zero-copy in VL means *staying in the
linear tier*, which the language already supports on purpose (§Approach 3), not a GC
serde feature.

**borsh / bincode.** Schema-implicit: the *type* is the schema, the wire is positional —
little-endian fixed-width scalars, u32 length prefixes, `Option` as a presence byte,
enums as a variant index + payload. borsh (NEAR) is the interesting one because it is
**specified as canonical**: one value, one byte string — map entries ordered by key, and
(as I recall the spec, stated with that hedge) NaN payloads refused outright to keep
hashing sound. bincode is the same idea as a Rust-only convenience, config-dependent and
unspecified across languages. Neither has any evolution story: add a field and old bytes
are garbage. What transfers: **this is the natural wire for a monomorphizing language
with structural types** — VL's derive can emit exactly this class of format with zero
bytes of wire schema — and borsh's "canonical or refuse" posture matches this repo's
determinism culture. The missing evolution story is real and is priced in §Approach 2.

**Amazon Ion.** JSON superset with typed nulls, arbitrary-precision ints/decimals,
timestamps, symbols, annotations, blobs, and — the distinctive part — dual text/binary
forms of one data model, with symbol tables amortizing repeated field names in binary.
What transfers: the *dual-form* idea (one model, a text rendering for humans and a binary
one for machines) is the right target shape for VL's derive — same shape walk, two
renderings — even though Ion itself (decimals, timestamps, symbol tables) is far richer
than VL's inventory wants.

## Survey: the language-side architectures

**Rust serde.** Two traits (`Serialize`/`Deserialize`) meet a fixed ~29-slot abstract
data model; formats implement `Serializer`/`Deserializer`; `#[derive]` generates
visitor-based code per type, and **monomorphization fuses type × format into straight-line
code with zero runtime metadata** — the fastest architecture in this survey, paying in
compile time and code size. The mapping onto VL is close but not exact: VL monomorphizes
per call shape already (`docs/internals/monomorphization-design.md`), so the *fusion* is
free — but serde's middle layer is a *trait*, and VL has none. The format-agnostic seam
in VL must be either a record of function values (real indirect calls at runtime — the
cost serde exists to avoid) or a **compiler-chosen seam**: one shape walk in the emitter
with N renderings selected at compile time. §Approach 2 takes the second.

**Swift Codable.** Protocols + compiler synthesis (since Swift 4): keyed/unkeyed/
single-value *containers* abstract the format; the synthesized `CodingKeys` enum is a
per-type field-name schema; errors are thrown. Ergonomics are the best in class —
`struct S: Codable` and done — performance is not (protocol witnesses, runtime
containers), and customization falls off a cliff (hand-implement everything). What
transfers: the *zero-annotation default* — in VL the derive should need no per-field
ceremony at all, because structural types leave nothing to annotate.

**Kotlin serialization.** A compiler plugin generates a `KSerializer` per `@Serializable`
class *plus a `SerialDescriptor`* — a runtime-introspectable schema object that formats
consume. The distinctive move: the derive emits **data about the type**, not just code,
which is what lets one generated artifact serve JSON, CBOR and protobuf. What transfers:
if VL ever wants a self-describing or schema-carrying mode, the derive emitting a schema
*value* (a VL constant) is the mechanism — cheaper and more honest than runtime
reflection, and exactly the checker-folded-constant pattern `flat` layouts already use.

**Go.** `encoding/json` is runtime reflection + struct tags — the anti-model for VL
(reflection doesn't exist here, and tags are a stringly schema bolted onto the type
system's side). `gob` has one idea worth keeping: a **self-describing stream** transmits
each type's wire description once per connection — a schema *handshake* — which is the
cheap insurance for use case (b) the day two VL builds talk to each other
(§Approach 2, evolution).

**Synthesis.** Everywhere the type system is strong, the winning move is the same:
**derive codecs from the types at compile time**; runtime reflection appears only where
the type system is too weak to carry the schema (Go, Java). VL is at the strong extreme —
monomorphized, structural, reflection-free, no bounded generics in userland — so the
derive is not merely natural for VL, it is the *only* mechanism that can produce
shape-generic codecs at all (fact 1 above). The open choices are the wire format(s) and
where the format-agnostic seam sits, not the mechanism.

---

## The design space, cut three ways

Three concrete approaches. They are not mutually exclusive — the recommendation
(§Recommendation) sequences all three — but each is judged standalone first.

### Approach 1 — `std:json`: hand-written codecs, no compiler change

**Mechanism.** A `std:json` module in ordinary VL: an escaping writer over a `u8[]`
builder (the `fromCodePoints`-once idiom — per-append string concat is measured quadratic,
`docs/guide/strings-design.md` §Mutability), and a **pull lexer** handing typed tokens
(`nextString()`, `nextNumber()`, `expect('{')` …) rather than a parsed value tree —
because the idiomatic `Json` union tree is not emittable today (fact 5, **(RUN)**).
Per-type codecs are then hand-written free functions:
`circleToJson(c: Circle): string`, `circleFromJson(lex: JsonLexer): Circle | JsonError`.
Errors follow `std:fs`'s ruled shape — `T | JsonError` with a
`{ at: i32, msg: string }`-class struct — and the module becomes the second measurement
of the `as`-propagation boilerplate, the way `std:fs` was the first.

**Type fidelity.** Only as good as the hand code, and the format caps it: `i64` must go
as a decimal string by convention (protobuf's JSON mapping), `f32` needs
shortest-for-f32 rendering (`0.1` — note the f64-shortest rendering of a widened f32 is
the unreadable `0.10000000149011612` **(RUN)**), `NaN`/`Infinity` must be an encode-time
*error* (a silent `null` is the quiet lie this repo rejects elsewhere), `u8[]` needs
base64 (not in std today), sets and i32-keyed maps round-trip only because the
hand-written decoder knows the target type. Closures: unspellable in hand code anyway —
refusal by omission.

**Prerequisites, measured missing.** `f64`/`f32` ↔ string — the *only* hard part of this
whole approach. VL cannot render or parse a float (fact 6); the shortest-round-trip
formatter (Ryu/Grisu class) and a correctly-rounded parser are real algorithms, a few
hundred lines each done in pure VL over `i64` arithmetic — or one pair of floor
intrinsics leaning on the host, which Track J (kill Deno / host-minimalism) argues
against growing. Also missing: `std:base64` (trivial), and scientific-notation float
literals in the *lexer* if VL's own printer output is ever to be re-parseable (fact 6's
asymmetry — worth fixing independently of serde).

**Fit.** (a) host IO/config: good — this is the approach's whole constituency. (b)
message passing: poor — slow, text, and every message type hand-coded twice. (c)
pause/restore: no.

**Evolution.** Manual and therefore flexible: a hand decoder tolerates missing fields via
`T | null` and unknown fields by skipping tokens. **Determinism:** achievable (VL maps
iterate in insertion order, so even map encoding is reproducible) but not a property
anyone enforces — it lives in each hand codec. **Security:** hand-written decoders are
the classic bug surface; the lexer can centralize depth limits, length caps, strict UTF-8
(`std:utf8`'s strict default), and duplicate-key rejection, but every per-type decoder
re-decides what to do with absence and excess.

**Honest summary.** Cheap to start, unbounded to live with — the per-type tax is paid
forever, by hand, per format. Its real value is (i) config files *now*, and (ii) being
the measurement instrument that tells the derive what boilerplate to delete —
the same role `std:fs` played for `as`.

### Approach 2 — compiler-derived codecs per monomorphized shape (the deriving-Show cousin)

The interesting one, and the one VL's architecture is quietly optimized for.

**Mechanism.** A builtin pair — spelling open, sketched as
`serialize<T>(v: T): u8[]` / `deserialize<T>(bytes: u8[]): T | DecodeError` (and later
`toJson<T>` / `fromJson<T>`) — where the **checker** validates `T` against a closed
serializability predicate and the **emitter** generates one encoder and one decoder
function per distinct shape reachable from `T`, memoized in a registry keyed the way
variant tags already are (field-name-aware `structSig`). Recursion in the type
(`Tree` **(RUN)**) becomes recursion in the generated functions. No runtime metadata, no
reflection, no wire schema: the monomorphized type *is* the schema, serde's fusion
without serde's trait layer. Generated code is ordinary emitted VL-level code over the
existing floor (`u8[]`, `array.copy`); no new intrinsics are required for the binary
form.

**The wire (working name VLB), borsh-class and canonical by construction:**

- Scalars little-endian fixed width: `i32`/`f32` 4 bytes, `i64`/`f64` 8, `boolean` and
  `u8` 1. Floats are **bit patterns verbatim** — `-0.0`, NaN payloads and all — so the
  round trip is exact even where today's print path is not (fact 6). (Whether *computed*
  NaNs should be canonicalized at encode for cross-run determinism is OQ-3.)
- `string`: u32 byte length + UTF-8 bytes. VL strings *are* UTF-8 views
  (`docs/guide/strings-design.md`), so encode is one bulk copy — zero transcode.
- `T[]` and `u8[]`: u32 count + elements / raw bytes.
- Structs: fields **positional, in sorted-name order** — well-defined across spellings
  because the emitter already sorts fields by name per shape (fact 3). No field names on
  the wire.
- Maps: u32 count + key/value pairs **in insertion order**. Deliberately *not* sorted, and
  this is a considered deviation from borsh: VL map order is *observable* (`.keys()`
  **(RUN)**), so order is part of the value, and sorting would make the round trip lossy
  — decode would hand back a map that iterates differently than the one encoded.
  Determinism is not sacrificed: the encoding is a pure function of the value, order
  included. Sets encode as what they structurally are — boolean-valued maps — which
  round-trips membership *and* insertion order. (A `canonical` sorted mode for
  content-addressing across differently-built equal maps is OQ-4, deferred until a
  consumer names it.)
- `T | null`: presence byte + payload (the runtime niche is a rep concern, not a wire
  concern). General unions: a u8 arm index + payload, indexed by the **declared member
  list of `T` at the call site** in a canonically-ordered form — *not* the runtime global
  tag registry, whose interning order is a per-build accident. The ordering rule needs
  care (canon is spelling-dependent — the destringify program's standing warning) and is
  OQ-2.
- Literal unions: **the literal value itself** (string bytes / the number), not a member
  index. An index is smaller, but a value survives member insertion and reordering, and
  matches the owner's unions-over-enums posture: `"file" | "dir"` means those strings,
  not 0 and 1. (Compactness returns for free if A16's enum rep ever lands, and a
  schema-carrying mode may index later; OQ-5.)
- **Refusals, loud and named (clause-2-honest):** closures/function types (a captured
  environment and code identity mean nothing outside the instance), `void`/`never`.
  A structural wrinkle to rule on: `Buf` is a *plain* structural alias `{base, length}`,
  indistinguishable from innocent data, so linear-memory *addresses* serialize as the
  meaningless integers they are — the derive cannot refuse them by shape. Newtypes (`new`)
  are visible to the checker though erased before emit; a derive could refuse un-opted-in
  newtypes (they usually brand *provenance*, which does not survive a trip — `F32Base`) —
  OQ-6.

**Type fidelity: exact, by construction.** Every width preserved, `i64` full-range, f32 ≠
f64, bytes ≠ text, sets ≠ arrays (as map-vs-array on the wire, and as the *type* on
decode), i32 keys ≠ string keys (the static key type selects the wire form) — the
owner's entire JSON complaint list, closed at once, because the schema is the type and
the type is not lossy about itself.

**Evolution.** Schema-implicit formats have none, and pretending otherwise is how bincode
bites people: add a field and old bytes are misread, not rejected. Priced honestly:
(i) v1 targets use case (b), where both ends are the same build and evolution pressure is
~zero; (ii) a 4-byte header (magic + format version) makes *format* changes loud;
(iii) *data* versioning is the user's union — `deserialize<ConfigV1 | ConfigV2>` is a
legal call and the arm index is the version tag, which makes migration an ordinary
`match` rather than a framework; (iv) a gob-style schema handshake (send the shape
description once per connection) is the eventual cross-build answer and needs the derive
to also emit a shape *description* — the Kotlin `SerialDescriptor` move, deferred.

**Determinism: yes, as a stated goal.** One value, one byte string — no reflection
ordering, insertion-order maps, fixed widths. This repo's culture (byte-identical
fixpoints, `cmp`-graded A/Bs, webcraft's byte-comparable TS twin) will use a canonical
encoding the day it exists; CBOR's lesson is to make it a spec section, and here it is
the *only* mode rather than an optional one.

**Security.** Decoding untrusted bytes is memory-safe by construction — no type names on
the wire, no gadget instantiation (the Java/pickle failure class is unreachable: decode
builds only the statically-requested type), every array access bounds-checked or
trapping. The remaining risks are resource-exhaustion and they get the standard answers,
generated *once* into every decoder rather than re-decided per type: a length prefix is
validated against remaining input before allocation (a u32 count is a claim, not a
budget), recursion depth capped (a wasm stack overflow is a trap — loud, but a DoS),
strings strict-UTF-8 via `std:utf8`, trailing bytes rejected, and errors as
`T | DecodeError` values (`error-handling-design.md`), never traps.

**Fit.** (b) message passing: exactly right — fast, exact, deterministic, same-build.
(a) host IO: as the *engine* under a JSON rendering (below), not as bytes humans edit.
(c) pause/restore: the honest 80% — see §Snapshot.

**The JSON bridge rides the same walk.** `toJson<T>`/`fromJson<T>` are a second rendering
of the same emitter shape-walk — the Ion lesson (one model, text and binary duals) and
the serde lesson (formats behind one seam), with the seam at compile time where VL can
afford it. Policy per the fidelity table in Approach 1: i64 as decimal string, f32
shortest-for-f32, NaN/Inf an encode error, `u8[]` base64, unions index-or-kind-tagged
(structural types have no *names* to tag with — serde's externally-tagged form needs an
identity VL structs don't have; OQ-7 picks between an arm-index wrapper and a
discriminant-field convention). This is what retires Approach 1's per-type hand code.

**Cost, sized honestly.** Checker: the serializability predicate + diagnostics — small,
`match`-exhaustiveness-class work. Emitter: the shape walk × two directions × two
renderings, landing in the same per-rep-ladder territory as `print`/union-`==` — the
known risk is a missing arm per rep family, and the mitigation is the one already
institutionalized: one shared walk (never per-format copies of the type dispatch), a
corpus fixture per rep family (niche, value-tagged, boxed, litunion, u8[], i32/string
maps, recursive), and the distilled-corpus gate. This is a mid-size compiler track on
the order of the litunion or map-narrowing efforts — weeks of agent time, not days — and
it is *deferrable per rendering* (binary first, JSON second).

### Approach 3 — the linear-tier lane: foreign formats and zero-copy stay on `Buffer`

Not a std codec at all, but the answer to two asks that keep being filed under "serde"
and belong elsewhere:

- **Foreign binary formats** (a PNG header, a network protocol, protobuf-if-ever): the
  ruled `flat`-type machinery is VL's IDL for *other people's* wire formats — declare the
  layout, the checker folds offsets/shifts/masks, the codec is explicit VL over
  `std:buffer`, and ROADMAP already names "a real decoder" as the forcing customer for
  generated accessors. Protobuf interop, if a consumer ever demands it, is a *library*
  built this way — not a std commitment, and not a reason to grow a VL IDL.
- **Zero-copy**: a WasmGC value cannot alias bytes (fact 8), so FlatBuffers-style
  zero-copy in VL *is* the linear tier: keep the data in a `Buf`, read through
  views/`flat` accessors, never materialize. Webcraft already lives there for exactly
  this reason. The design consequence for std serde is a refusal worth writing down:
  **derived codecs do not promise zero-copy, ever** — encode copies GC values into
  bytes, decode materializes GC values from bytes, and programs for which that copy is
  the bottleneck should hold their data in the tier built for it.

Fit: (a) niche, (b) viable today for Buffer-resident state (the one shape that could even
be *threaded* today, per concurrency-design's carve-out), (c) this **is** the
byte-snapshot lane — next section. Fidelity/evolution/security are whatever the foreign
spec says — that is the point of the lane.

---

## Snapshot: which layer pause/restore belongs at

The owner's "could always do that at the byte level I guess" deserves a precise answer,
because for VL it is mostly *not* true, and the part that is true is already shipped.

**What byte-level snapshot can actually capture today.** The externalizable state of a
wasm instance is linear memory + mutable globals (+ table contents). That is what
Wizer-class pre-initializers snapshot into a new module's data segments, and it works —
*for linear-memory languages*. Engines can **pause** execution (wasmtime's epochs/fuel,
async yields) but offer no API to **externalize** a paused store: no wasmtime
instance-state serialize/restore exists (`Module::serialize` is compiled code, not
state), and none of it reaches the GC heap. (State of the world as known at writing; no
web access to re-verify — treat as an assumption to re-check before scheduling anything
on it.)

**What breaks for VL specifically.** Every VL value is a WasmGC heap object — structs,
arrays, the string headers *and* their backings, the union boxes, the closures. That heap
is engine-owned and not byte-addressable: it does not appear in linear memory, so a
memory snapshot of a VL instance captures the `Buffer` tier and *none of the program's
values*. Even if an engine someday exports a GC-heap image, three things still break,
which is why the brief's list is the right list: **interned/pooled strings** (literal
pool identity is per-instance; `ref.eq` fast paths — fine within one restored image,
meaningless merged across two), **host handles** (nothing in VL holds one today —
`std:fs` is whole-file, handleless, which is a *small honest mercy* of the current
surface — but the moment fds or sockets exist, no byte image can revive them), and
**function references** (table indices and heap-type indices are artifacts of one build:
a snapshot is only replayable into the *byte-identical* module, so byte-level snapshots
die at every compiler upgrade — precisely the evolution axis where a serde encoding
survives). Suspended stacks join the list the day the ruled stack-switching I/O model
lands: a paused fiber is engine-internal state with no externalization story at all.

**The verdict, in one sentence: snapshot belongs *below* the language or *above* it,
never at the serde layer.** Below: engine-level image of linear memory + globals — real
today, and VL already routes the state that wants it into that tier (webcraft's
"snapshot/rollback/hash are memcpy-class" is this, deliberately); a full-instance
GC-inclusive image is an engine feature VL should adopt if it ever ships, not emulate.
Above: **application-level pause** — the program designates a root state type and
`serialize<T>` walks it; closures and other non-values are *loud compile-time refusals*,
which converts "what silently didn't survive the snapshot" (the byte-level failure mode)
into "what the checker made you move out of your state type" (a design pressure, and a
healthy one). That is the honest 80% of "pause and restore": it survives compiler
upgrades, it is inspectable, and its boundary is checked. The dishonest 20% — resuming
mid-computation with live stacks and open handles — should be refused at this layer
explicitly rather than half-promised.

---

## Recommendation, and the staged path

**Recommendation: Approach 2 — compiler-derived codecs per monomorphized shape — is the
destination; a thin Approach 1 ships first as scaffolding and measurement; Approach 3 is
recognized as already-decided policy rather than new work. No VL IDL, no serde-layer
execution snapshot, no zero-copy promises in the GC tier.**

Staged, sized honestly:

- **Stage 0 — prerequisites, std-only, no compiler change.** `f64`/`f32` ↔ string:
  shortest-round-trip formatting and correctly-rounded parsing in pure VL (`std:fmt`
  growth or `std:num`) — the one genuinely hard algorithm in this whole program, needed
  by *every* text story including diagnostics, and missing today (measured). Fix the
  lexer's inability to read scientific notation so VL's own float rendering is
  re-parseable (independent language bug surfaced by this survey). `std:base64` (small).
  Every export here is a `std:*` addition → `std-api-reviewer` per CLAUDE.md.
- **Stage 1 — `std:json` v1, std-only.** Escaping writer + pull lexer + hand codecs for
  the types the repo itself needs (config-file class). Deliberately minimal: it is the
  boilerplate *measurement* for stage 2 (the `std:fs`→`as` playbook) and the day-one
  config answer. Do not gold-plate; it is scheduled for partial retirement.
- **Stage 2 — the derive, binary first.** Checker predicate + emitter shape-walk +
  VLB encode/decode, gated by per-rep-family fixtures and the distilled corpus. Serves
  message passing (b) — sequenced with, or just ahead of, the concurrency model's
  instance work, which is its forcing customer.
- **Stage 3 — the JSON rendering over the same walk.** `toJson<T>`/`fromJson<T>`;
  retire the hand codecs of stage 1 where they overlap; `std:json`'s lexer/writer remain
  as the schemaless escape hatch.
- **Deferred until a consumer names them:** canonical-sorted map mode (content
  addressing), a schema-description artifact + gob-style handshake (cross-build
  messaging), CBOR rendering (foreign self-describing interop), generated `flat`
  accessors (ROADMAP already holds this).

## Cycles (owner ruling, 2026-09-01)

The owner's stance, recorded verbatim in intent: **print/show and serialization should both
handle cyclic values, ideally; serialization additionally wants an unsafe fast variant**
(deserialization could have one too, or the format's own metadata makes it unnecessary).
What that costs, per surface:

- **Can VL even build a cycle?** Yes in principle: struct fields are mutable WasmGC refs,
  so `a.next = a` is expressible the moment a self-referential type is (check the
  recursive-type story before assuming — a `type Node = { next: Node | null }` must
  actually check and emit; that is its own prerequisite and should be MEASURED when
  stage 2 starts). Arrays/maps holding refs can also close a loop. Primitives cannot.
- **The walk carries an identity seen-set.** The derive's shape-walk (stage 2) threads a
  visited set keyed on REFERENCE IDENTITY (`ref.eq`-class, not `==` value equality —
  value equality on a cyclic value is itself a divergence). Cost: one hash-set insert per
  ref-typed node visited, zero for primitive-only shapes — a shape whose transitive
  fields hold no ref cannot cycle, and the emitter knows that statically per
  monomorphized shape, so **acyclic-by-construction shapes skip the bookkeeping at
  compile time and pay nothing**. That static skip is the first-class fast path; the
  unsafe variant below only matters for shapes that are ref-bearing but that the CALLER
  knows are acyclic.
- **`show`/`print` on a cycle: render a back-reference, never hang.** The failure mode
  today's languages split on: naive recursion (stack overflow — pre-ES2015 JSON), refuse
  (`JSON.stringify` TypeError), or render a marker (`[Circular]` — Node's
  `util.inspect`, Python's `...` in reprs). For a DIAGNOSTIC surface the marker is the
  only defensible answer: `show` exists to tell a user what a value is, and a value
  being cyclic is part of that. Proposed rendering: `<cycle →#N>` where `#N` labels the
  N-th ref node in walk order (labels printed only when actually referenced back).
- **VLB (the binary derive format): back-references in the format.** A ref-typed field's
  encoding gains one byte of tag: `0` null / `1` inline value / `2` back-ref, where
  back-ref carries the varint index of the target in ENCODE VISIT ORDER. Decode keeps
  the same table and patches on read — this is how a cyclic value ROUND-TRIPS, which
  "refuse on encode" and "marker on encode" both forfeit. Deserialization needs no
  unsafe variant under this design: the table is O(refs) either way, and a malformed
  back-ref index is a bounds check, not a cycle hazard (decode never walks user-provided
  topology unboundedly — the byte stream is finite and each byte is consumed once).
- **JSON: refuse on cycle, loudly.** JSON has no reference syntax; every convention
  (`$ref`, JSON-LD `@id`) is an application-layer schema that a consumer must also
  speak, which contradicts JSON's job here (interop with things that are not VL). The
  seen-set is already in the walk, so the refusal is free and precise ("cycle through
  field `next` of `Node`"). A consumer needing cyclic JSON is a consumer for VLB or for
  a schema of their own.
- **The unsafe fast variant: `serializeUnchecked<T>` (name per OQ-1's resolution).**
  Skips the seen-set for ref-bearing shapes the caller asserts are acyclic. On a lied-to
  call it diverges (wasm stack exhaustion trap — loud, not silent corruption, worth
  stating in the doc comment). Justified the same way `as` (vs `as?`) is: the checked
  form is the default spelling, the unchecked form is an opt-in with the hazard in its
  name. Measure before shipping it: if the static acyclic-shape skip already covers the
  hot callers (likely — message-passing payloads are usually trees of records), the
  unsafe variant may have no customer, and per std review discipline it then should NOT
  ship. File it as deferred-until-measured rather than building it alongside stage 2.

## Open questions for the owner

- **OQ-1 — surface spelling.** `serialize<T>`/`deserialize<T>` builtins vs a `derive`
  marker on types vs `std:serde`-shimmed intrinsics. Builtins match `fromCodePoints`
  precedent; a marker matches nothing VL has yet.
- **OQ-2 — the canonical union-member ordering** for wire arm indices. Canon rendering
  is spelling-dependent (destringify program's standing finding); the rule must be
  spelling-stable or arm indices silently shift between aliases.
- **OQ-3 — NaN policy in VLB.** Bits-verbatim (exact round trip, but computed-NaN payload
  bits are engine-nondeterministic) vs canonicalize-on-encode (stable bytes, loses
  payloads) vs borsh's refuse. Bits-verbatim is proposed above; hashing consumers may
  want canonicalize.
- **OQ-4 — canonical (sorted-map) mode**: deferred here on the argument that VL map order
  is semantic; a content-addressing consumer would reopen it.
- **OQ-5 — literal-union wire form**: value (proposed — evolution-stable, self-evident)
  vs index (compact). Revisit when A16's enum rep lands.
- **OQ-6 — newtype posture**: encode the underlying value, or refuse `new` types until
  opted in (provenance brands like `F32Base` should not survive a trip)?
- **OQ-7 — JSON's union rendering**: arm-index wrapper vs discriminant-field convention.
  Structural types have no names to tag with; whichever is chosen becomes a compatibility
  surface immediately.

---

## Appendix: what was RUN

Probes executed 2026-08-31 against the current seed via
`vl run <probe> --compiler build/vl-compiler.wasm` (Rust host, wasmtime). Key programs,
inlined so re-running is a paste — a paraphrased witness is a different program:

```vl
// Numerics: i64 exact past 2^53; f32 widens; f64 shortest-round-trip.
const a: i64 = 9007199254740993   // prints 9007199254740993
const b: f32 = 0.1                // prints 0.10000000149011612
print(0.1 + 0.2)                  // prints 0.30000000000000004
// 1e40-magnitude f64 prints "1e+40"; the literal `1e300` fails to LEX
// ("undeclared identifier 'e300'"); -0.0 prints "0"; NaN/Infinity print
// as those words; toString(1.5) is a type error ("expects an i32 or boolean").
```

```vl
// Maps/sets: both key types; insertion order observable; Set is {[T]: boolean}.
const m: { [string]: i32 } = Map()
m["b"] = 2
m["a"] = 1
for k in m.keys() { print(k) }    // b, then a — insertion order
const s: { [string]: boolean } = Set()
s.add("x")
print(s.has("x"))                 // true
const bytes: u8[] = [104, 105]
print(bytes[0])                   // 104 — u8 element reads back as i32
let v = 300
const big: u8[] = [0]
big[0] = v
print(big[0])                     // 44 — computed store truncates to low 8 bits
```

```vl
// No shape-generic userland code: field access on a type parameter is a type error.
function getR<T>(x: T): f64 { return x.r }   // REJECTED at check
```

```vl
// The idiomatic JSON tree declares but is not emittable today.
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
const arr: Json = [1.5, "x"]
if arr is string { print("?") }
// emit error: `is` names a declared union member with no interned arm
// representation (deferred value-union composition)
// (and `is Json[]` is refused earlier, at check: "not a variant")
```

```vl
// Recursive STRUCT shapes work; width subtyping is check-valid, codegen-rejected.
type Tree = { v: i32, kids: Tree[] }
const t: Tree = { v: 1, kids: [{ v: 2, kids: [] }] }
print(t.kids[0].v)                // 2
// {code,msg} into a {msg} param: "drops the field `code` … not yet supported
// by codegen" — decode must construct at the destination shape.
```

```vl
// Char literals are i32 code points; print refuses composites.
const c = 'a'
print(c)                          // 97
const s = "a"
print(c == s[0])                  // true
// print({kind:"circle", r:2.5}) is a type error naming the scalar-only surface.
```

Not run, sourced from docs or knowledge and marked as such in the text: the union rep
encodings and field-name sorting (`docs/guide/unions.md`), string internals
(`docs/guide/strings-design.md`), the concurrency ruling
(`docs/internals/concurrency-design.md`), the `flat`/sub-byte rulings (`ROADMAP.md`),
webcraft's snapshot placement (`docs/webcraft-requirements.md`), all external format and
engine-capability claims (spec knowledge as of writing; the wasmtime/Wizer capability
statements should be re-verified before anything is scheduled against them).

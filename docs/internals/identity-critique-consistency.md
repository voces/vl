# `===` / `IdentityMap` — cross-examination, CONSISTENCY angle

Reviews `docs/identity-design.md` (2026-09-01 proposal) against VL's own rulings, design docs
and measured behaviour. Every **(RUN)** below is a program executed on a seed refreshed from
master's `compiler/*.vl` on **2026-09-01** (`scripts/refresh-compiler.sh` rc 0), disassembled
where the rep is the claim. This angle does not price the feature; see the closing section.

## Verdict — **yes with changes**, and two of them are blocking

The shape is right and lands where VL's own rulings point: `is` is taken by narrowing so the
operator needs its own spelling (`DECISIONS.md:836`); `==` is *not* overloadable, so `===` is
not a second escape hatch but the only user-visible identity there will ever be; and two names
rather than a mode parameter is what the std rubric asks for (`docs/internals/std-api-review.md:64`).
But **P1's central claim — "`a === b` is one `ref.eq`" — is false for two of the reps P1
admits**, and both were already written down in this tree before the proposal was drafted. A
union of struct arms rides a `{tag, payload}` box that is **freshly allocated at every widening
site**, so `ref.eq` on it answers `false` for two references to the same object — and answers
`true` for the same pair inside an `is` guard, where the rep is the bare payload (F1, measured
and disassembled). A function value is a closure struct that is *also* freshly allocated per
binding, and `ROADMAP.md:1007` already records that funcrefs admit no `ref.eq` at all (F2).
Neither is fatal to the design; both are fatal to P1 as written, and P1 is the sentence the
rest of the document leans on. Fix those two, answer the function-field hashing hole in P3
(F3), name the dedup seam P4 takes (F4), and the proposal is consistent with the tree.

---

## F1 — BLOCKING. `===` on a union of struct arms is not one `ref.eq`, and the answer flips inside an `is` guard

**Proposal (P1, §2):** "`a === b` is one `ref.eq` … A union of struct arms is fine." §4 point 7
asks whether the compare hits the box or the payload. Here is the answer from the tree.
`docs/internals/silent-class-inventory.md:24548` (D973): "`A | B` of declared shapes rides the
SAME `{tag, payload}` box a value union does (disassembled)."

**Measured (RUN 2026-09-01).** `type A = {x:i32}; type B = {y:i32}; type U = A | B`, one struct
`a`, two widenings `const u: U = a` and `const v: U = a`. The program prints `9` then `true`:
the write through the narrowed `u` reaches `a`, and `u == v` is structurally true. The
disassembly (`node_modules/.bin/wasm-dis`) shows the box and, decisively, **two allocations of
it around one payload**:

```wasm
(type $2 (struct (field i32) (field anyref)))          ;; the {tag, payload} box
(global.set $global$1 (struct.new $2 (i32.const 0) (global.get $global$0)))
(global.set $global$2 (struct.new $2 (i32.const 0) (global.get $global$0)))
```

Inside `if u is A`, the same value is read as `(ref.cast (ref $0) (struct.get $2 1 …))` — the
**bare payload**.

**Consequence.** Compiled as P1 specifies, `u === v` is `false` for two names of one object.
Worse, it is *position-dependent*: `u === v` outside the guard compares two boxes and answers
`false`; `if u is A && v is A { u === v }` compares two payloads and answers `true`. An identity
operator whose answer depends on whether the reader is inside a narrowing block is worse than no
operator, and it is precisely the failure mode `typecheck.vl:15600`'s header was written to end
("'the checker accepted it' and 'the emitter can lower it' are one sentence rather than two
guesses").

**Recommend.** Either (a) drop multi-arm unions from `===` in v1 — the nullable case is sound
and sufficient: `A | null` is the `nulvariant` niche, a bare `(ref null $0)` with no box at all
(RUN, disassembled), so `===` there *is* one `ref.eq`; or (b) specify `===` on a union as
tag-compare-then-payload-`ref.eq`, drop the "one `ref.eq`" claim, and put the rule in
`eqCmpKindOfTy`'s family (`compiler/typecheck.vl:15638`) so checker and emitter read one answer.

## F2 — BLOCKING. Function values admit no `ref.eq`; the ROADMAP says so, and the closure struct is per-binding

**Proposal:** P1 lists "a function value" among the reference reps; P2 says "`===` on a function
value means what `==` already means there". **The tree** — `ROADMAP.md:1007`, inside A15's own
REMAINING list: *"note the `call_ref`-ABI wrinkle: funcrefs admit no `ref.eq`, so
function-identity compare needs an identity token on the closure struct."*

**Measured (RUN 2026-09-01).** A function value is `(struct (field structref) (field i32))` —
captured env, table index. `const a = f; const b = f; a == b` → `true`, `a == g` → `false`, and
`==` lowers to `i32.and (i32.eq <index>, <index>) (ref.eq <env>, <env>)`. The two bindings each
get their **own** `struct.new`, both `(ref.null none, 4)`. A capturing pair, `mk(1) == mk(1)`,
is **`false`** — env identity is live.

**Consequence.** P1 and P2 contradict each other. `ref.eq` on the closure struct disagrees with
`==` (false where `==` says true); defining `===` as `==`'s composite compare makes it not an
identity operator. And P2's stated motive — generic code spelling "same closure" without knowing
whether `T` is data — then delivers a *different operation per instantiation*, which is the
rep-dependence P1's whole restriction exists to forbid.

**Recommend.** Say which, in the document. Cheapest consistent answer: drop function values from
`===` in v1 (A15 already gives `==` identity there) and note the identity token as the
prerequisite, citing `ROADMAP.md:1007`.

## F3 — HIGH. P3 makes a struct with a FUNCTION field a structural key, and there is no hash for it

**Proposal (P3):** `Map`/`Set` keys over structs are structural; "the structural hash walks the
same shape the serde derive walks — one mechanism, two customers." **The tree:**
`compiler/typecheck.vl:15508` — *"a FUNCTION field compares by reference (same table index +
captured env), so it does NOT make its object non-equatable."* Measured: `type H = { cb: (i32) =>
i32 }` — `{cb:f} == {cb:f}` → `true`, `{cb:f} == {cb:g}` → `false` (RUN). And the proposal's own
§1 records the deciding fact: WasmGC gives `ref.eq` and **no identity hash**.

**Consequence.** For a key type with a function field, `==` is partly identity and the hash
cannot be. Either the hash ignores the env — and `has()` degrades to a linear probe inside the
bucket, exactly what P5 promises will "never" happen silently — or it needs the serial that P4
gives only to *identity*-keyed types. Same hole one field over: a non-discriminated union field
or a map field is refused today with a real message — `H isn't equatable (a field is not
value-comparable) — compare a projection whose components are value-comparable…` (RUN) — but a
function field passes that gate by design.

**Recommend.** P3 must state key eligibility in terms of the existing predicate
(`isEquatable` + `eqCmpKindOfTy`), and must **exclude function-bearing structs from structural
keying by name**, with the reason (no identity hash) in the message. "One mechanism, two
customers" is the claim to drop: serde's walk has no such constraint.

## F4 — HIGH. The serial field takes the dedup opt-out seam DECISIONS reserved for opaque types, and the alias ruling makes it contagious

**Proposal (P4):** a hidden serial field on "exactly the struct types that are identity-keyed
somewhere in the program … zero for every other type." **Three rulings, all `DECISIONS.md`:**
* `:1242` — *"A14 forward-compat: a future nominal/opaque type opts OUT of dedup by injecting its
  nominal identity into `repCanonKey`, giving it a unique key and a private heap type."* That is
  the seam P4 is standing on, unnamed.
* `:806`–`:812` — the emitter's shape dedup keys on a sid-SORTED field list, **"The exception is
  FLAT types, where field order IS the byte layout."**
* `:814`–`:825` — *"A declared alias and its inline spelling are the SAME TYPE … the compiler may
  merge their rows freely."*

**Consequence.** (a) "Those types only" is not a thing the tree can currently express: under
`:814` a `{x:i32}` identity-keyed in one file and an unrelated `{x:i32}` in another are **one
row**, so either both pay the field or the serial splits the dedup — and that split *is* the
opaque-type seam, which deserves to be named rather than arrived at. (b) `flat` is unmentioned
and must be refused: `flat type Px = {x:i32,y:i32}` compiles and compares structurally today
(RUN), and a hidden field injected into it changes the byte layout `flat`'s whole contract
exposes.

**Recommend.** State that P4 takes the `repCanonKey` seam; specify that identity-keying gives the
type a **private heap type** rather than mutating a shared row; refuse `flat` keys by name with a
message citing the layout contract.

## F5 — MEDIUM. P5's reason for excluding arrays is false against today's representation

**Proposal (P5):** "Arrays, maps and function values have nowhere to put a serial (uniform
element type; no user-visible closure struct)." **Measured (RUN 2026-09-01):** `const a: i32[] =
[1,2,3]` lowers to `(struct (field (mut (ref $0))) (field (mut i32)) (field (mut i32)))` — the
`{backing, len, cap}` List rep of `collections-design.md` §VL.1. That wrapper is exactly a place
to put a serial. (Same for a function: F2 shows the closure struct exists, it is just not
user-*visible*.)

**Consequence.** The true justification is §VL.7's *inferred* header-less fixed-array
representation (`collections-design.md:680`) — which is **unbuilt**, has no user-facing forcing
spelling, and whose own section insists the choice is "**invisible to semantics** … visible only
in speed and footprint". `===` would be the first operator whose availability, and potentially
whose answer, is decided by that invisible choice.

**Recommend.** Either write that sentence in P5 in those words, or drop arrays from `===`
alongside identity-keying until §VL.7 is decided. Do not ship an operator that makes an
explicitly-invisible representation choice observable while §VL.7 still claims it is not.

## F6 — MEDIUM. `===` on lists lands the reference half of a question the collections doc deferred

`collections-design.md:660` defers *"Equality/hashing of lists (structural `==` over elements) —
defer until the element-comparison story for the value-eq path is settled."* Half is spent
already: `i32[] == i32[]` and `f64[] == f64[]` both run and answer correctly (RUN; the comment at
`typecheck.vl:15635` still calls the f64 case invalid wasm and is stale). Shipping `===` on lists
gives users a reference answer while structural list *hashing* — the Map-key case — stays
deferred, and reference equality is what they will then reach for. **Recommend** one sentence
saying `===` is not the substitute for it, plus F5's §VL.7 caveat.

## F7 — MEDIUM. A15's own paragraph is half stale, and §5 proposes to edit it

`DECISIONS.md:835` still reads *"A custom `==` overrides. (A15)"*. Measured (RUN 2026-09-01):
`function "=="(self: Circle, other: Circle): boolean { true }` is now a **parse error** — ``  `==`
is not overloadable — every type compares structurally, and a `function "=="` declaration would
be ignored``. Graduated as `tests/cases/objects/error-equality-not-overloadable.vl` from
silent-class row D46.

**Consequence + recommend.** §5 rewrites the very paragraph carrying the stale clause, so fix it
in the same commit. And this *strengthens* the proposal: with `==` non-overloadable there is no
user-level identity today at all, so `===` adds no second channel — it is the only one. Say that
in §3.

## F8 — MEDIUM. Generics: a "reference-only" bound is unspellable; per-instance is the consistent shape

**Proposal (§4.3):** refuse `T === T` at the instantiation, or require a bound at the declaration?

**The tree.** A VL bound is *"a type with method members"* (`typecheck.vl:22265` area), so "has a
reference rep" cannot be written as one; operator bounds are explicitly deferred as OQ-2
(`docs/constraints-design.md:243`). Meanwhile `eqCmpKindOfTy` returns `""` OPAQUE for `TyVar`
(`typecheck.vl:15619`) — VL already lets the **instance** decide `==` and refuses nothing at the
declaration. Measured: `function same<T>(a: T, b: T)` instantiated at a struct, `i32` and
`string` all run (RUN).

**Consequence + recommend.** Per-instance is the only answer available and the one consistent
with `==`. Rule it in §4.3, and copy the diagnostic precedent exactly: `X does not satisfy
\`B\`: …` and ``incoherent bound: `who` instantiated at `tyKey` … `` (`typecheck.vl:22043`) both
name the generic **and** the instantiating type and point at the call site.

## F9 — MEDIUM. `IdentitySet<K>` inherits `Set<T>`'s promises and none of its design

The **two names** choice is right and the rubric backs it: `std-api-review.md:64` ("Boolean
parameters … Prefer two functions or a literal-union parameter") and `:40` (base64's *"when one
arrives it gets its OWN NAME, never a boolean parameter"*). The `Map<K,V,by: identity>`
alternative in §4.5 has no precedent in this tree — VL has no type-level mode parameter anywhere.

But the name is doing work the design has not done. `collections-design.md:868` (C2.2) gives
`Set<T>` a *specific* surface — `add`/`has`/`delete`/`.length`/`.values(): T[]`, ordered,
insertion-order iteration, on the arraylike `Sequence` core — and C2 (`:803`) makes the concrete
collections **subtypes of the index-signature interfaces**. `IdentitySet<K>` named "Set" promises
all of it; the rubric's *"a name that promises more than it delivers"* (`:71`) applies to a type
name too. The subtyping question is load-bearing: if `IdentityMap<K,V> <: {[K]:V}`, a function
written against `{[K]:V}` accepts both and its lookup semantics change silently with the
argument — the exact bug C2 was chosen to kill (`:902`). And `Set<T>` is **unbuilt**: `Set<i32>()`
does not parse and no `std/*.vl` defines it (RUN), so P4 designs the second container before the
first (`std-api-review.md:80`, "anything speculative").

**Recommend.** Answer whether `IdentitySet`/`IdentityMap` subtype the C2 interfaces (recommended:
**no** — off them, the way C2.2 keeps `Set` off `Mapping`), and either list the surface or say it
is `Set`'s entire surface, in which case `Set<T>` is a prerequisite, not a parallel task.

## F10 — LOW. The message fits house style but breaks the local-spelling ruling

Sampled `tErr` sites (`compiler/typecheck.vl`): `` `x` is used before it is assigned ``;
`cannot infer a type for 'x' — add a type annotation`; and the live ``A P-keyed Map isn't
supported yet — `Map`/`Set` keys must be `string` or `i32` `` (RUN). The shape is: backticked
spelling, em-dash cause, imperative remedy. The proposal's ``=== compares identity, and `i32` has
none — use `==` `` fits it.

Two corrections. (a) `DECISIONS.md:814`–`:825` rules that *"a message must render the spelling
the user WROTE at that position"* — so under `type Id = new i32` the message must say `Id`, not
the erased base, and §4.4's newtype answer routes straight through that erasure. Add a fixture
with a newtype operand. (b) P1's `null === null` is **new capability**, not carry-over:
`print(null == null)` is `emitProgram: bare null needs a struct-typed context` today (RUN), which
sits oddly beside the same clause's hint steering `x === null` to `== null`. Pick one.

## F11 — LOW. The serial's wrap is already ruled by the error model, and its observability by the replay rule

§4.2 leaves i32-vs-i64 open because a wrapped counter "would make two live objects hash-collide
silently". Under the ruled error model (`collections-design.md:1134`, *"unrecoverable bugs
trap"*) that is a bug, not a normal state: if the container's in-bucket comparison is `ref.eq`
(serial = hash only) a wrap is a perf event and `i32` is fine; if it is serial equality, `i32`
must **trap** on wrap. Say which — the question is not open, only unanswered. Separately,
`collections-design.md:1460` requires deterministic **insertion-order** iteration for `Map`/`Set`
because VL targets multiplayer/replay; that saves the serial here only while the serial stays
unobservable (no exposed `identityHash`, no iteration order derived from it). Say so in the
container's header, next to the liveness note §4.6 already asks for.

---

## What this angle cannot see

* **Whether `===` is a good idea for humans.** The JS-reflex argument in §3, the Swift/Kotlin
  precedent, and `identical(a, b)` vs `===` are a cross-language/ergonomics judgement. This
  angle only establishes that the *spelling* is unblocked (`is` is taken, `DECISIONS.md:836`)
  and that `==` cannot be overloaded to mean it.
* **The cost of the serial.** One field plus one counter increment per allocation of an
  identity-keyed type — and, per F4, per allocation of everything that dedups onto it — is a
  perf question with a `wasm-opt` answer, including §4.1's Heap2Local pinning. Not measured here.
* **Whether the box in F1 should exist at all.** A rep change that gave a struct union a bare ref
  would dissolve F1 rather than route around it. Whether that is affordable is a codegen call.
* **Whether identity keys are actually needed** for the serde cycle set (decision D) versus a
  static acyclic-shape predicate plus a depth cap. This angle takes the requirement as given.

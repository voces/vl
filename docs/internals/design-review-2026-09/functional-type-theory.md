# VL, from a type-theory purist's chair — an adversarial review

Scope: read `docs/guide/narrowing.md`, `docs/guide/unions.md`, `docs/guide/soundness.md`,
`docs/guide/collections-design.md`, `DECISIONS.md`, `docs/internals/buffer-design.md`,
`docs/internals/flat-records-design.md`, `docs/internals/match-design.md`, and CLAUDE.md's own
running commentary on the compiler's soundness/capability state. All live claims below were
spot-checked against `dist/vl` on 2026-09-07; two of the checks produced NEW reproductions
(§1, §2) that are not, as far as I can find, filed anywhere.

I am not grading VL against "did the authors try hard" — by that measure this is an unusually
self-aware, unusually well-instrumented project. I am grading it against "does the type system
make illegal states unrepresentable and does `well-typed ⇒ does not go wrong` hold." On that
axis the honest answer is: **not yet, and the gap is large, self-measured, and structural, not
incidental.**

---

## 1. [CRITICAL] The soundness contract's own escape hatch: an un-annotated function silently drops totality checking, and I reproduced a fresh check-clean-then-trap

**The design.** `docs/guide/soundness.md` states the headline claim in bold: *"Every well-typed
VL program is type-safe at runtime… if a program type-checks (zero ERROR diagnostics), then no
operation will ever see a value of the wrong type at runtime."* The mechanism for union
exhaustiveness is spelled out explicitly: *"A missing case leaves the result nullable — and that
`| null` is the soundness signal 'you forgot a case': returning it where a non-null type is
declared is an error."*

I tested the case the doc's own examples never show — a function whose return type is
**inferred**, not declared, and whose union-narrowing chain does not cover every variant:

```vl
type Circle = { kind: "circle", r: f64 }
type Square = { kind: "square", s: f64 }
type Triangle = { kind: "triangle", b: f64, h: f64 }

function area(shape: Circle | Square | Triangle) {
  if shape is Circle { return shape.r * shape.r * 3.14159 }
  if shape is Square { return shape.s * shape.s }
  // forgot Triangle
}

const a = area({ kind: "triangle", b: 3.0, h: 4.0 })
print(a)
```

```
$ dist/vl check t5.vl
Checked 1 file, no errors.
$ dist/vl run t5.vl
Error: error while executing at wasm backtrace:
    0:    0x17c - vl!area@5
wasm trap: wasm `unreachable` instruction executed
```

**Zero diagnostics, zero hints, then a hard runtime trap on the very first call that exercises
the missing case.** This is not the "loud" `| null` story soundness.md advertises — the checker
did not widen `area`'s return type to include `null` and did not complain when I compared or used
it; it silently inferred `f64` and let the emitter pad the fall-through with `unreachable`,
trusting a totality proof that is wrong for this shape.

I checked the same idea with an *annotated* return type first (`function area(...): f64`), and
there the checker correctly refuses: `non-exhaustive is-chain falls through with no else —
missing Triangle`. So the discriminating ingredient is exactly "was the return type written
down or inferred" — a distinction that should be invisible to a soundness argument and is not.

This lands in the *identical family* as `D1902` (`docs/internals/inventory/D1902.md`), a defect
closed the same day I ran this: *"the totality rule read a bare block's tail as an implicit
return, so the emitter padded a live path with `unreachable`… check-clean invalid wasm."* D1902's
own postmortem names the mechanism precisely: three subsystems (checker totality, `isStmtNode`,
the emitter's fall-through padding) can each independently believe a path is dead, and if any one
of them is wrong the result is "sound because the typechecker proved that path dead" stamped on a
path that is very much alive. My repro is a sibling of that bug — a different code shape hitting
the same seam (an un-annotated function's totality proof over a non-exhaustive union guard chain)
— filed nowhere that I could find in `docs/internals/inventory/`.

**Type-theory objection.** This is precisely the bug class totality/exhaustiveness checking
exists to make **impossible by construction**, not merely diagnosed after the fact. In Haskell,
OCaml, or Rust, "does the compiler's belief that every path returns match reality" is not a
separate question from "did the pattern match cover every constructor" — they are the *same*
check, done once, structurally, over the AST's shape, independent of whether you wrote a type
signature. VL instead has **three different code paths** that can each conclude "unreachable" —
`nodeIsTotal` (bare blocks), `conditionsExhaust` (is-chains, but seemingly only reliably when a
declared return type is present to receive the `| null` signal), and the emitter's own
fall-through padding — and they are allowed to disagree. A soundness argument built on multiple
independently-fallible provers that must all agree is not a soundness argument; it's a race
condition between analyses.

**Cleaner alternative.** A `match`/`case` construct is checked for exhaustiveness **once**, as a
static property of the pattern set against the closed type — independent of what you do with the
result, independent of whether a signature was written. There is no "inferred vs. declared return
type" axis for the compiler to get out of sync on, because exhaustiveness is a property of the
*match*, not a property of what the *caller* demands from the result. `Never` composes for free:
a function that matches exhaustively and never falls through has no implicit `unreachable` to get
wrong, because the compiler didn't infer totality from a heuristic — it's a syntactic invariant of
`match` (every arm names a constructor or is `_`).

**Cost of the fix to VL.** Not small: it means the `if x is T` idiom that `docs/guide/narrowing.md`
and `docs/guide/unions.md` teach as the primary, idiomatic way to discriminate a union would need
to make totality tracking independent of whether a return-type annotation happens to be present —
i.e., fixing this properly means the inferred-return path has to run the *same*
`conditionsExhaust`/nullability logic the annotated path runs, not skip it. That's a real, no
longer purely cosmetic compiler change, not a doc fix.

---

## 2. [CRITICAL] The checker and the emitter are two different, non-coincident specifications of "legal VL program" — and CLAUDE.md's own numbers say the gap is enormous

**The design.** VL's stated goal (CLAUDE.md, "The goal is `runs`") has two clauses: (1)
soundness, (2) "the compiler rejects only what the DESIGN forbids… 'not yet supported by codegen'
is never a valid answer." The project's own instrumentation says clause 2 is failing at scale:
a witness-sampled estimate puts **≈187–328 of ~504-533 emit-refusal sites** (37–65%, with a 95%
envelope reaching up to 390) reachable by a `vl check`-clean program — i.e. the checker routinely
says "yes" to programs the emitter then refuses with an internal-sounding message, not a type
error.

I reproduced the canonical instance live rather than trusting the doc (`docs/guide/soundness.md`
claims this exact scenario is "silently accepted and emits invalid wasm," which is now stale):

```vl
type Animal = { name: string }
type Cat = { name: string, meow: boolean }
function feedAll(as: Animal[]) { as.push({ name: "generic" }) }
const cats: Cat[] = [{ name: "Felix", meow: true }]
feedAll(cats)
```

```
$ dist/vl check t2.vl
[ERROR]: an object value of shape Cat flowing into Animal (reached through Cat[] into Animal[])
drops the field `meow`: type-valid (structural width subtyping) but not yet supported by codegen
```

Good news: it is now a **loud** refusal, not silent invalid wasm — the doc I was told to read is
out of date (exactly the "claims go stale one-directionally" pattern CLAUDE.md itself warns
about). Bad news, and this is the actual finding: the message concedes, in its own words, that
the program is **type-valid** and refuses it anyway, because "codegen" has no lowering. That is a
clause-2 violation by the project's own definition, and it is not an edge case — CLAUDE.md counts
**22 distinct message literals** in the compiler that concede exactly this ("has no lowering",
"not yet supported by codegen", "not yet implemented" …), reachable at an estimated 226–390 sites,
none of which the distilled 7,021-cell regression corpus can see at all (`baseline.jsonl` contains
zero emit-side rejects).

**Type-theory objection.** A type checker's job is to be the *total, decidable predicate* for
"will this program run correctly." If "checks" and "compiles" are different predicates — and here
they provably are, over hundreds of sites — then the type system has been demoted to a
**necessary but not sufficient** filter, and the actual gate is an ad hoc partial function bolted
onto the back end that nobody has proven agrees with the front end. This is exactly the
"well-typed programs go wrong" failure a sound type system is supposed to rule out, softened only
by the fact that the failure mode is a loud abort rather than silently wrong data (which is real
credit — see below) but is still a violated soundness *claim*, not merely an incomplete language.

**Cleaner alternative.** In a language built around ADTs and monomorphized/erased generics (ML
functor instantiation, Rust monomorphization, GHC's dictionary-passing), the type checker's
accept set and the code generator's total-function domain are proven to coincide by construction
— every well-typed term has exactly one compilation strategy, decided at the type level, with no
"and now hope the emitter has an arm for this shape" step. VL's structural-width-subtyping example
above is the textbook case: OCaml's row-polymorphic records or Rust's `From`/explicit coercions
would either (a) make the coercion a real, total operation with a defined cost (an explicit
projection/copy), decided by the type checker itself, or (b) refuse it as a type error at check
time with no separate "codegen doesn't know how" phase to fall into.

**Cost to VL.** This is the single most expensive fix on this list, and VL's own project record
says so: closing it means either (a) building the ~300 missing lowerings (a large but bounded
engineering project the project is visibly already doing, incrementally, defect by defect), or
(b) making the checker's accept predicate a computable *subset* of what codegen can lower —
which is architecturally the right fix and is not on the roadmap. Given the scale, (a) is what's
actually happening, which means the soundness claim is being made true empirically, one filed row
at a time, rather than proven once.

---

## 3. [HIGH] Structural unions need a global runtime tag registry and manual discriminant fields that a nominal sum type would never need — `match` is sugar over the same runtime test, not a cheaper one

**The design.** `docs/guide/unions.md`: union values are discriminated at runtime by one of three
encodings (niche/nullable-ref, value-kind tagged struct, boxed tagged struct), chosen by a
classifier per union. Tags are interned in a **global registry keyed by structural shape**
(`structSig`, "field-name aware," not the erased wasm type, because WasmGC collapses same-shape
different-name structs to one heap type). Because VL is *structurally* typed, "two `type` aliases
with the same field shape are the same variant" — so `Circle | Square` (two disjoint concrete
shapes) is fine, but if two arms *share* a shape, VL requires you to hand-add a discriminant field
and the checker enforces it: *"arms A and B share a field-name set and no literal-typed field
distinguishes them — add a discriminant field."*

`match` (docs/internals/match-design.md), which does have real, compiler-enforced exhaustiveness
and Rust-style variant-binding patterns (`Move{x, y} => …`) — a genuine, welcome ADT-shaped
feature — is not a *different, cheaper* discrimination mechanism. It is documented, explicitly,
as syntactic sugar that **desugars to the identical `is`-chain**: *"the chain, the narrowing, the
exhaustive-last-arm else and the emitter are all untouched… `Move{x, y} => …` lowers to the same
node shape as its hand-written twin `if cmd is Move { const x = cmd.x; … }`."* Discrimination is,
in every case, a runtime tag compare (or, per the 2026-09-07 ruling, provably NOT a `ref.test`,
because two structurally-identical arms are one WasmGC type and `ref.test` cannot distinguish
them — the tag is "the only sound discriminator").

**Type-theory objection.** This is the sharpest form of the "narrowing is a symptom of weak sum
types" thesis, and it holds up, though not the way the prompt's naive version predicts (VL does
have exhaustive `match` with destructuring — that half of the thesis is refuted). What's true is
subtler and worse: **the representation itself is unprincipled**, because it's derived from
*structural shape overlap*, which is a property that can only be known by comparing arms against
each other, not read off one declaration. A nominal ADT (`data Shape = Circle Float | Square
Float`, `enum Shape { Circle(f64), Square(f64) }`) never has this problem: two constructors with
*identical payload shape* are trivially, permanently distinguishable, for free, because the tag
IS the constructor name chosen at declaration time — no global tag-interning registry, no
"structural-shape collision" analysis, no checker rule forcing the author to manually inject a
`kind: "circle"` field to recover what nominal declaration gives away for nothing. VL's own docs
concede the cost is real: an entire paragraph of `unions.md` exists solely to explain when you
must add a fake data field just so the compiler can tell your two variants apart — a problem that
does not exist in ML-family languages because sum construction and discrimination are the same
act.

The three-encoding classifier (niche / value-tagged / boxed-tagged) is the same story one level
up: a nominal sum type has ONE representation (a tag + payload, decided once by the compiler,
usually with niche-filling done automatically and uniformly — e.g. Rust's `Option<&T>` niche
optimization is derived, not hand-special-cased per union). VL instead special-cases "`T | null`
where T is a ref," "`boolean | null`," and everything else, as three separately-implemented
lowering strategies with separately-argued soundness properties (`structSig` vs. wasm-type keying,
tag-identity-must-survive-widening-into-a-super-union, etc.). That's real, ongoing compiler
surface area (§"Known limits" of `unions.md` lists three more open items: ref-vs-ref `ref.test`
fast path, union arrays hitting a WasmGC wall, literal-union enums not being built) that exists
*because* the union's representation isn't decided once by the sum type's own declaration.

**Cleaner alternative.** Nominal, closed sum types (`type Shape = Circle(f64) | Square(f64)`,
constructors as the discriminant) with exhaustive `match` as the *only* elimination form. The
representation question collapses: one tag scheme, chosen once, per declared sum type, with no
"do these two arms happen to share a shape" analysis ever needed, because sharing a payload shape
is irrelevant — constructors are never confused regardless of what they carry. Niche optimization
(no tag needed when one variant is representable as an otherwise-impossible bit pattern, exactly
VL's `T | null` case) becomes a single, general compiler optimization over the nominal encoding,
not three hand-written special cases.

**Cost to VL.** This is a foundational, backward-incompatible change — VL's whole type system is
structural by design decision (`DECISIONS.md`'s repeated "structural twins share one heap type"
ruling is treated as load-bearing elsewhere, e.g. struct heap-type dedup). Grafting a nominal sum
type onto a structural language is exactly the kind of two-tier type system (some things nominal,
most things structural) that tends to produce its own new inconsistencies at the boundary — VL
would be trading one kind of complexity for another, not eliminating complexity. This is a real
design tension, not a slam dunk for either side, which is why I rank it high rather than
critical.

---

## 4. [HIGH] Null + flow narrowing is a hand-rolled abstract interpreter standing in for `Option<T>` + `map`/`match` — and mutability forces it to solve alias analysis it wouldn't otherwise need

**The design.** `docs/guide/narrowing.md` documents an entire flow-sensitive analysis subsystem:
an `intersectType`/`subtractType` algebra with real `Intersection`/`Negation` type nodes, a
`narrowedPaths` overlay for property paths (not just names), separate rules for `if`, `while`
loop heads, `&&`/`||` short-circuit composition, post-guard accumulation across `if`/`else if`
chains, generic-parameter substitution at monomorphization, and — the part that would not exist
at all under value semantics — an entire **invalidation** story: *"What could falsify a fact
mid-body retires it: a write, or a call that can reach the place."* A **write** to a narrowed
binding is legal and *re-narrows* it (per the 2026-09-06 "narrowing applies to reads" ruling,
itself a reversal of a stricter rule that had been shipped, measured to break working code, and
reverted — `D1736`). A write inside a *nested* block does not retire the fact for the *enclosing*
scope; the two arms of an `if` must be *joined*; a call whose reachability into the place is
merely *possible* must conservatively retire the fact.

**Type-theory objection.** This is not a small feature. It is a real, general-purpose flow
analysis (with a join, a widening-adjacent "Holes are never inspected… narrowing on a generic
param would contaminate it" carve-out, and its own soundness bugs — D1736 was refused once,
re-argued, and reversed by the owner because the first ruling broke a real program) built to
recover, piecemeal, what a **value** carries for free. `Option<T>` in ML needs **none of this**:
there is no "does control flow prove this place is non-null right now" question, because a
`Some x` pattern match doesn't refine a *mutable cell's* type — it destructures an *immutable
value* into a fresh, statically-typed binding `x: T`, once, with no invalidation story, because
there is nothing left to invalidate: `x` was never `Option<T>` in the first place, it's `T`,
period, for its entire scope, guaranteed by the pattern match that produced it. The entire
"write retires the fact / write re-narrows it / nested block doesn't retire it for the outer
scope / a reachable call retires it conservatively" machinery is the *tax of choosing mutable
nullable references as the representation of optionality* — every rule in that list is a rule
about "when can a *mutation* invalidate a *previously proven fact about a place*," a category of
problem that provably cannot arise if optionality is a value you consume once.

The `D1736` history is itself the sharpest evidence: the *first* ruling (narrowing a `while` body
guard must pin the binding's *write-acceptance*, not just its read-type) was shipped, then found
to reject a real, sound program (`paren-is-narrow.vl`, a `runs → not-runs` regression), then
reversed under owner review. That a flow-sensitive refinement rule needed a live regression to
discover its own unsoundness is precisely what happens when the "is this value a T right now" and
"is this place still legal to write" questions get entangled by using one mutable cell to answer
both — an OCaml or Haskell binder never faces this question because a pattern-bound name is
never subsequently reassigned to a different variant.

**Cleaner alternative.** `Option<T>` (or a general closed sum type) as a value, eliminated only
by `match`/`??`/`.map`, with **no flow-sensitive narrowing subsystem at all**. `if let Some(x) =
opt { … }` in Rust, or `case opt of Some x -> … ; None -> …` in Haskell, needs zero alias
analysis, zero "does a write retire this," zero join-of-two-arms-leaves-what-fact rule, because
the refined name is a *new binding*, not a *re-typed view of an old one*. The entire "Remaining"
section of `narrowing.md` — stored-witness correlation, per-call reachability-pruned return types
blocked on "the once-inferred-with-holes memoization" — is future work chasing precision that
pattern-matching on values gets for free from day one.

**Cost to VL.** Very high, and probably not worth paying at this point: VL's whole surface
(`?.`, `??`, `is`, the narrowing guide, presumably a large fraction of idiomatic VL code already
written) is built around nullable-reference-plus-narrowing. Retrofitting `Option<T>` as the
*primary* idiom rather than a library type would be a different language. This is worth stating
plainly as a foundational choice VL made early and cannot cheaply undo — but it should be named
as a choice with a real, ongoing, measured cost (an entire subsystem, its own algebra, its own
regressions) rather than a free simplification, which is how the docs tend to frame it ("no new
concepts," re: `pop(): T | null`).

---

## 5. [HIGH] Mutation is fully ambient with no uniform value/reference discipline — equational reasoning about VL code requires reading which specific operator you used

**The design.** There is no purity tracking, no effect system, no ownership/uniqueness typing,
and no general immutability. Collections are backed by a mutable `{backing, len, cap}` struct
grown by allocate-and-`array.copy`-and-drop-the-old (`docs/guide/collections-design.md` §VL.1–2);
`push`/`pop`/`clear` mutate in place. **Whether a name observes a mutation through another name
depends entirely on which operator produced it, not on any type-level marker**:

- Plain assignment (`const b = a`) aliases — `a` and `b` are the same list, mutating one mutates
  both.
- `a += b` **rebinds** `a` to a freshly allocated concatenation; every other holder of the old `a`
  is now stale and silently sees the old, shorter list.
- `a.extend(b)` **mutates in place**; every alias of `a` sees the appended elements.
- `[...a]` (spread) **copies**, shallowly — so the copy is independent for top-level mutation but
  still aliases nested reference elements (`c[0].x = 7` is visible through `a[0]`).
- `readonly T[]` is a *view*, not an immutable value: it forbids `push`/`pop`/index-assignment on
  the list itself but is explicitly **shallow** — `xs[0].r = 2` through a `readonly` handle is
  legal and visible everywhere else, "as Kotlin's `List` and C#'s `IReadOnlyList` are." It also
  converts one way only (`T[] → readonly T[]`, never back), which is a capability marker on a
  reference, not a type describing an immutable value.

Five different aliasing behaviors, chosen per call site by which of five near-synonymous-looking
operations (`=`, `+=`, `.extend`, `[...]`, a `readonly` cast) you happened to write, with **no
type distinguishing them** — `a`'s static type is `i32[]` in every single case above.

Underneath, the compiler's own allocator story for the *unmanaged* tier (`Buffer`, linear memory,
`docs/internals/buffer-design.md` §A5/§J) is a textbook imperative arena: a bare mutable
module-global bump pointer (`let bumpPtr = 16`), `Buffer(n)` bumps it and hands back an extent,
and the only "free" is a mark/release discipline (`bufferMark(): i32` / `bufferRelease(mark)`)
that resets the pointer and — pinned by a test, not merely documented — **leaves the released
region carrying the previous owner's stale bytes** for the next allocation to read. That's a
real, and realistic, use-after-free-shaped hazard (reading old data through a fresh allocation)
that the type system has no way to see, because a `Buf` is just `{base: i32, length: i32}` —
nothing distinguishes "freshly zeroed" from "reused, dirty" at the type level.

**Type-theory objection.** Equational reasoning — the entire point of a "functional core" — is
not possible over general VL code, because you cannot know from a *type* whether `f(x)` can
observe or affect anything reachable from `x` after the call, nor whether two in-scope names
denote the same or different storage. This is not merely "VL allows mutation" (so does OCaml, so
does Standard ML's `ref`) — it's that **mutation is undifferentiated from copying at the type
level**, so a reader must track, per binding, per operator, a mental aliasing model the compiler
does nothing to check or communicate. `readonly T[]`, the one static capability marker that
exists, is scoped to exactly one type shape (lists, added 2026-09-06 — very new) and is shallow,
so it answers "can this reference mutate the list" but not "can this reference reach mutable
state at all," which is the question a purist actually wants answered.

**Cleaner alternative.** Either (a) persistent/immutable-by-default data structures with
structural sharing (Clojure's vectors, Scala's `List`, OCaml's default), where `const b = a` is
always safe by construction because there is no in-place mutation to alias into, and an explicit
mutable cell (`ref`, `Array.t`, `MutableList`) is a distinct, visibly-marked type reserved for the
rare case that needs it; or (b) an ownership/uniqueness discipline (Rust's `&`/`&mut`/move) where
the *type* of a reference states whether aliasing is even possible, so `extend`-vs-`+=`'s
alias-or-not question is answered by the borrow checker once, not memorized per API. Either would
make VL's own five-behaviors-one-type-signature table above impossible to write, because each
behavior would carry a distinct, checked type.

**Cost to VL.** Enormous — this is asking for a different language's memory model, not a patch.
VL's WasmGC target and its "no second, self-managed object model" ruling (`DECISIONS.md`) are
reasonable engineering constraints, and reference semantics with mutation is a legitimate,
common choice (Java, JS, Python, Go all make it). The critique here is narrower than "add
immutability": it's that VL doesn't even have the **cheap** half of this — a `readonly`/`const`
capability that composes (deep, or at least documented as an intentional shallow-only contract
applied uniformly, rather than one type getting a bespoke shallow view feature in a single
2026-09-06 ruling while everything else has zero such marker).

---

## 6. [MEDIUM] `flat` types have two disconnected identities, and the raw-memory tier is a hole in the type system by design, not by accident

**The design.** `flat type TValue = { value: i64, tt: i32, pad: i32 }` (`docs/internals/
flat-records-design.md`) is explicitly ruled to be **the same type**, simultaneously, as an
ordinary WasmGC-heap-allocated struct value (usable as a `const`, a field, a return type — full
structural-equality VL semantics) **and** a byte-layout descriptor whose `N.size`/`N.field`
constants are folded `i32`s used for manual pointer arithmetic over raw linear memory via
`__load_i32__`/`__store_i32__`. The design doc states this as a deliberate ruling — the
alternative ("`flat` marks a layout descriptor that cannot be a value") was explicitly rejected
as "the purist reading."

Crucially, **there is no operation anywhere that connects the two identities.** Nothing type-checks
"the bytes at this address really are a `TValue`" — you get raw scalar loads that produce
whatever bit pattern happens to be there, and the type system's job stops at "this is a
syntactically valid `i32`" (which is vacuously true of any 4 bytes). The `tt` field of a `TValue`
read through the flat/byte-layout route is not narrowed, not validated, not exhaustiveness-checked
against anything — it's just a number, and if it's supposed to be one of three known tags, nothing
enforces that. Compounding this, indexing through the pattern the doc itself recommends
(`docs/internals/flat-records-design.md` §9.5, the fused `st[i].tt()` row-address idiom) is
**"Bounds: none, deliberately"** — no length check on the index, no check on the address,
explicitly opting out of the trap-on-OOB discipline the rest of the language leans on, "the same
ruling `load-past-page-end-traps.vl` states for the raw intrinsics."

**Type-theory objection.** This is a scoped `unsafe` block with none of the ceremony: Rust marks
`unsafe fn`/`unsafe { }` at the syntax level, so a reader can see the boundary and an auditor can
`grep` it. VL's raw-memory tier has no such marker — `__store_i32__`, `flat` field access, and
`Buffer` methods are ordinary function calls and ordinary field-like syntax, indistinguishable at
the call site from a checked, safe operation. Combined with finding #5's stale-memory-on-release
hazard, this means **the soundness contract's own scope is undocumented at the syntax level** — a
reader cannot tell, without knowing the `flat`/`Buffer`/`__*__` vocabulary by heart, which lines
of a program are inside VL's proven-safe universe and which are raw pointer arithmetic that
merely happens to be spelled the same way.

**Cleaner alternative.** Wrap the entire raw-memory tier in an explicit, lexically-scoped
`unsafe` marker (Rust's approach), or, more ML-flavored, make deserialization from a byte buffer
into a `flat` value an explicit, fallible, checked operation (`decode<TValue>(bytes, offset):
TValue | DecodeError`) that validates whatever invariants the type actually needs (e.g., a tag
field is one of the known literals) rather than a bare reinterpret-cast. That reintroduces exactly
the sum-type-and-`match` discipline VL already has for its GC-heap unions, applied at the
boundary where untyped bytes become typed values — which is where a purist would insist the
checking has to live, because it's the only place the check is even possible.

**Cost to VL.** Low for the `unsafe`-marker version (a syntax/lint addition, not a semantics
change — the design doc's own "erased before the emitter runs, byte-identical" property means
`flat` already costs nothing at runtime, so marking it costs nothing either). Higher for the
validated-decode version, since it's new machinery per flat type, and the whole feature exists
specifically to serve a customer (a Lua VM / wc3 port) whose entire point is bypassing the type
system to match a foreign byte-exact layout — a purist decode-with-validation story is somewhat
in tension with that goal, though not fundamentally incompatible with it (the validation would sit
above the raw load, not replace it).

---

## 7. [MEDIUM] The collections design bakes representation/performance concerns into what should be a purely semantic type, and picks "trap" vs. "Option" per operation rather than from a principle

**The design.** `docs/guide/collections-design.md` is unusually careful and explicit about its
own reasoning (it is, structurally, the most "type-theory-literate" document in the set — it
explicitly cites Rust's `Vec[i]`-panics/`.get`-Option split and adopts it on purpose). Indexing
traps on out-of-bounds (`a[i]: T`, an unrecoverable trap) while `.get(i): T | null` is the safe
form, and `Map[k]: V | null` is unconditionally optional because a missing key is "normal." This
is a coherent, deliberately-argued split ("results for expected absence, traps for bugs") and I
don't think it's wrong on its own terms.

What I'd push on: the type of `l[i]` is not actually `T` in any total sense — it is `T` on a
precondition (`i` in bounds) that the type carries no evidence of, so "traps" is functionally an
*ad hoc, uncatchable, unchecked* exception living entirely outside the type system, for a
condition (bounds) that is often staticaly knowable. The document's own §VL.6 "bounds-narrowing"
optimization concedes as much: it exists specifically to let the compiler *sometimes* prove
`i < len` and elide the trap check — i.e., there already is a static analysis capable of proving
many of these accesses safe, and the type of `l[i]` doesn't reflect that proof; it's purely an
optimization on the *emitted code*, invisible to a caller reasoning about the type signature.

Separately, a large fraction of the design doc's content (§VL.1's header-vs-backing-pointer cost,
§VL.6's "backing-pointer hoisting," "native-indexing flag," LICM-across-`struct.get` caveats) is
codegen/performance reasoning about *how a `List` needs to be represented so a loop over it can
reach raw-array speed* — real and important engineering, but it means the "one user-facing
collection" surface (`T[]`) is defined jointly by its semantics AND by which representation
inference can currently prove safe to elide, with the elision's soundness ("never observably
wrong… degrading to a full List whenever it can't prove it") resting on an unstated, unproven
alias/growth analysis rather than on a type that states the guarantee (e.g., a genuinely
fixed-size array type distinct from a growable one, so the compiler never needs to *infer* which
one you meant).

**Type-theory objection.** Where a dependently- or refinement-typed design would carry the bound
proof in the type (a sized vector `Vec n a`, or a refinement `{i : Int | 0 <= i < len xs}`), VL
carries it nowhere and instead trusts an unspecified best-effort narrowing pass to *sometimes*
recover it for performance, while the *type* `T[]` never distinguishes "provably fixed size" from
"growable" — that distinction lives entirely in an internal representation-inference analysis the
program cannot see, name, or depend on.

**Cleaner alternative.** A real fixed-size array type distinct from a growable one at the surface
(as Rust distinguishes `[T; N]` from `Vec<T>`, or as VL's own design doc's rejected-but-adjacent
"uncommitted... `Array<T>`" name gestures at) would let the *type* carry the growability fact the
compiler currently has to infer, and a checked-index type (a refinement, or simply requiring a
prior `if i < xs.length` to produce a distinct "checked index" value narrowed by the same
narrowing engine already used for nullability) would let "the type says no OOB is possible here"
be a real, checkable fact rather than an internal optimization heuristic.

**Cost to VL.** Moderate. A distinct fixed-array surface type is explicitly discussed and
deliberately deferred in the doc itself ("not a coexisting everyday type… a future advanced
surface, not v1") — so this is a case where VL's own design record already contains the purist's
preferred alternative, just not built yet, for reasonable phasing reasons.

---

## 8. [LOW, meta] The compiler that enforces all of this is itself written in exactly the style the type theory would forbid — and needs bespoke lints to catch bugs a real type system would make impossible

Not a language-design point, but worth recording because it's evidence about incentives: the
self-hosted compiler (`compiler/*.vl`) is, by its own maintainers' account (CLAUDE.md), built on
mutable global "arena" tables indexed by hand-tracked integer sentinels (`-1` for "no value"),
with entire *classes* of postmortem-worthy bugs — "a table read that doesn't bound-test its
index" (four separate compiler traps in one day, D1440/D1462/D1500...), "a ladder over a closed
kind set with a bare `_`/default arm that silently swallows an unhandled case" (the very bug
exhaustive `match` exists to prevent, recurring **inside the compiler that implements
exhaustiveness for everyone else**) — common enough that the project had to build two *ratcheted,
zero-tolerance static lints* (`sentinel-index-unguarded`, `kind-ladder-incomplete`) just to hold
the line. That these lints exist, are actively finding new instances, and are described as
catching "four in one week" as recently as this repository's own history, says plainly that even
VL's own authors, writing VL's own type checker, do not lean on VL's type system to make these
states unrepresentable — they lean on a separate, retrofitted static-analysis pass, which is
exactly the "narrowing as a symptom" pattern from §3 recurring one level down, in the
implementation language's own toolchain.

---

## Summary table

| # | Severity | Finding | What a purist rebuilds |
|---|---|---|---|
| 1 | CRITICAL | Un-annotated-return totality checking is unsound; I reproduced check-clean → runtime trap live, same family as same-day D1902 | Exhaustiveness as a static property of `match`, independent of return-type annotation presence |
| 2 | CRITICAL | Checker's "legal" ≠ emitter's "compilable"; ~200-390 self-measured capability gaps, reproduced live | Type checker's accept-set proven, not merely tested, to equal codegen's domain |
| 3 | HIGH | Structural unions need a global runtime tag registry + manual discriminant fields; `match` is sugar over the same tag test | Nominal closed sum types, tag = constructor, decided once at declaration |
| 4 | HIGH | Null narrowing is a hand-built flow analysis (with its own regressions) standing in for `Option`'s free elimination | `Option<T>` + exhaustive `match`, no flow-sensitivity, no invalidation story |
| 5 | HIGH | Five aliasing behaviors (`=`, `+=`, `.extend`, spread, `readonly`) share one type; no equational reasoning | Immutable-by-default + structural sharing, or ownership/borrow typing |
| 6 | MEDIUM | `flat`'s dual identity + unmarked raw-memory tier is an invisible `unsafe` boundary | Lexically-marked `unsafe`, or a checked `decode` boundary |
| 7 | MEDIUM | Index-trap type `T[]` carries no bound proof; growability is inferred, not typed | Sized/refinement types, or a distinct fixed-array surface type |
| 8 | LOW/meta | The compiler's own implementation needs retrofitted lints to catch bugs sum types prevent | Self-hosting on a language whose own type system it actually leans on |

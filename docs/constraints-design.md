# VL constraints design — nameable bounds for what inference already enforces

Owner questions (2026-09-01, verbatim in intent): *should VL have a trait-like mechanism as
part of a type contract — something like `{toString(self): string}`, satisfied by UFCS? We
had the concept planned of implicitly typing `(a) => a + a` as needing `+` with itself;
is that even possible to type explicitly today?*

This doc answers the "what exists" half by measurement, surveys how other languages hold
the space, and proposes a two-phase direction. Everything in §1 was run on the 2026-09-01
seed; re-run before quoting (a citation is a measurement with a date on it).

## 1. Ground truth, measured

**The implicit operator constraint is SHIPPED, on both spellings of a generic.**

```vl
function dbl<T>(x: T): T { x + x }     // declared type parameter
function dbl2(a) { a + a }             // unannotated parameter (inferred hole)
```

Both check and RUN at `i32` (`6`), `f64` (`3`), and `string` (`"abab"`), and both refuse a
boolean argument **at the call site**:

```
operator '+' is not defined for boolean and boolean (the call's argument types)
```

The checker's derivation store models this directly — `HD_BINOP` rows record "this hole
needs operator `+`" beside field-of / return-of / element-of / guarded-alternative
derivations (`compiler/typecheck.vl`, the derived-hole table). So the planned
"`(a) => a + a` demands `+`" concept exists, implicitly, with no spelling.

**Member demands split by spelling.** An unannotated parameter infers a demanded shape
(`function getN(x): i32 { x.n }` accepts `{n: 3}`, refuses mismatches at the call). A
DECLARED `<T>` refuses member access at the declaration — with an EMPTY diagnostic (filed
as D952, whose row also records the trap: the author's likely reaction is deleting `<T>`,
which silently changes the program's meaning).

**A structural spelling exists for function-typed FIELDS, and UFCS does not satisfy it.**

```vl
function render(x: { toStr: (Circle) => string }): string { x.toStr({ r: 1.0 }) }
```

parses and checks (function types take unnamed parameters — `(self: i32)` inside a type is
a parse error at the `:`). But it means a real closure **field**. With a free
`toStr(self: Circle)` in scope, `render(c)` refuses:

```
argument 1: expected {toStr: (Circle) => string}, got Circle
```

Fields are data; UFCS is call-site sugar. Today nothing bridges them.

**Where interpolation's stringify binds is already ruled, and now SHIPPED** — and it is
deliberately the opposite answer: a string literal's meaning must not depend on imports,
so template literals bind ABSOLUTELY to std's renderer (owner ruling 2026-09-01; the
builtin is killed and std `toStr` is renamed into the vacancy in a queued follow-up, and
the bound name is one constant, `TPL_RENDER_EXPORT` in `driver.vl`), eventually to the
derived `show<T>`. As built, the hole's call names an identifier no program can spell and
the module merge rewrites it onto the merged symbol — see DECISIONS.md, "A template
literal's stringifier is bound ABSOLUTELY". Bounds, by contrast, may be scope-relative —
§4 argues why.

## 2. Survey — how other languages hold this space

* **C++20 concepts** are the closest relative of VL's actual machinery: named, explicit
  predicates over what a body demands ("`a + a` must compile"), checked at instantiation,
  zero dispatch. Pre-concepts C++ IS VL today — real constraints, unnameable, with errors
  that surface from the body instead of the boundary. Concepts were, literally, "make the
  implicit template constraints spellable."
* **Go interfaces** are the owner's sketch: structural method sets, implicit satisfaction.
  Go affords implicitness because methods attach to types at declaration and travel with
  them — "has the method" is a property of the type. VL's UFCS functions are imported, so
  the same judgment becomes a property of (type, scope). That is the one deep problem in
  the sketch, and the pivot of §4.
* **Rust traits / Haskell classes**: nominal `impl`/instances plus global coherence (orphan
  rules) make satisfaction scope-independent — imports gate only method *syntax*. The
  machinery's payoff is dynamic dispatch and global reasoning; the cost is impl ceremony
  and coherence law. Monomorphized VL needs neither payoff today.
* **TypeScript**: structural on fields — exactly VL's `{toStr: fn}` position — and TS also
  refuses to let free functions satisfy interfaces. Its extension answer (declaration
  merging, prototype patching) is widely regretted.
* **Swift protocols**: nominal conformance with retroactive extensions — and the known
  wart that retroactive conformance by a third party creates exactly the coherence
  ambiguity Rust's orphan rule forbids.

Dispatch note: everything in VL monomorphizes, so no design below needs vtables,
dictionaries, or trait objects. If dynamic dispatch ever matters, the WasmGC-subtyping
future (monomorphization doc) is the moment to revisit — not before.

## 3. The design space, cut three ways

* **What a bound can say**: member fields (exists today) · methods-callable-on-the-receiver
  (the sketch; does not exist) · operators (exists implicitly; no spelling) ·
  conjunctions of those.
* **Where satisfaction is judged**: structural fields only (scope-independent, TS-like —
  but then user types "satisfy" only by carrying closures, which is heavy and not how VL
  code is written) · **instantiation-site scope** (a free function in scope satisfies —
  consistent with how the UFCS *call* already resolves) · nominal impl declarations
  (new syntax, coherence rules — rejected above).
* **Spelling of the bound**: named type alias reused as a bound (`type Showable = {…}`,
  `<T: Showable>`) · inline (`<T: { toString(self): string }>`) · intersection on the
  parameter (`x: T & Showable`) · where-clauses. The alias-plus-`<T: B>` form is the
  smallest addition and reads like the rest of VL.

## 4. Proposal

### Phase 1 — nameable structural bounds (concepts, not traits)

Let a declared `<T>` carry what inference already computes. New syntax, one construct:
a **method member** inside a type literal, distinguished from a field by the named `self`
parameter:

```vl
type Showable = { toString(self): string }
function describe<T: Showable>(x: T): string { "<" + x.toString() + ">" }
```

Semantics:
* **Declaration-checked**: the body may use exactly what the bounds grant (member calls on
  `x` resolve against the bound). This closes D952's hole with a real message instead of a
  wordless refusal — the payoff that exists even for code that never writes a bound.
* **Call-checked**: an argument must satisfy the bound, and the error names it
  (`Circle does not satisfy Showable: no toString(self: Circle)` — today's equivalent is
  an empty string).
* **Zero runtime**: bounds exist at check time; monomorphization proceeds unchanged.
* **Operator bounds: deferred.** The implicit machinery already enforces them on both
  generic spellings (§1), so the explicit win is documentation, not capability. Every
  candidate spelling surveyed (`{ (self) + (self): self }`, builtin concept names like
  `T: Plus`) is worse than waiting for a real need. Recorded as OQ-2 rather than designed
  speculatively.

### Phase 2 — UFCS satisfaction, judged at the instantiation site's scope

The rule: `T` satisfies `{ toString(self): string }` at a given instantiation if the value
has a matching **field**, or a matching **free function is in scope at that call site** —
the same resolution the method-call syntax `x.toString()` already performs there.

Stated hazards, not hidden: the same type can satisfy in one file and not another, and two
files can bind *different* `toString`s for one `T`. There is no coherence law. The defense
is that this is not new semantics — it is UFCS's existing behavior, stated at the boundary
instead of discovered in the body — and monomorphization makes each site's choice
deterministic and inspectable. The LSP's auto-import machinery (#2074/#2077) turns the
missing-import case into a one-keystroke fix, which answers the owner's "can automatically
import or provide an automation" question: the *language* never auto-imports (scope stays
explicit); the *editor* offers it.

Phase 2 lands only after Phase 1 has soaked — the satisfaction rule is a semantic
commitment with no deprecation story once user code leans on it.

### Explicitly avoided

Nominal impls, coherence/orphan rules, dynamic dispatch, trait objects — heavyweight for
what VL needs, and the WasmGC note above marks the only revisit trigger.

## 5. Relations

* **D951** (`is T` mandate) is orthogonal: it tests a VALUE against the parameter;
  bounds constrain the parameter. They compose (`<T: Showable>` + `v is T`).
* **D952** (empty refusal) — Phase 1 is the root fix; the message-only fix should land
  regardless and first.
* **serde Stage 2 `show<T>`** is compiler-DERIVED, not bound-gated; concepts neither block
  nor require it. Interpolation binds to std absolutely (ruled) — deliberately NOT the
  Phase-2 scope rule, because literals are not instantiations.
* The implicit machinery (§1) is untouched by all of this: explicit bounds are additive.

## 6. Open questions for the owner

* **OQ-1 — method-member syntax, EXPANDED after owner probing (2026-09-01).**
  How other languages spell a method requirement: Rust `fn to_string(&self) -> String`
  (explicit self, and its presence is SEMANTIC — `fn new() -> Self` without self is an
  associated function); Python `typing.Protocol` `def __str__(self) -> str` (explicit
  self, structural setting — VL's nearest cousin); Go `String() string` (implicit
  receiver — unambiguous only because Go interfaces may ONLY contain methods and fields
  can never satisfy one); Swift `func toString() -> String` (implicit); TypeScript
  `{ toString(): string }` (method syntax EXISTS but is semantically identical to the
  property form — in JS a method IS a property, so TS's distinction is cosmetic; VL's
  would be real, because UFCS functions are NOT fields); C++20 concepts
  `requires(T x) { { x.toString() } -> same_as<string>; }` (no field/method distinction
  at all — the bound is an EXPRESSION that must compile).

  **What `self` actually buys — the call contract, not who satisfies (measured).** The
  owner asked: a value can carry a `toString` FIELD of the same type as the UFCS
  function, so is the distinction real? The call shapes answer it:
  - field `toString: () => string` (zero-ary): `x.toString()` works — the closure
    carries its data by capture, no receiver passed;
  - UFCS free `toString(self: X): string`: `x.toString()` works — receiver fed as arg 1;
  - field of the UFCS function's EXACT type `(X) => string`: `x.toString()` does NOT
    work (zero args into a unary closure) — its spelling is `x.toString(x)`. So the
    "same type" field never collides on the call expression; the true twin is the
    ZERO-ary field. And when both a zero-ary field and a UFCS function exist, **the
    field wins** (probed 2026-09-01: prints `field`). The colon form is therefore a
    LAYOUT demand (the value physically carries a closure — construction and any future
    serde walk see it); the `self` form is a CALLABILITY demand (nothing stored).

  **The cleanest semantics — and a coupling this exposes**: define the method-member
  bound the C++-concepts way: "`x.toString()` type-checks with result `string`, under
  the resolution rules every call already uses (field first, then UFCS in scope)". No
  new satisfaction judgment, no ambiguity — the bound defers to existing call
  semantics. The catch, stated honestly: UFCS-in-scope satisfaction IS Phase 2's
  scope-relativity, so under expression semantics the method form is only useful once
  OQ-3 is accepted — in a fields-only Phase 1 it would be satisfiable solely by
  zero-ary closure fields, which nobody writes for `toString`. So the real choice is:
  ship Phase 1 as field bounds + operator demands + good errors and add the method form
  WITH Phase 2, or accept expression-based (scope-relative) satisfaction from day one.
  OQ-1 and OQ-3 are one decision wearing two numbers.

  **SPELLING REVISED after a second owner probe (2026-09-01): drop `self` — the form
  is `{ toString(): string }`.** Two measurements force it. (1) VALUE literals already
  have a method shorthand: `{ f() { "ok" } }` parses, runs, and is field-equivalent
  (parser.vl's object-literal arm; measured — it satisfies a `{ f: () => string }`
  annotation). (2) TYPE literals accept only the colon form today — both
  `{ f(): string }` and `{ f(self): string }` refuse, so the parens spelling is free
  syntax. Given (1), the type-side method form should mirror the value shorthand's
  CALL SHAPE: parameters listed are the call's arguments, the receiver is implicit —
  which is also exactly Go's interface spelling (`String() string`). The `(self)`
  variant would wrongly imply the satisfier must take a self parameter, which the
  zero-ary field satisfier does not. Under expression semantics the pairing is
  coherent and directional: every colon/shorthand FIELD satisfies the method bound
  (the bound is the supertype — "the call works"), while a UFCS-satisfied value does
  not satisfy a field bound. So: `{ f: () => string }` = the data exists;
  `{ f(): string }` = the call works. Same discriminator, one token shorter, and it
  types the shorthand people already write.
* **OQ-2 — operator bounds**: deferred above; reopen when a real API needs to export a
  generic whose operator demand should be documentation-stable.
* **OQ-3 — accept Phase 2's scope-relative satisfaction? EXPANDED after owner probing
  (2026-09-01, the boundary question).** First, the spelling system that covers the
  owner's three demands (field / capability / EITHER), built on measured call shapes:
  **colon = the data exists** (`{ toString: () => string }` — the value carries a
  closure, called with nothing fed in; the self-typed variant `{ toString: (T) =>
  string }` is also a field, its call spelled `x.toString(x)`); **self = the call
  works** (`{ toString(self): string }` — C++-concepts expression semantics: 
  `x.toString()` checks with result `string` under the resolution order every call
  already uses, field first then UFCS — measured). The self form IS the either-form; a
  UFCS-only demand has no constructible use (why forbid a field that makes the same
  call work?), so two spellings cover the space. Note the syntax is free: `(self: T)`
  inside a function type does not parse today, so the named-self spelling collides
  with nothing.

  **Does a UFCS capability ride a context across boundaries? No.** Under
  monomorphization the witness is captured AT INSTANTIATION and baked into the minted
  instance — nothing travels at runtime. Bounds chain through nested bounded generics
  for free (the inner instantiation happens inside the outer instance, where the bound
  is in force — Rust/Haskell dictionary chaining, minus the dictionaries). The chain
  breaks exactly where a vtable-less design must: **the capability never travels with
  the value** — store the struct, hand it to unbounded code elsewhere, and nothing
  carries toString there. Traveling-with-the-value is what the FIELD form is for;
  that asymmetry is why both spellings exist.

  **Which scope is consulted at instantiation** — three precedents: call-site scope
  (Scala implicits: flexible, notoriously confusing, instances keyed by witness so one
  value can behave differently per file); global one-impl-per-type (Rust/Haskell:
  unambiguous, needs orphan-rule discipline, and "per type" is fuzzy for structural
  types); the type's home module (Go-flavored ADL: coherent, but structural types have
  no home module). **RECOMMENDED: call-site resolution + whole-program coherence.** VL
  compiles whole-program — the one thing Rust lacks and the reason the orphan rule
  exists there — so VL can resolve each instantiation in its own scope AND refuse (or
  warn) at merge time if two instantiations of one generic at one T carry DIFFERENT
  witnesses, naming both sites. Scala's flexibility, Rust's guarantee, enforced by the
  compilation model instead of a declaration rule.
* **OQ-4 — bound spelling**: RULED (owner, 2026-09-01, "OQ-4 seems reasonable") —
  `<T: Showable>`.
* **OQ-5 — declaration-checking strictness**: may a bounded body use ONLY what bounds
  grant (proposed — it is what makes the errors good), or do bounds merely add to
  inference?

# VL constraints design — nameable bounds for what inference already enforces

> **RULED (owner, 2026-09-01): "Accept expression semantics from day one."** The shipped
> package is therefore: method-member bounds spelled `{ toString(): string }` (call-shape,
> no `self` — OQ-1), meaning "the call type-checks under the resolution rules every call
> already uses" (field first, then UFCS in scope); satisfaction judged at the INSTANTIATION
> SITE's scope with WHOLE-PROGRAM COHERENCE (one witness per (generic, T) across the merged
> program, both sites named on disagreement — OQ-3); bounds attach as `<T: Showable>`
> (OQ-4, ruled earlier); bounded bodies use ONLY what bounds grant (OQ-5, strict). OQ-2
> (operator bounds) stays deferred: the owner's instinct that operator members ride the
> same call shape (`{ "+"(other: self): self }`) is recorded as the direction, with the
> self-type reference as its one open spelling question — reopen when a real API needs it.
>
> **SHIPPED 2026-09-01 — §7 is the record.** Read it before quoting anything above it: §7.5
> lists three things the plan did not know, two of which change what a sentence in §4/§6
> means (UFCS satisfaction is judged where the generic BODY is written, not at the
> instantiation site; and coherence, though enforced, is unreachable on today's dispatch
> layer). §1's measurements are dated and were re-run at the landing; they still hold.

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
function render(x: { toString: (Circle) => string }): string { x.toString({ r: 1.0 }) }
```

parses and checks (function types take unnamed parameters — `(self: i32)` inside a type is
a parse error at the `:`). But it means a real closure **field**. With a free
`toString(self: Circle)` in scope, `render(c)` refuses:

```
argument 1: expected {toString: (Circle) => string}, got Circle
```

Fields are data; UFCS is call-site sugar. Today nothing bridges them.

**Where interpolation's stringify binds is already ruled, and now SHIPPED** — and it is
deliberately the opposite answer: a string literal's meaning must not depend on imports,
so interpolation holes bind ABSOLUTELY to std's renderer — in a plain `"v=\{x}"` exactly as
in a backtick `` `v=\{x}` ``, one hole syntax for both since 2026-09-01 (owner ruling 2026-09-01; the
builtin is GONE and `std:fmt`'s export carries the name — executed the same day — and
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
* **TypeScript**: structural on fields — exactly VL's `{toString: fn}` position — and TS also
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

## 7. SHIPPED — constraints phase 1 (2026-09-01)

Everything in the header ruling block landed. This section records what was built, what was
MEASURED that the plan above did not know, and the four things that are deliberately still
open. Every number here was run on the seed built from this change; re-run before quoting.

### 7.1 What exists now

```vl
type Showable = { toString(): string }
function describe<T: Showable>(x: T): string { "<" + x.toString() + ">" }
```

* **Method members** parse in every type-literal position — the declaration body
  (`parseTypeDecl`) and the inline atom (`parseTypeAtom`) share one `parseMethodMemberTail`,
  so the two spellings of a bound cannot drift. Only a BOUND may consume one; a method member
  in value position is a design refusal with a sentence (§7.3).
* **Bounds** attach as `<T: Showable>` or `<T: { toString(): string }>`, and may name the type
  parameters in scope (`<T: { eq(T): boolean }>`).
* **Satisfaction is the existing call resolution**, asked at bound-check time: a FIELD of the
  instantiation type first, then a UFCS free function. Nothing new is invented at the call.
* **Strict bodies**: inside `f<T: B>`, member use on `x: T` resolves against B and nothing
  else. An UNBOUNDED `<T>` keeps exactly today's behaviour, pinned by
  `tests/cases/constraints/unbounded-type-param-unchanged.vl`.
* **Operator bounds stay deferred (OQ-2)** and the implicit operator machinery is untouched:
  `dbl<T>(x: T){x+x}` still runs at i32, f64 and string, in the same pin file.

### 7.2 The architecture, and the measurement that chose it

**Bounds ride the ANNOTATION path end to end.** A bound is stored as a `TypeRef` node index on
two sparse side tables in `ast.vl` — `fnTpBound*` (function node, parameter index, annotation)
and `declBound*` (declaration node, annotation) — modelled on `declGp*`, linear-scanned for its
reason (a bound is a handful per program), and cleared in `tsReset`.

The alternative was the checker's own recorded column, and it was refused on a measurement made
the same week: `silent-class-inventory` D976 records that the column the checker writes for an
inferred parameter shape does NOT survive into emit. A bound has to survive into emit, because
the monomorphizer re-resolves each instance's member calls. An annotation does survive — it is
present at parse, needs no inference, and the module merge already renames it (`modRwType`),
its spelling tree already writes back (`tsToName`), and `vl fmt` already recovers it verbatim
from source. Three existing mechanisms carried the feature instead of one new one.

**The emitter needed NOTHING.** This is the measurement that shrank the whole landing, made on
the 2026-09-01 seed before a line was written: `function describe<T>(x: T): string { "<" +
x.toString() + ">" }` with a free `toString(self: Circle)` in scope ALREADY checked,
monomorphized and ran, and so did the same body over `std:fmt`'s imported `toString` at `i32`.
`emit_rewrite.drwWalk` resolves a member call against the receiver — struct field first, then a
`self`-function — so an instance's `x.m(…)` was never the problem. What was missing was the
JUDGEMENT, in both directions: nothing checked that the instantiation type could satisfy the
call (D1001), and a bounded body could not name a member at all (D952).

**Coherence keys on `tyToStr`, not on an arena index — a correction to the plan.** The plan
said "key instantiation types by arena/interned identity, never by rendered spelling". Measured:
the checker's type arena is APPEND-ONLY. `addTy` pushes unconditionally, so `mkArrayTy(TY_I32)`
called twice yields two indices for one type; only the primitives and named user types are
canonical, and the sole dedupe is `annotNameMemo`, keyed on annotation SPELLING and explicitly
bypassed whenever a type-parameter environment is live. There is no interned identity to key
on. The right key is `tyToStr` — the CHECKER's canonical renderer, whose documented contract is
that `tyEq(a,b)` is exactly `tyToStr(a) == tyToStr(b)` decided structurally, and which folds
nominality in so a newtype keys apart from its base. It is NOT `canon`/`tyToEmitName`, the
emit-side spelling-dependent renderer CLAUDE.md warns about; that one runs a phase later and
answers a different question.

**Bounds chain by SUBSUMPTION, not by deferral — the plan's "for free" was half right.** §6
OQ-3 says bounds chain through nested bounded generics for free. They do at EMIT. They did not
at CHECK, and the witness is `describe<T: Showable>` relayed through an unbounded `twice<U>`:
`twice(2.0)` was `vl check`-clean invalid wasm, because the inner call's "instantiation type"
is still a type variable and deferring it hands the question to a pin that never asks. The
demand IS knowable there — `U`'s bound either grants what `T`'s bound needs or it does not —
so it is decided statically, which also puts the error on the declaration that is wrong rather
than on a caller three modules away. Fixtures: `bound-chains-through-generic.vl` and
`error-bound-chain-unbounded-relay.vl`.

### 7.3 Refusals, all with wording

| situation | message |
|---|---|
| unsatisfied instantiation | ``{s: f64} does not satisfy `Showable`: no `toString(): string` — the bound needs a field of that type or a `toString(self: {s: f64}, …)` function in scope at this call`` |
| strict-body violation | ``no `foo` on `T` — its bound `Showable` grants `toString()``` |
| bound alias in value position | ``` `Showable` is a BOUND, not a type — it declares method members, which constrain a type parameter and have no values. Use it as a constraint: `function f<T: Showable>(x: T)` ``` |
| inline method member in value position | ``a method member `toString():string` may only appear in a BOUND — it demands that a call type-checks, which is not something a value carries…`` |
| unbounded relay | ``` `describe` needs `T: Showable`, which demands `toString()` — but `U` is unbounded. Add it to `U`'s bound ``` |
| alias bound naming a foreign parameter | ``the bound member `eq` on `U` names a type that does not resolve here — a bound alias body resolves in its OWN scope…`` |

The value-position pair is a DESIGN refusal, not a capability gap: a method member demands that
a call work, a value type describes what a value carries, and bridging them needs the dynamic
dispatch §4 "Explicitly avoided" rules out. Both annotation ROUTES raise the identical sentence
(the rendered-name arm of `nameToTyReal` and the spelling-tree arm of `tsToTyReal`), because a
design rule enforced on one route only is a rule a re-render walks around.

### 7.4 Self-reference: no new syntax, and the rule that follows

A bound's member types are ORDINARY ANNOTATIONS resolved where the bound is USED, with the
function's type parameters live. So `{ eq(T): boolean }` means "eq takes another one of me"
because `T` is the parameter in scope — there is no `Self` keyword and phase 1 adds none.

The consequence is stated rather than hidden: a bound ALIAS body resolves in its own scope, so
`type Eq = { eq(T): boolean }` works for `<T: Eq>` and refuses for `<U: Eq>`, with a message
that hands over the inline spelling. F-bounded generic bound aliases (`type Eq<S> = { eq(S):
boolean }` with `<T: Eq<T>>`) are not in phase 1; the inline form covers the same ground.

### 7.5 Measured, and NOT as the plan expected

* **UFCS satisfaction is judged where the GENERIC BODY is written, not at the instantiation
  site.** The ruling says "in scope at the instantiation site". The dispatch layer does not
  work that way and did not before this change: the module merge builds ONE global
  plain-to-mangled UFCS alias per member node (`driver.modSelfFnTarget`), resolved against the
  rename map of the module that OWNS the node. Measured both ways — a generic in a dep whose
  witness is imported only by the entry fails, at the bounded spelling with a sentence and at
  the unbounded spelling with D952's empty message; and `x.toString()` cannot reach a
  `self`-function in a module the caller did not import (`no field 'toString' on Circle`),
  which is a live, deliberate scope rule. The practical rule for a library generic is therefore
  **the generic's own module imports its witnesses**, which is the shape `showlib.vl` +
  `std:fmt` takes and which runs. Making satisfaction genuinely per-site needs witness-keyed
  dispatch through monomorphization; that is phase 2's price, not a bug in phase 1.
* **Whole-program coherence is enforced and, on today's dispatch layer, NOT REACHABLE.** The
  ledger is built (one row per generic × instantiation type × bound member, refusing a
  disagreement and naming both sites), and no program can currently violate it: with `T` fixed
  the type either carries the field or it does not, and the UFCS half already collapsed to one
  witness per property name program-wide before the checker sees it. Reported as measured
  rather than demonstrated. The ledger stays because it is the enforcement point the ruling
  asks for and it is what must already exist the day dispatch becomes per-site.
* **A closure-FIELD witness lost to a same-named `self`-function inside a generic body, and
  the result was invalid wasm** — `silent-class-inventory` D1002, pre-existing, reproducible
  with no constraints syntax. `dispatchRewrite` runs BEFORE `monomorphize` (a declared ordering
  in `emit_sections.vl`), so the member call was rewritten once for every instance while the
  receiver was still a type parameter. **CLOSED 2026-09-02**: the rewrite now asks the CALL
  SITES the question the body cannot answer — when every argument at that parameter position
  carries a field of that name, it declines and the field-closure lowering (which resolves per
  FUNCTION) is right at each instance. The ORDERING is unchanged; what moved is the decision.
  The disagreeing pair — one instantiation taking the field, another the `self`-function —
  shares one AST node and stays open as D1063.

### 7.6 Still open

* **OQ-2, operator bounds** — unchanged, and the implicit machinery still carries them.
* **Phase 2, per-site UFCS satisfaction** — needs the dispatch decision to move past
  monomorphization for the DISAGREEING instantiation pair (D1063). D1002 closed the
  unanimous-field half without moving the pass, by asking the call sites at rewrite time.
* **D1004** — the UNBOUNDED half of the empty member-access diagnostic. Closed for a bounded
  parameter, open by ruling for an unbounded one.
* **D1005 — CLOSED 2026-09-02.** The unbounded half of the unsatisfied instantiation, closed
  the way the row prescribed: a deferred UFCS-RECEIVER constraint (`ufcsCstr*`) beside
  `memCstr*`, re-asked at both pins, guarded by field precedence asked of the SUBSTITUTED
  receiver. The refusal names the contract (`the \`toString\` in scope takes Circle`) and the
  legal field witness is not refused.
* **LSP bound-member completion and hover on `x: T`** — a fast-follow, deliberately not in
  scope. One line on what it needs: `check_query`'s member-completion path reads the receiver's
  `TyObj` fields, so a `TyVar` receiver yields nothing; it needs the same
  `tpBoundOfName` → `boundObjRootOf` → `boundMembersOf` walk the checker now has, with the
  bound environment kept live past the body check (today it is pushed and popped inside
  `checkFuncDeclNode`) or re-derived from `fnTpBoundOf` at the query's enclosing function.

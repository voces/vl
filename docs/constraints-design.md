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

**Where interpolation's stringify binds is already ruled** and is deliberately the
opposite answer: a string literal's meaning must not depend on imports, so template
literals (when built) bind ABSOLUTELY to std's `toString` (owner ruling 2026-09-01:
builtin killed, std `toStr` renamed into the vacancy), eventually to the derived
`show<T>`. Bounds, by contrast, may be scope-relative — §4 argues why.

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

* **OQ-1 — method-member syntax**: `{ toString(self): string }` (proposed — the `self`
  name is the discriminator) vs a keyword (`{ method toString: … }`).
* **OQ-2 — operator bounds**: deferred above; reopen when a real API needs to export a
  generic whose operator demand should be documentation-stable.
* **OQ-3 — accept Phase 2's scope-relative satisfaction?** The alternative (fields only)
  keeps bounds scope-independent but excludes UFCS, which is how std itself is written.
* **OQ-4 — bound spelling**: `<T: Showable>` (proposed) vs `x: T & Showable`.
* **OQ-5 — declaration-checking strictness**: may a bounded body use ONLY what bounds
  grant (proposed — it is what makes the errors good), or do bounds merely add to
  inference?

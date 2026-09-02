# Cross-language critique of `docs/identity-design.md`

**Angle: how other languages spell reference identity, and what their experience predicts for
VL.** One of several cross-examinations; this one says nothing about VL's rep layer or codegen
cost except where another language already paid for the same choice. Facts marked **(RUN)** were
measured on the live seed on **2026-09-01** from this worktree; other languages carry a source.

## Verdict — **yes, with changes**

The *semantics* survive this angle well. `===` as identity-vs-structure (not JS's
coercion-vs-strict), restricted to reference reps, with structural `==` left alone, is exactly
the rule Kotlin arrived at — except Kotlin got there by retrofitting **three** separate
diagnostics onto an already-shipped operator, and the proposal starts there. That is the
strongest thing in the document and §3 undersells it by crediting Swift, which contributes no
evidence at all (Swift structs are value types, so Swift users never face `p === q` on a
value-shaped type; VL users will, on day one). The *spelling* is the weakest link, and the
proposal does not know that the one language with a genuinely JS-adjacent population that
shipped `===` — Dart — **deleted it** in 2012 and told users to translate most occurrences to
`==`, not to `identical()`. That is not fatal, but §3's "used by large JS-adjacent populations
without incident" is not supportable as written. Two substantive holes: **P3 ("`Map`/`Set`
struct keys are structural") is under-specified in a way every comparable language had to fix
with a third equality relation** — VL's `==` is already non-reflexive over `f64` **(RUN)**, so a
struct key holding a NaN can never be looked up — and **§4.2's overflow worry is a
misclassification**: a serial used as a *hash seed* may collide freely (HotSpot has shipped a
31-bit identity hash for 25 years), and only a serial used as an *identity* needs `i64`. Fix
those four and the proposal is better grounded than most language decisions of this size.

## The comparison

| Language | Identity spelling | Defined on | Wrong-operand behaviour | Identity-keyed collection | Known footgun |
|---|---|---|---|---|---|
| **JS / TS** | `===` (identity only *incidentally*); `Object.is` = SameValue | everything; on objects it is reference, on primitives it is value | none — never an error; TS errors only on provably disjoint types | `Map`/`Set` use SameValueZero (identity for objects, value for primitives, `NaN` findable, `±0` unified); `WeakMap`/`WeakSet` | there is **no** structural option: `{a:1} === {a:1}` is `false` and users reach for `JSON.stringify` or lodash `isEqual` |
| **Swift** | `===` / `!==`, signature `(AnyObject?, AnyObject?) -> Bool` | class instances (and metatypes) only | **compile error** — structs/enums cannot conform to `AnyObject` | `[ObjectIdentifier: V]`; `ObjectIdentifier` is `Hashable` off the instance address (ARC does not move objects) | essentially none of this kind — the confusing case does not compile |
| **Kotlin** | `===` / `!==` | reference types | **three** diagnostics: `DEPRECATED_IDENTITY_EQUALS` (primitives), `FORBIDDEN_IDENTITY_EQUALS` (value classes), `IMPLICIT_BOXING_IN_IDENTITY_EQUALS` ("…can be unstable because of implicit boxing") | Java's `IdentityHashMap`; nothing Kotlin-native | boxed `Int?`: `100 === 100` is `true`, `10000 === 10000` is `false` (Integer cache −128..127). `===` on `String` is **allowed**. `Array.equals` is reference — needs `contentEquals` |
| **Java** | `==` — the *same* operator that means value equality on primitives | all reference types | none — never an error | `IdentityHashMap`, `System.identityHashCode` | the canonical one: `s1 == s2` on strings, true or false depending on interning |
| **OCaml** | `==` physical (`=` is structural) | everything, but meaningful only on boxed values — `1 == 1` is `true` (immediates) | none — silently unspecified for immediates and shared literals | **none built in.** `Hashtbl.Make` lets you set `equal = (==)`, but a moving GC gives no address hash, so the idiom is a hand-rolled `{ id : int; … }` serial | the *short* spelling is the structural one, so `==` reads as "the obvious equality" to a C/Java user. Also `=` does not terminate on cyclic values and raises on functional ones |
| **Python** | `is` / `is not`, `id()` | everything | none, but CPython ≥3.8 emits `SyntaxWarning: "is" with a literal. Did you mean "=="?` | **the default** — a user class gets identity `__eq__` and an `id()`-derived `__hash__`, so `dict`/`set` are identity-keyed unless you override. *Opposite* default from P3 | `a is b` is `True` for small ints (−5…256) and interned strings, `False` otherwise |
| **Rust** | `std::ptr::eq(a, b)`, `Rc::ptr_eq` / `Arc::ptr_eq` — **functions, no operator** | pointers/references | type error (you must already hold pointers) | none built in; `HashMap` needs `Hash + Eq`, identity via a pointer newtype (`by_address`) | `ptr::eq` compares address **and** pointer metadata, so two `&dyn T` to the same value through different vtables compare unequal (`Rc::ptr_eq` was narrowed to data-only in 1.76) |
| **Go** | `==` — **the type decides**: address on `*T`, field-wise on `T` | comparable types | **compile error** for uncomparable types (a struct containing a slice/map/func); **runtime panic** for an interface whose dynamic type is uncomparable | `map[*T]V` just works — the runtime hashes the pointer bits, and the GC is non-moving so addresses are stable | `==` silently changes meaning between `*T` and `T`; NaN map keys create permanently unreachable entries |
| **Dart** | `identical(a, b)` + `identityHashCode(o)` — a function. **`===` existed and was removed at M1, Oct 2012** | all objects | none — `identical(1, 1)` is `true` (canonicalisation), a soft version of Python's trap | `HashMap.identity()` / `LinkedHashMap.identity()` / `HashSet.identity()` — named **constructors**; `Expando` for weak side tables | `==` is overridable, so `a == b` can mean anything |
| **C# / .NET** | `object.ReferenceEquals`, `RuntimeHelpers.GetHashCode` | all reference types | none | `Dictionary<K,V>(ReferenceEqualityComparer.Instance)` — a **comparer parameter** (.NET 5+); `ConditionalWeakTable` | `==` is *overloadable* and `string` overloads it to value, so `==` on two `object`-typed variables holding equal strings is `false` — the static type picks the overload |
| **Haskell / Elm / Roc** | none exposed | — | — | — | none of this kind. But identity is used internally everywhere: GHC's `reallyUnsafePtrEquality#` and `System.Mem.StableName`, and Elm's compiled `_Utils_eq` opens with a JS `===` fast path |
| **VL (proposed)** | `===` / `!==` | reference reps only | **check error** | `IdentityMap` / `IdentitySet` via a whole-program serial field | JS reflex on struct operands — a silent `false` where `==` was meant |

## Findings

### 1 — P3 is under-specified, and `==` cannot be the key equality. VL's `==` is not reflexive. *(severity: high)*

**(RUN 2026-09-01)** `const n = 0.0 / 0.0; print(n == n)` → `false`; `print(0.0 == -0.0)` →
`true`; and for `type F = { d: f64 }`, two `F`s both holding that NaN → `p == q` is `false`. So a
struct key containing a NaN can never be found, and `{d: 0.0}` and `{d: -0.0}` are the same key.
P3 says keys are "structural, consistent with `==`" and stops there.

Every comparable language hit this and none resolved it by reusing `==`. **JS** invented
**SameValueZero** for `Map`/`Set` — a third relation, distinct from both `===` and `Object.is`,
in which `NaN` is findable and `±0` unify. **Java** made `Double.equals` deliberately disagree
with `==` (NaN equals itself, `0.0` ≠ `-0.0`) so `HashMap` works, and Kotlin's own equality page
says the same: when operands are not statically float-typed, "`NaN` is equal to itself" and
"`-0.0` is not equal to `0.0`". **Go** did nothing, and NaN map keys creating unreachable
entries is a standing gotcha. **Rust** refused the problem at the type level: `f64` implements
`PartialEq` but **not** `Eq`, so it cannot be a `HashMap` key at all.

**Recommendation.** P3 must name its key relation, and the cheapest fit for VL's habits is
Rust's: a struct is key-eligible only if every field is, and an `f64`/`f32` field makes it
ineligible with a message naming the field. That costs a rule and buys a total, reflexive
lookup. If you would rather keep floats keyable, say "SameValueZero-like" in the header and
accept a third equality relation. What is *not* available is shipping "structural" unqualified.

### 2 — Swift is not evidence; Kotlin is, and Kotlin's record is a retrofit, not a clean run. *(high)*

§3 cites Swift and Kotlin jointly and concludes "both used by large JS-adjacent populations
without incident". Swift's structs are **value types**, so `p === q` on a value-shaped type is a
compile error (structs and enums cannot conform to `AnyObject`). Swift's population therefore
never encounters the exact case that is VL's residual footgun, and contributes zero evidence
about it. Kotlin data classes *are* reference types with a generated structural `equals`, so
Kotlin is VL's situation precisely — the only row in the table that is. And Kotlin's record is
not "without incident": JetBrains' `DefaultErrorMessages.java` carries **three** identity-equality
diagnostics, all retrofits — `DEPRECATED_IDENTITY_EQUALS` ("Identity equality for arguments of
types {0} and {1} is deprecated" — primitives), `FORBIDDEN_IDENTITY_EQUALS` ("…is forbidden" —
value classes), and `IMPLICIT_BOXING_IN_IDENTITY_EQUALS` ("…can be unstable because of implicit
boxing").

**Recommendation.** Rewrite §3 to cite Kotlin alone, and reframe P1 as *Kotlin's three retrofits
adopted before the operator ships* — a stronger argument than the one currently made. Note the
third diagnostic is precisely the proposal's own §4.7 open question (union arms boxed in some
positions, bare refs in others): Kotlin has already told you that case needs its own message,
and roughly what it should say.

### 3 — Dart ran this experiment with a JS-adjacent population and reversed it. *(high)*

Dart shipped `===` / `!==` and removed them in the M1 transition (announced October 2012,
"Dart syntax changes landing soon, update your code"): *"The support for `===` and `!==` is about
to go away … you can change it to `identical(a, b) && !identical(c, d)`."* The migration note is
the interesting part: *"We usually prefer using the `==` operator instead of calling the
`identical` function, so unless you're really going for an identity check you may want to
translate uses of `===` to `==`."* Dart's own guidance assumed **most existing `===` uses were
not identity checks** — the JS reflex, observed on a real corpus by the team that migrated it.
Dart's audience (a JS transpile target, later Flutter) is the closest match to the JS-adjacent
population §3 invokes. Rust reached the same place from the other direction and shipped no
operator at all: `ptr::eq` and `Rc::ptr_eq` are deliberately named functions, on the argument
that identity is rare and should be visually loud. That transfers to VL unchanged.

**Recommendation.** This does not settle the spelling — `===` has real ergonomic value and P1's
rep restriction is a mitigation neither Dart nor JS had. But §3's "without incident" sentence
must go, and P6 must record that the closest precedent *reversed the decision*, so the owner
chooses against it knowingly. A hedge keeping both: ship `===` plus a default-on lint firing on
`a === b` where both operands are struct-typed and neither is `null` — the Python
`SyntaxWarning` play, catching the reflex at exactly the residual §3 admits.

### 4 — P1's error message is written for `i32` and is false for `string`. *(medium-high)*

The proposed text — `` `===` compares identity, and `i32` has none — use `==` `` — is true of
`i32` and **false** of `string`: a WasmGC string *does* have identity, and P1's own reasoning
(§2) is different — the identity is real but unstable and uninteresting. Kotlin needed two
wordings for exactly this distinction (`is forbidden` vs `can be unstable because of implicit
boxing`), and it matters more here because `s === "foo"` is the single most common `===` in all
JS code. Every JS user writing VL meets this error on day one; it is the highest-impression
diagnostic in the language.

**Recommendation.** Three arms. Scalars: "has no identity". Strings: "two strings with the same
characters may or may not be the same object — use `==`, which compares the characters".
Scalar-carrying unions: borrow Kotlin's "can be unstable because of boxing".

### 5 — §4.2's overflow worry misclassifies the serial: it is a hash seed, not an identity. *(medium-high)*

§4.2 treats `i32` wrap as a correctness bug — "wrap would make two live objects hash-collide
silently" — and prices `i64` at 8 bytes per object against it. Every production runtime
disagrees, because a hash collision is not an equality collision **so long as the bucket
comparison is `ref.eq`**. HotSpot's identity hash is **31 bits**, computed lazily by a Marsaglia
xor-shift, and is *still* 31 bits under JDK 25's compact object headers; it has been colliding
by the birthday bound in every large heap for 25 years without incident. V8 (a hash slot on the
receiver), the CLR (the sync block) and the Dart VM do the same at similar widths.

**Recommendation.** State in the container's header that the serial is a **hash seed** and that
lookup resolves the bucket with `ref.eq`. Then `i32` is right and §4.2's `i64` cost disappears.
If the design instead intends to compare serials *as* identity, say so — that is a different
design, `i64` becomes mandatory, and it is one no runtime in the table chose.

### 6 — Eager assignment is what no GC'd runtime does; the lazy variant is one branch. *(medium)*

JVM, V8, CLR and Dart VM all assign the identity hash **lazily on first use**, for the same
reason: the allocation fast path is the hottest path in the runtime, and most objects are never
identity-hashed. P4 is eager. VL's whole-program advantage genuinely narrows the blast radius —
only identity-keyed *types* carry the field — but within those types **every** allocation pays,
so one `IdentitySet` insertion anywhere taxes a hot struct type everywhere. The one eager
language in the table is OCaml, and only because it has no choice: moving GC, no address, no
runtime hash, so the `{ id : int; … }` counter must be in the type from the start. **VL is not
in OCaml's position — it can inject the field.**

**Recommendation.** Price the lazy variant in §4.2 (a `0` sentinel meaning "unassigned", one
branch at hash time, zero cost at allocation) rather than listing eager-vs-lazy as an open
question with no data. Four runtimes have run this experiment and all four chose lazy.

### 7 — P4 inherits `IdentityHashMap`'s documented flaw; adopt Java's disclaimer as a rule. *(medium)*

The `IdentityHashMap` javadoc is blunt: *"This class is **not** a general-purpose `Map`
implementation! While this class implements the `Map` interface, it intentionally violates
`Map`'s general contract, which mandates the use of the `equals` method when comparing
objects."* It also names its two intended use cases, and they are **exactly VL's**:
*"topology-preserving object graph transformations, such as serialization or deep-copying"* and
*"maintaining proxy objects"*. Serde decision D is the first of those verbatim; P4 is
well-founded. But the flaw is design-level, not documentation-level: if `IdentityMap<K,V>`
satisfies whatever protocol `Map<K,V>` does, generic code written against `Map` silently changes
meaning when handed one. The alternatives do not escape it either — C#'s
`ReferenceEqualityComparer` passed to `Dictionary` produces a value that *is* a `Dictionary`,
and Dart's `HashMap.identity()` *is* a `HashMap`, so both make the substitution **invisible at
the type level** rather than merely undocumented.

**Recommendation.** Keep P4's separate type — the only shape where the substitution is visible
to the checker — and add the rule: `IdentityMap` does **not** satisfy `Map`'s interface. Also,
§4.5 lists two alternatives when there are three: Dart's **named constructor**
(`HashMap.identity()`) dodges the std rubric's boolean-parameter objection without a second type
name, and deserves a line even though I would still choose the separate type.

### 8 — The motivating shape does not work with `==` today either, and identity is what makes structural equality terminate on it. *(medium)*

The owner's framing was cyclic dependencies. Measured **(RUN 2026-09-01)**:
`type N = { v: i32, next: N | null }` — `a == b` is a **check error**, `N isn't equatable (a
field is not value-comparable)`. The recursion is not the ingredient: a plain
`type W = { v: i32, o: L | null }` over a non-recursive `L` refuses identically. And
`type T = { v: i32, kids: T[] }` is **check-clean and then fails at emit** —
`emitProgram: unsupported struct field type in equality`, a clause-2 violation sitting on the
exact shape this proposal exists for, and absent from the document.

Not a VL accident. Structural equality over a cyclic reference graph is **non-terminating** in
OCaml (`=` loops), StackOverflows through Java's generated `equals`, and survives in Python only
because container comparison does `x is y or x == y` per element — an identity check *before*
the structural one. The importable result: **identity is the base case that makes structural
equality total on cyclic data.**

**Recommendation.** §1 should say the motivating shape is not merely un-*askable*, it is
un-*answerable* — `==` refuses it. And when P3's struct-key lowering reaches recursive types,
record that the identity shortcut is not an optimisation, it is the termination condition.

### 9 — For maps, `===` is not an extra comparison, it is the only one. *(low-medium)*

**(RUN 2026-09-01)** `{[string]: i32} == {[string]: i32}` is a check error with a design
rationale: *"a map has no defined value equality: its entries are insertion-ORDERED and
observable that way … so `==` would have to pick between order-sensitive and set-like."* So
today there is **no way to ask any equality question about two maps**. P5 frames "arrays, maps
and function values are `===`-comparable but not identity-keyable" as a *limitation*; for maps
it is a strict gain, and the clearest independent motivation for the operator in the document.
(Java defines `Map.equals` structurally, JS gives you only `===`; VL currently gives neither.)
**Recommendation:** move it into §2 as positive motivation, not into P5's list of losses.

### 10 — A15's wording for function equality does not match the measured behaviour. *(low)*

`DECISIONS.md` A15 says function-valued fields compare "by reference (same function + same
captured env)". Measured **(RUN 2026-09-01)**: for `function mk(n: i32) { return (x: i32) => x + n }`,
`mk(1) == mk(1)` is **`false`** — same code, equal captured environment, two closure
allocations. It is allocation identity, not "same function + same env". (`const c = a; a == c`
is `true`; `const a = f; const b = f; a == b` is `true` because there is one closure.) The
behaviour matches JS, Dart and Kotlin and is right; the *sentence* promises something stronger
that nothing implements, and P2 is about to make it directly observable. **Recommendation:** fix
A15's parenthetical to "the same closure object" in the same ruling.

## Answers to the proposal's own questions, from this angle

**Is the Swift/Kotlin precedent the closest?** Kotlin yes, Swift no — finding 2. Swift structs
are values, so "two value-shaped things, structurally equal, referentially distinct" does not
compile there and generates no experience. Kotlin data classes are references and it does.

**Should strings be `===`-comparable?** **No — P1 is right, and this is the highest-confidence
call in the document.** Java's `s1 == s2` is the most-taught bug in the industry; Kotlin allowed
`===` on `String` and inherited it; Python's interning trap is the same shape one level down.
Every language that permitted it regrets it, none that forbade it regrets that. The only cost is
that `s === "foo"` — the commonest `===` in JS — becomes a compile error, which is a
message-quality problem (finding 4), not a design one.

**Does `IdentityMap` as a separate type beat a comparer parameter?** Yes, on visibility: Java's
separate type makes the contract break checkable, while C#'s comparer parameter and Dart's named
constructor both produce a value whose *type* still says `Dictionary`/`HashMap`. The javadoc
shows what the separate type costs — it must announce that it violates the interface — and that
is worth paying; finding 7 has the rule that comes with it.

**What did languages that shipped an eager per-object serial learn about cost and overflow?**
Almost none shipped eager — the four production GC'd runtimes are all **lazy** (finding 6), and
the one eager idiom, OCaml's `{ id : int }`, is eager only because OCaml cannot add the field
later. On overflow: nobody treats it as a correctness concern, because the serial is a hash and
equality is a pointer compare — HotSpot's 31 bits have always collided (finding 5). Overflow
becomes a bug only in a design where the serial *is* the identity, which no one chose.

## What this angle cannot see

* **Whether `ref.eq` defeats Heap2Local** (§4.1). A `wasm-opt` measurement on VL's own output;
  no language in the table compiles to WasmGC, so none of them predicts it.
* **The serial's real cost in VL.** I priced it against what runtimes chose, not against VL's
  allocation sites. The whole-program restriction may make eager cheap enough that finding 6 is
  moot — but that needs an allocation-site count, not a precedent.
* **§4.3 (generics) and §4.4 (newtypes).** Questions about VL's monomorphizer and branding; the
  nearest analogues (Kotlin value classes, Swift generic constraints) are close enough to
  mislead rather than inform.
* **§4.7's union-rep question.** Kotlin's `IMPLICIT_BOXING_IN_IDENTITY_EQUALS` says a *message*
  is needed; it says nothing about whether the `{tag, payload}` box or the payload is the right
  `ref.eq` operand.
* **§4.6 (liveness).** Every identity-keyed container in the table has a weak sibling —
  `WeakMap`, `Expando`, `ConditionalWeakTable`, `Ephemeron`, `NSMapTable` — strong evidence the
  need is real and recurring, but WasmGC has no weak references, so the precedent cannot be
  acted on. A reason to keep the naming's door open, not to change v1.
* **Whether the JS reflex actually costs VL users anything.** Dart's migration note is evidence
  that `===` gets written where `==` is meant; I have no VL corpus to check it against. Settling
  it means a lint run over the tree after the operator lands, not more history.

### Sources

[Kotlin — Equality](https://kotlinlang.org/docs/equality.html) ·
[JetBrains/kotlin `DefaultErrorMessages.java`](https://github.com/JetBrains/kotlin/blob/master/compiler/frontend/src/org/jetbrains/kotlin/diagnostics/rendering/DefaultErrorMessages.java) ·
[Java `IdentityHashMap` javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/IdentityHashMap.html) ·
[Dart syntax changes landing soon (Oct 2012)](https://news.dartlang.org/2012/10/dart-syntax-changes-landing-soon-update.html) ·
[Dart — Operators](https://dart.dev/language/operators) ·
[JVM Anatomy Quark #26: Identity Hash Code](https://shipilev.net/jvm/anatomy-quarks/26-identity-hash-code/) ·
[OpenJDK Lilliput — Compact Identity Hashcode](https://wiki.openjdk.org/spaces/lilliput/pages/124256303/Compact+Identity+Hashcode)

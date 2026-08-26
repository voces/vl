# VL — Design Decisions

Decisions where the **rationale isn't recoverable from the code**.
Implementation detail lives in the code, git history, and `docs/`; this file is
the "why we chose X over Y." Keep entries terse (≈2–4 lines) — the decision and
rationale, not a code walkthrough. Append new entries under the relevant
section. Roadmap items reference these by their tag (e.g. A15, B14).

_(Consolidated from ROADMAP.md, 2026-06-05.)_

## Types & semantics

- **Structural identity ignores FIELD ORDER — except for flat types** (owner ruling
  2026-08-19). `{a: i32, b: i32}` and `{b: i32, a: i32}` are the same type, and the
  emitter's shape dedup keys on a sid-SORTED `(field name, field code, element, map-key
  bit, atom bit)` multiset so that order cannot change the identity. Until this ruling the
  property was EMERGENT — it fell out of matching each queried field by name — rather than
  stated, which is why the sort is now deliberate and commented as the rule it enforces.
  **The exception is FLAT types, where field order IS the byte layout**, so a permuted twin
  is a different layout and must not dedup. *(Open: confirm "flat" means the buffer/view
  family, and pin a fixture proving a flat type does not dedup with a field-permuted twin —
  nothing enforces the exception today.)*

- **A declared alias and its inline spelling are the SAME TYPE; the DIAGNOSTIC shows the
  LOCAL spelling** (owner ruling 2026-08-19). `type A = {v: i32}` and a bare `{v: i32}`
  denote one type, and the compiler may merge their rows freely — this is what licenses the
  emitter's arena-keyed row lookups, where two structurally identical rows interned under
  different spellings resolve to whichever comes first. **But a message must render the
  spelling the user WROTE at that position**, not whichever spelling the merged row happens
  to carry: being told about `A` when you wrote `{v: i32}` is confusing, and the merge is an
  implementation fact the reader has no way to know. Owner direction is additionally that a
  reader should be able to DIVE into a spelling's depth — `A` by default, expanded to
  `{v: i32}` on demand — rather than the compiler choosing one level for them. *(The
  local-spelling renderer and the depth affordance are both unbuilt; the merge itself is
  live.)*


- **Fully typed, no `dynamic`.** Types are hidden by aggressive inference, but
  `Unknown`/`Infer` are inference _holes that resolve_ to concrete types — there
  is no gradual/untyped escape hatch. Blueprint: Elixir v1.20 set-theoretic
  types. (A0)
- **`==`/`!=` are structural (by value) by default.** `{x:1} == {x:1}` is `true`
  — consistent with numerics and strings and VL's value semantics.
  Function-valued fields compare _by reference_ (same function + same captured
  env): "data by value, functions by identity." A custom `==` overrides. (A15)
- **Referential identity gets its own spelling.** `is` is reserved for
  type-narrowing, so an O(1) `ref.eq` identity check would be `===` or
  `identical(a, b)` — deferred. (A15)
- **Bare literals default to their base type.** `let x = 0` is `i32`, not the
  singleton `0`; the literal type survives only via an explicit annotation
  (`let x: 0 | 1`). (A16)
- **A literal in an f32 context is admitted when f32 holds the best
  representation of what was WRITTEN** — which means the two literal kinds take
  different rules, by force rather than for symmetry. A `.` literal is
  *context-typed*: it is f32 from birth and rounds ONCE at 24 bits (never
  decimal→f64→f32; the two differ, and
  `tests/cases/numerics/f32-literal-single-round.vl` is the witness). Gating it on
  exactness instead would reject `0.1`/`3.14` and leave nothing to admit. An
  INTEGER literal is *exactness-gated*: it denotes an exact integer, so admitting
  one f32 cannot hold would be the silent lossy conversion the lossless-only rule
  exists to forbid. Escape hatches stay one token (`16777217.0`, or `as f32`), so
  the gate removes silence, not reach. Chosen over C/Rust's uniform
  context-typing, which loses the digit without a word. (webcraft P2)
- **`let x = null` is a nullable hole, not the `null` type.** `null` is
  hole-bearing like `[]` (it inhabits every `T | null`), so its `T` is inferred
  from later usage and the initializer contributes the `| null`: `let x = null;
  x = 5` ⇒ `x: i32 | null`. This fills an open hole — NOT a pin violation: VL
  pins _complete_ types (`let x = 7; x = "foo"` errors, no `i32 | string`
  widening), but `null` isn't complete, so assigning into it selects its `T`
  rather than conflicting. Flow-narrowing strips the `| null` on paths where `x`
  is definitely assigned (no null tax on the straight-line case); an
  unconstrained `let x = null` resolves to `null`. Chosen over the
  consistent-but-annotation-heavy alternative (exact `null` type, write
  `let x: T | null = null`) so the conditional-assign idiom
  (`let x = null; if c { x = f() }`) works annotation-free. `null` is the one
  scalar literal treated as hole-bearing. (A-infer-null)
- **Uninitialized `let x` / `let x: T` is non-null + definite-assignment-checked,
  not implicitly null.** A read where `x` is not provably written on every
  preceding path is an error ("used before assigned"); the declaration itself is
  fine — the _reads_ are gated. Chosen over implicit-null (which would tax every
  declare-then-assign binding with a sticky `| null` and null-check noise) and
  over mandatory initializers (a dummy `= 0` masks the forgot-to-assign bug that
  definite assignment catches). Closes a live soundness gap: today
  `let x: i32; return x` compiles and returns a silent `0`. Reuses the
  CFG/narrowing machinery the `is`-guards already need. So the three let-forms
  are distinct: `let x = null` (nullable, initialized), `let x` / `let x: T`
  (non-null, must-write-before-read), `let x = expr` (type from `expr`).
  (A-definite-assign)
- **Literal unions are the enum idiom — no separate `enum` construct.**
  `0 | 1 | 2`, `"expense" | "reimbursement"`. (A16)
- **`?.` is null-only.** Optional chaining guards `null`, not a union variant —
  a value-union arm (`foo: i32 | {x}`) is discriminated with `is`. So a `null`
  result always means "the receiver was null," never "wrong variant." (A5)
- **Bodyless `type Point` is a clean error.** A bodyless `type` decl is a
  diagnostic, not a silent self-referential alias. (A14)
- **A nominal type is `type N = new B`, and it is ERASED.** `new` is a
  CONTEXTUAL keyword (only after a `type` declaration's `=`), so it stays a legal
  identifier everywhere else. The brand is a checker-side arena-index sidecar —
  the arena stays structural — and the emitter never learns the name, because
  canon's alias-transparency arm has already rewritten the annotation to its base
  by the time it runs. So a newtype has NO wrapper, NO private heap type, and no
  emitter file knows it exists. A syntactic LITERAL is brand-polymorphic (it has
  no prior identity to confuse); a VARIABLE needs `as` in either direction;
  same-brand arithmetic keeps the brand and a mixed pair rejects. This
  deliberately does NOT take the forward-compat seam below: injecting nominal
  identity into `repCanonKey` would cost a wasm type per declaration and break
  the byte-identity that IS the zero-cost claim. That seam stays right for a
  future OPAQUE type that needs runtime identity.
  (A14 / webcraft P1.5 → `docs/internals/newtype-design.md`)
- **Object-literal field-value mismatches are errors, except behind an alias
  leaf.** `ensureType`'s `Object` case raises on a wrong-typed field value
  (`{ value: i32 }` given `"x"`). It stays lenient _only_ when the
  expected/actual field type resolves to a user-`type` alias leaf (a `Type`
  wrapper) or `Never`: an object literal is a bare `Object`, so checking it
  against a recursive alias arm (`left: Tree | null`) hits the
  `Type`-vs-bare-`Object` false-negative the A11 traversal depends on, and
  `Never` is an upstream-error placeholder. Tightening only the non-alias-leaf
  case closes the soundness gap without re-introducing infinite recursion on
  self-references. (A12)
- **Type negation is `!A`, not `not A`; the negated guard is `x !is T`.**
  Surface syntax for the intersection/negation algebra: `A & B` (intersection,
  binds tighter than `|`), `!A` (negation, prefix, binds tighter than `&`), and
  `x !is T` (negated type-guard). Rationale: VL already chose `!` over the `not`
  keyword for boolean negation (B10), so a single negation token across values,
  types, and guards keeps the surface consistent and reintroduces no `not`
  keyword. `x !is T` follows Kotlin's `!is` (negate the operator) over C#'s
  `is not` / `is !T` — it reads cleanly and stays `!`-consistent; it desugars to
  the existing `is` node with a `negated` flag and mirrors `is` narrowing
  (then-branch subtracts `T`, else-branch narrows to `T`). Surface type negation
  is rare across languages (TS has only the named `Exclude<A,B>`; set-theoretic
  systems write `¬t`/difference internally) — Whiley is the main precedent for a
  `!`-style negation type. (A3/A4)
- **`const` = immutable binding, `let` = reassignable (JS/TS semantics),
  enforced.** `const x` cannot be rebound (`x = …`, `x++`/`x--` are errors);
  `let x` can. This corrects an earlier inverted state where `const` was the
  reassignable form and immutability wasn't enforced at all. Rationale: match
  the overwhelmingly familiar JS/TS meaning rather than surprise every newcomer.
  **Binding mutability is a distinct axis from data mutability:** `const`
  governs only whether the _name_ may be rebound — the data behind it may still
  mutate (`const o = {…}; o.x = 2` and `a[i] = …` stay legal). Read-only data
  and deep immutability ride a separate axis (A9 `readonly` + immutable value
  types like strings), not the binding keyword. Follow-up: the `prefer-const`
  lint (PR #75) must be re-pointed to flag an unmutated `let` (suggest `const`)
  once both land.

- **`void` is a real type in the lattice — a unit type wearing the `void`
  spelling — and it is NOT `null`.** The keyword stays (no churn, and it reads
  as every C-family author expects), but the checker treats it as a type with a
  single value rather than a marker for "no type". Four consequences, ruled
  together because they are one root: (a) `return <void expr>` is legal in a
  void function and lowers to `expr; return`; (b) a function value is
  **covariant in a void return** — `() => i32` is assignable to `() => void`,
  i.e. a caller may discard a result; (c) a type parameter may instantiate at
  void, and the monomorphizer emits an empty result for that instance; (d) void
  stays **non-storable** — no `void[]`, no `void | i32`, no void map value.
  Chosen because languages that make void a keyword instead of a type (Java,
  C#, C++) all grow the same hole at generics and then need a `Void`/`Unit`
  patch, while the ones that made it a real unit type (Rust `()`, Kotlin/Scala
  `Unit`, Swift `Void`) need no special case anywhere — and VL had already hit
  the Java hole (`function call<T>(f: () => T): T { return f() }` at `T = void`
  was `vl check`-clean invalid wasm). Explicitly NOT unified with `null`:
  `T | null` is the absence idiom in the errors-as-values design, so a void
  function returning `null` would make `if writeFile(p) == null` look like a
  failure check that is unconditionally true. (d) is what #1435's `void | i32`
  join gate was already enforcing; it stays, and its justification becomes
  "unit has no representation" rather than an ad-hoc refusal. Point (b)
  retires the `done()` wart — `beforeEach(() => { hits = hits + 1 })` failing
  with `expected () => void, got () => i32` — without disturbing the
  assignment-is-an-expression rule below, which is what produces the `i32`.
  (#1435, ROADMAP `:746`)


- **Variance and exactness: inferred, with no annotation surface in v1.**
  Parameters are Inexact by default and values Exact (A8); `Readable`/
  `Writable` are applied automatically during parameter inference (A9), with no
  spelling an author writes. The defaults are the owner's own, from
  `docs/guide/language-todo.md:15-20`; what is decided here is the **surface**
  (none) and the **migration** (nothing to migrate). The migration half was
  settled by measurement rather than preference: the population of programs an
  A9 tightening could break is empty of *working* programs. Every container
  subtype→supertype passing shape is already in a failing column — the struct
  width family (`Cat[]` → `Animal[]`, writing body, read-only body, or an
  un-annotated source) is a loud reject behind #1456's width gate, and the
  union-widening family (`i32[]` → `(i32|null)[]`, `K[]` → `string[]`) is
  `vl check`-clean invalid wasm in BOTH directions. So A9's Writable half only
  moves cells up a column (check-clean invalid wasm → loud reject) and harms
  nothing, while its Readable half is blocked on **representation**, not on
  this ruling: `peek(xs)` reading an `i32[]` as `(i32|null)[]` is sound, the
  checker already agrees, and the emitter cannot express it (different WasmGC
  array types, no conversion). An annotation is wanted later, for one reason
  worth recording so it survives: with inference alone, variance is a property
  of a function's BODY, so adding a `.push` to a body silently breaks every
  caller and the error lands at the call site rather than at the change. That
  is an API-stability argument that only bites once there are cross-module
  consumers, and the annotation is additive, so it waits. (A8, A9)


## Memory, runtime & object model

- **A `string` is UTF-8 BYTES behind a slice header, and the surface is
  BYTE-INDEXED.** `s[i]` is a byte (0–255, O(1)), `.length` is the byte count
  (O(1)), `slice(a, b)` takes byte offsets and returns an O(1) view; code points
  come from `for cp in s` (a UTF-8 decode with a variable stride), `s.cpAt(i)`
  (O(1), at a BYTE offset) and `s.cpLen()` (O(n), named so the cost is visible).
  `s.bytes()` is the storage as a `u8[]`, `s.isCharBoundary(i)` an O(1) bit test.
  This puts VL in the Go/Rust camp and was taken on measurement, not taste: a
  census of `compiler/*.vl` found **zero** true random-access indexed string
  reads (63% sequential, 29% length-relative, 8% constant), so code-point
  indexing's whole purpose — O(1) access by character — had no demand, while its
  price was an ASCII fast-path flag and an **O(n²) indexed-loop cliff** that
  triggered on exactly the input an English-speaking developer never tests.
  Validity is **Go-lean**: no boundary validation, slicing off a character
  boundary is legal, and a malformed sequence decodes leniently to U+FFFD —
  never a trap, never a rejection. `fromCodePoints` SUBSTITUTES U+FFFD for a
  value with no UTF-8 encoding (a lone surrogate, out of range, negative),
  because the storage cannot hold one and dropping it would change `.length`
  undetectably; `print` agrees with it rather than dropping. Measured: 40 M live
  ASCII characters cost 161 MB of backing before and 44.6 MB after (3.6×, 4× on
  the character payload alone). (`docs/guide/strings-design.md`, Stage 2c)
- **Allocation = WasmGC.** Heap values (closures, objects, arrays, strings) are
  WasmGC structs/arrays; linear memory is an opt-in escape hatch;
  escape-analysis stack allocation is a later optimization. Lean on binaryen's
  Heap2Local rather than hand-rolling SROA. (B1)
- **No second, self-managed object model — linear memory stays ONE scoped tier.**
  A linear-memory heap would unlock what WasmGC structurally forbids (SIMD over
  bytes, inline aggregates, slices-as-views, explicit free), but it costs a
  hand-written tracing collector plus a shadow stack on every call (wasm cannot
  scan a frame's locals for roots) and it retires the wasm validator as VL's
  memory-safety proof — today an emitter type confusion is a loud invalid module.
  A whole-program "own memory" mode would also double the corpus/fuzz/fixpoint
  surface for a mode almost nobody would pick. The scoped alternative (a `Buffer`
  escape for FFI/SIMD/bulk-I/O inside a GC program) gets most of the win for one
  type. The one argument that WOULD justify a real second backend is running on
  non-GC engines (WAMR/wazero/wasm2c) — a distribution call, not a perf one.
  (`docs/internals/memory-gc-design.md`)
- **The collector is a RUNTIME knob, never language surface.** `vl run` defaults to
  the engine's tracing collector; `$VL_GC` (`auto|tracing|refcount|none`) overrides
  it. Deferred reference counting — the previous default — is ~21× slower on
  allocation-heavy code and, because it cannot reclaim cycles, holds ~175× the
  memory on cyclic garbage. An env var rather than a `--gc` flag because the engine
  is built before any guest code runs and all `vl` flag parsing lives in the guest.
  Nothing in a `.vl` file may depend on the choice: a module shipped to a browser
  gets whatever that engine provides. The compiler's own null collector (one-shot
  batch work) stays internal and is NOT routed through the knob.
- **Keep binaryen (unlike antlr4).** Pure WASM/JS, does the IR/validate/optimize
  heavy lifting, and is a library binding that does _not_ block self-hosting —
  it stays for the TS compiler. (Track B)
- **Struct heap-type identity is STRUCTURAL: structural twins share one WasmGC
  heap type.** VL is structurally typed — `type A = {v:i32}` and `type B = {v:i32}`
  are THE SAME type (the checker accepts a `B` wherever an `A` is expected), so they
  MUST share one heap type. Minting a distinct heap type per declared alias was an
  active soundness bug: a `B`-value flowing into an `A`-typed slot emitted an
  un-instantiable module (`expected (ref $A), found (ref $B)` — the checker accepted
  it, codegen produced invalid wasm). The emitter now dedups struct slots by the
  cycle-terminating canonical key `repCanonKey` (full traversal; de Bruijn back-edge
  tokens make recursive twins `type L1={n:L1|null}` / `type L2={n:L2|null}` share a
  key), guarded by an emitter field-CODE match so a key collision whose emitted
  LAYOUT would differ (an atom-backed litunion field vs a string one) never merges.
  Each alias keeps its own `sNames` entry and field table (so diagnostics still read
  the declared name); only `sHeapIdx` collapses — twins get one heap-type index
  (`sTwin`, built in `buildStructTwins`). Non-twins (`{f:i32}` vs `{f:i64}`) keep
  distinct keys and slots. This SUPERSEDES the earlier nominal-slot framing: nominal
  names are a WasmGC implementation detail (heap types need names), not semantics.
  A14 forward-compat: a future nominal/opaque type opts OUT of dedup by injecting
  its nominal identity into `repCanonKey`, giving it a unique key and a private heap
  type — no other change needed. (structural slot dedup, roadmap Next#1)
  The same dedup extends to the REF-LIST table: a ref-list's (backing, wrapper) pair
  is structurally uniform across element kinds, so two slots resolving to the same
  element heap (`A[]` and `B[]` after struct dedup) emit identical pairs and share
  one wrapper (`rlTwin` → shared `rlBackIdx`/`rlWrapIdx`) — fixing the same
  invalid-wasm crossing one list level up (a `B[]` passed where an `A[]` is
  expected). The map-array element and any unresolved element stay unique (the
  map-struct index interlock); non-twins (`i32[]` vs `i64[]`) keep distinct element
  heaps and wrappers. (structural slot dedup, ref-list layer)
  The dedup is CANONICAL, not just nominal: an INLINE-SHAPE slot (a `{v:i32}` field
  shape `collectNestedFieldShapes` interned BEFORE its declared twin existed) keys
  into `buildStructTwins` by resolving its spelling through the checker's name
  grammar to the same `repCanonKey` vocabulary, and a shape SPELLING with no
  `sNames` entry of its own (deduped onto the declared struct at intern time)
  resolves through the layout-guarded structural bridge (`structIndexOfTypeName`,
  tightened with the field-TYPE compat check) at the ref-array classification /
  element-heap / twin-sig sites. Lookup follows the same nominal-fast-path,
  canonical-fallback pattern: `rlSlotByName` falls back to the slot whose element
  is a canonical-key + field-code layout twin (`repStructSlotsTwin`) with matching
  `| null` niche parity. The bridge is GATED on a DECLARED twin (`nameIsStructDecl`):
  a spelling matching only an anonymous-literal shape keeps its loud reject — the
  union-arm narrow machinery it would newly enter still mis-lowers an inferred
  closure-call binding's read (roadmap repOf item (d)). (structural slot dedup,
  ref-list canonical layer)
  The MAP-VALUE table joins the same discipline. A map-value slot's 7-field map
  struct varies ONLY in its vals-list wrapper, so slots whose VALUE types are
  layout twins share one `mvMapTypeIdx` (`mvTwin` — `repMapValSlotsTwin`: the
  canonical value key via `repNameCanonKey`, guarded per value KIND by the layer
  that owns the rep — `repStructSlotsTwin` for struct values, `rlSlotsLayoutTwin`
  for list/nested-map values, kind identity for the singleton scalar/string/box/
  closure vals lists). The vals ref-list's map-element sig keys on the canonical
  mv representative (`mvCanonRepOf`), so a twin propagates through nested maps
  and lists of maps; and the union-box tag (`mapSlotTag`) + arm-slot guard
  (`unionHasMapArmSlot`) canonicalize through the SAME representative — keying
  the tag on the nominal slot would make a twin-spelled `is {[string]: {v:i32}}`
  silently miss its `{[string]: A}` carrier once the heaps merged, so tag
  identity and heap identity move together. (structural slot dedup, map-value
  layer)
  VARIANT structs complete the slot layers, deduping by the same two layers
  (`buildVariantTwins` → `uVarTwin`/`uVarHeap`: the canonical variant key via
  `repNameCanonKey` + a per-field storage guard whose ref-bearing field codes
  delegate to their layer's twin equivalence — ref-list fields to
  `rlSlotsLayoutTwin`, nested-struct fields to `repStructSlotsTwin`, map fields
  to the canonical mv representative); the arithmetic `uVarIdx + vi` heap
  identity is retired for the table (`uVarIdx` deleted). Twin keys are computed
  ONCE per slot (`buildStructTwins` discipline) — the compiler's own unions
  carry hundreds of variants, so a per-pair key recomputation is the audit's
  hot-path anti-pattern. This closed a REAL trap: a `Cat` boxed into
  `Kot | Bird` (a structural-twin arm) already PASSED the tag compare
  (`variantSig` keys on field names, so twins share a tag by construction) but
  the narrowed read's cast targeted the twin's distinct heap type — with one
  shared heap type, tag and cast agree. The SAME variant name declared in two
  unions (each push minted its own heap type) is the degenerate twin and now
  emits once. The variant⇄struct-TABLE seam (a declared struct twin in a
  variant-arm position) stays nominal — chartered as repOf item (e), wanting
  the #911 declared-twin gate at the variant resolvers. **That gate is now taken
  at two resolvers and the pair is worth reading together, because it is ONE
  predicate in two spellings.** `rlElemStructRow` declines for an element NAME the
  variant table claims and the struct table does not (D32); `shapeNominalOfTy`
  asks the variant table by ARENA IDENTITY (`variantRowOfTy`) where it already
  asked the struct table that way (D33). Same rule, one keyed on the name and one
  on the arena index, each placed AFTER its struct-table twin so struct-row
  identity still wins where it exists. **What both are for is the same thing: a
  NOMINAL question must not be settled by whichever STRUCTURAL rung happens to
  fire first.** A layout twin is claimed by every structural rung by construction,
  so rung ORDER was the whole answer in both — which is why neither fix is a
  tightening of the structural matcher. No tightening could work: `repRowOfTyStruct`
  and the field-set scans cannot tell `Circle` from `Dot`, and that is the point of
  keeping the seam nominal rather than a shortcoming of theirs. The declines this
  buys are exactly the ones the `tySame`-membership refusal below asks for.
  **The residue is where NEITHER table owns the name**: an ANONYMOUS shape has no
  declaration identity, both arena rungs correctly decline, and the structural
  scans decide it with nothing to break the tie (D36). That is a real remaining
  cell of the class and it is not reachable by a third rung of this shape — it
  needs the seam to answer a question about a value with no nominal identity at
  all. (structural slot dedup, variant layer)
- **The shape-INTERN table keys on field CODES (layout), not `repCanonKey`
  (structure); the two are deliberately separate layers.** `annShapeIndexOf` is a
  LAYOUT table — two structurally-identical checker types can lower to DIFFERENT
  layouts (an atom-backed litunion field `type K="a"|"b"` vs an inline `"a"|"b"`
  string field), and the emitter must keep them apart. `repCanonKey` equates them,
  so it is confined to the heap-dedup layer, where `structFieldCodesEq` re-imposes
  the layout guard before any merge. "Recursive structural interning" is this
  two-layer split (field-code intern + structural heap dedup, with the per-field
  recursive element-text comparison in `annShapeIndexOf` separating nested reps) —
  NOT a single `repCanonKey`-keyed intern, which would over-merge distinct layouts.
  Verified complete: `{f:i32}`/`{f:i64}`, deep same-shape, union-of-shape, and
  generic `Pair<i32,i64>`/`Pair<i32,i32>` all stay distinct and lower correctly. The
  remaining rep-fuzz families are genuine MISSING reps in composition (typed-value
  maps, 2-D arrays, nullable-list-in-field, struct-through-list, composite closure
  results), not intern losses — see `docs/internals/rep-fuzz-findings.md`.
  (structural interning, roadmap Next#1)
- **No `this` keyword.** A method is a function whose first parameter is `self`
  (Rust-style); `o.f(a)` is sugar for `f(o, a)` (UFCS). `self` is an _explicit,
  optional_ marker: first param `self` → a method reachable as `o.f()`; no
  `self` → a plain function, not reachable through an instance (no namespace
  pollution, crisp errors, the method-vs-static split for free). `o.f()`
  resolution: a callable _field_ wins (container/data, no receiver), else a free
  `self`-function, else error. Receiver is any expression (incl. literals).
  Mutation is free (objects are refs); "may a method mutate its receiver?" is an
  A9 variance question, not a receiver one. (B14)
- **One lambda form: `function(params) body`.** No bare `(params) body` (arrow
  ambiguity); an explicit `=>` arrow is deprioritized (purely cosmetic — no
  `this` to rebind). Declaration-vs-value: a top-level `function` monomorphizes
  per call site (polymorphic across shapes); a `let`-bound lambda is a
  single-signature closure value (monomorphic, pinned by use). (B15)
- **Only `!`, not `not`.** Logical operators are symbolic (`&&`/`||`/`!=`); the
  lone word operator was dropped. (B10)
- **One binding per name per scope** (no ad-hoc overloading for now); nested
  shadowing is allowed. (B16)
- **Operator / call / index dispatch via well-known methods**, resolved
  statically (no runtime `Proxy`): `"+"`, `"()"`, `"[]"`/`"[]="` are typed
  methods in a shape's contract. (B13)
- **Index operators are FREE functions dispatched by receiver type, and are the
  one place ad-hoc overloading is allowed.** `function "[]"(self: T, i: I)` beats
  a closure FIELD because it is a direct call rather than an indirect one through
  a per-value allocation. Several may share an operator — one per receiver — which
  the general no-overloading rule above forbids for named functions; the exception
  is bounded by there being no name to overload (a bracket names nothing, so the
  receiver type is the only possible key) and it is what lets two nominal newtypes
  over one structure carry different operators. The `self` annotation is required:
  it IS the dispatch key. (B14)
- **Size members follow the uniform-access principle.** `length` is a contract
  member via property syntax, dispatched to a native lowering (not a structural
  field — that broke index-sig subtyping). Property syntax (no parens) is
  reserved for O(1) members (`length`/`count`); computing ops
  (`push`/`map`/`slice`) are methods (parens). `length` is read-only; sparse
  collections use distinct `count`/`extent`, never an overloaded
  `length`. (B6)
- **No public `.capacity`.** Capacity exposes the growth strategy — a leaky
  detail scripting languages (Python/JS/Ruby/Lua) hide and only systems
  languages surface; VL is scripting-feel. The `cap` field stays internal (push
  needs it). Removing it also lets build-loop fusion pick any representation
  without an observable contract. (B6)
- **Build-loop fusion: pre-sized indexed fill, not per-element push.**
  A loop building a fresh local list by one push per iteration — `for i in A to B
  [step S] { a.push(e) }` or the counter-`while` `while i <cmp> N { a.push(e);
  i = i ± C }` — lowers to one pre-sized backing + an in-range fill loop. A
  frontier `array.set` at the moving `len` carries a bounds check the engine
  can't elide (~3.8x a sequential in-range write it can); fusion turns the former
  into the latter. A counter-while IS a for-range (`i < N` ⇔ `i ≤ N-1` for
  integers), so both feed one (from, inclusive-to, const-step) descriptor → one
  fill core, rather than per-shape matchers. Sound because the result is
  bit-identical to the push build and the guards forbid any mid-build observation
  (fresh array-literal local, untouched until the loop; body exactly one push;
  `e`/bounds free of `a`); anything unproven falls back to push. The list is
  rebound at the loop (the tiny initial backing is discarded) so the recognizer
  can sit at the loop and tolerate an intervening counter declaration.
  Field-target lists, multi-loop builds, and `for…in` are not yet covered. (B6b)
- **String-accumulation fusion: buffer-and-materialize, not per-`+` concat.**
  > **REGRESSED — THIS DOES NOT SHIP. Read this note before relying on the entry
  > below.** B7b was implemented in `compiler/toWasm.ts` (#168) and **deleted with the
  > TS core (#466); it was never ported to the self-hosted `compiler/*.vl`.** There is
  > no recognizer in the VL compiler — `grep -rn "accumulat" compiler/*.vl` finds only
  > unrelated comments — and `s = s + piece` in a loop measures **quadratic** today
  > (0.31 s / 1.44 s / 9.47 s at 20k / 40k / 80k appends). The `tests/cases/strings/
  > accum-*.vl` fixtures still pass because they assert only the RESULT, which
  > per-append concat also produces — **they are blind to the cost class they were
  > written to pin.** Until it is re-ported, build strings by filling an `i32[]` and
  > calling `fromCodePoints` once (`compiler/format.vl`); that is 28 ms vs 12,475 ms on
  > a 40,000-piece join. Tracked as the live half of `strings-design.md` OQ-2.
  >
  > *A DECISIONS entry records what was decided and shipped; nothing sweeps it when a
  > later refactor deletes the implementation. A shipped-then-deleted feature reads as
  > still-shipped forever. Re-derive before citing one as precedent.*
  >
  > The original entry follows, describing the TS implementation.
  `let s = ""` built purely by `s = s + e` appends in a loop (any number, incl.
  conditional and multi-piece `+`-chains) lowers to a growable char buffer with
  amortized appends, materialized to one new immutable string after the loop —
  O(n²)→O(n). This is the sanctioned in-place/builder optimization of
  `docs/guide/strings-design.md` (§Mutability: in-place when the value is provably
  unaliased/dead; OQ-A's perf half), and it does NOT change string storage (still
  `array i32` of code points — frozen until self-hosting), only how a recognized
  accumulation loop lowers. Sound because the accumulator is fresh, never read
  mid-loop, and only appended (so its old value is dead), and the result is a new
  string identical to the concat build; the guards (statement-position appends
  reconciled against every `name` occurrence, pieces free of the accumulator,
  freshness) fall back to per-`+` concat on anything unproven. The piece is
  lowered with a string desired type so a value-returning call isn't dropped (the
  normal assignment sets that; the early interception bypasses it). A builder
  type + interpolation sugar remain OQ-A's open ergonomic halves. (B7b)
- **String methods follow JS semantics.** `slice(start, end)` is the half-open
  `[start, end)` range with JS clamping (negative counts from the end, bounds
  clamp to `[0, len]`, `start >= end` → empty); `indexOf("")` returns 0. Chosen
  for least-surprise over Python-style slicing; method types live in
  defaultScope (no typecheck changes), toWasm lowers each by name. (A7)
- **Maps are a separate hash type, not every-object-as-table.** Three
  representations under one `[]`/`.field` surface: static-string-key structs
  (fastest), `i32`-key arrays (native, contiguous), arbitrary-key maps (hashed,
  heap) — you pay hashing only when you use a `Map`. (B6a)
- **`Map`/`Set` are ordered open-addressing hash maps (Python-dict shape).** A
  `{keys,vals,live,index,
  count,size}` struct: insertion-ordered entry
  arrays + a hash index → entry; iteration walks entries in order
  (deterministic, for multiplayer/replay). **Delete tombstones + compacts**
  (rebuild from live entries, index sized to the live count, not unconditionally
  doubled) — the first cut doubled on every delete and OOM-trapped under
  add/delete churn. Spelled with the index-sig syntax (`{[string]:V}` map,
  `{[T]:boolean}` set). (B6a)
- **An i32 KEY re-types one field, it does not fork the map.** `{[i32]: V}` is the
  same 7-field rep with `keys` re-typed to the i32 list, a different hash (an
  integer mix, not FNV over code points) and an `i32.eq` compare — everything else,
  including the ordered entry arrays, the tombstones and `__map_resize__`, is
  literally shared. Chosen over hashing i32 keys as formatted strings (the ask is
  fourCC tables — formatting them is the thing the ask exists to avoid) and over an
  identity hash (fourCCs share their high bytes, so an identity hash clusters an
  open-addressing table into a linear scan). Insertion-ordered iteration is the
  contract for BOTH keys — replay depends on it, so no scheme that reorders on
  rehash is admissible. (B6a)
- **A map-value SLOT is keyed on the (KEY, VALUE) PAIR, and the slot is what the
  emitter threads.** The map struct's only key-varying field is field 0 (`keys`:
  the string-ref list wrapper, or the i32 list wrapper), so two slots agreeing on
  the value and differing on the key are two LAYOUTS — `mvKeyI32` is the second
  identity column and `repMapValSlotsTwin` refuses to merge across it. Chosen over
  the alternative of threading the key as a second parameter beside every shape:
  downstream of the intern the slot is SELF-DESCRIBING, one integer answering both
  halves, so `mapTypeIdxOf`, the `cm*` emit accessors and the typed per-slot
  scratch frames took no new argument. A value on the shared i32 `vals` list interns
  no slot on either key, so "mono" is still a SENTINEL — but a PAIR of them
  (`-1` string-keyed, `-4` i32-keyed), named once at `mapMonoShapeOfKey`, because a
  resolver landing on mono must still say which of the two structs it means. (B6b)
- **Every boundary that can CONSTRUCT a map is seeded with the shape it must
  build, and the boundaries are enumerated, not discovered.** `Map()` builds
  whatever `pendingMapSlot` says; unseeded it builds the MONO struct, which is
  correct for exactly the values that have no struct of their own (`i32`,
  `boolean`, a literal-union atom) and invalid wasm — `vl check` clean — for every
  other. Three boundaries were taught the seed one bug at a time (a let / return /
  global init, then struct + variant fields, then the map VALUE in #1286, then the
  ARRAY ELEMENT here), and each time the tell was the same: the MONO values worked.
  So the rule is now stated positively — a position that can hold a map is a
  position that must name its shape — and the answer per position lives in ONE
  named function (`letMapShapeOf`, `mvInnerMapShape`, `rlElemMapShape`) rather than
  at the seed site, so a second consumer of the same position cannot re-derive it
  differently. (B6b)
- **A typed-value map has ONE struct heap type per value type, resolved
  position-independently.** `{[string]:f32}` mints its own `mvMapTypeIdx` struct
  (its `vals` field differs from the mono `$mStructIdx`); a map in COMPOSITION (a
  list element, a nested-map value, a struct field) resolves that SAME struct — the
  ref-list element heap picks `mvMapTypeIdx`, not the mono struct, and a
  composition read binds the yielded map with its typed mv slot. Distinct value
  types keep distinct layouts (no over-merge); an atom/mono value keeps the shared
  mono struct. (B6a)
- **Generics infer through collections, not just scalars.** A generic element
  type is pinned from the argument's element type (the checker unifies
  index-signature _value_ types, not just keys), so `first<T>(xs: T[])` resolves
  `T` per call. Read-side only for now — building a new array of an inferred
  element type (`map`/`filter`) waits on growable lists (B6 tier-2). (A10)
- **Generic type aliases are substitution, not a new nominal kind.**
  `type Box<T>` stores the body plus its param holes; applying `Box<i32>` clones
  the body, mapping each hole directly to its argument — so a concrete
  application is a concrete object and `Box<T>` in a generic fn keeps `T` linked
  to the function's hole (correlation flows through the existing
  monomorphization). (A10)
- **Growable `T[]` ships as compiler-emitted helpers, not a `.vl` std module
  (yet).** The design's end-state is to write the collection in `.vl` over an
  intrinsic floor (ports for free under self-hosting), but that needs a module
  system VL doesn't have. So v1 lowers `T[]` to a `{backing,len,cap}` WasmGC
  struct with lazily-emitted **per-element-wasm-type helpers** (in the self-hosted
  `compiler/wasmEmit.vl`; this was `compiler/builtins/lists.ts` in the retired TS
  compiler) — exactly how strings already work (`__string_eq__`). Migrate to
  `.vl`-std when modules land. The _type_
  representation stays `{[i32]:T}` (so generic inference/equality/`.length` are
  untouched — it is purely a codegen change); `string` is excluded from the
  struct rep via `isListType = arrayElementType(t) && t.name===undefined`. (B6)
- **Sequence indexing traps; `.get`/map-lookup return `T|null`.**
  `a[i]`/`a[i]=v` trap on out-of-bounds (a bug, bound = `len`), matching the
  raw-array MVP; the safe checked accessor is `.get(i): T|null`, and `pop()` on
  empty is `T|null` (normal absence). A sentinel-encoded scalar nullable
  (`boolean|null`) builds its `null` from the i32 sentinel, not `ref.null`. (B6,
  §VL.6)
- **Single-instruction numeric operations are compiler intrinsics, spelled as
  bare free functions, and shadowable.** A std function needs a body; these have
  only an opcode, so `std/` cannot hold them. Bare over dunder because the rule
  the builtin surface actually follows is *raw-floor machinery is dunder, safe
  total functions are bare* (`print`/`toString`/`fromCodePoint` vs
  `__trap__`/`__store_i32__`). Shadowable because `min`/`max`/`abs` are the names
  programs most often define themselves, and an intrinsic that captured such a
  call would silently kill the user's function. Width comes from the operands
  under the binary operators' rule, not from a second declaration — VL has no
  overload resolution and gains none.
- **Unsigned integer ops are operations, not a `u32` type.** `divU`/`ltU` read
  the same bit pattern under a different interpretation; VL's `i32` is signed
  (`/` is `div_s`) and already exposed one unsigned instruction as an operator
  (`>>>`). A `u32` would touch the type arena, every rep table, every widening
  rule and every emitter kind code to express something the operand need not
  carry.
- **No transcendentals, ever, as a language or std primitive.** No wasm opcode
  computes `sin`/`pow`/`exp`, so any implementation is a library whose last bit
  is a policy choice. A program that must match another implementation exactly
  has to own that choice; shipping one would give it a trap to avoid rather than
  work to save. (`docs/internals/numeric-intrinsics.md`)

- **A classifier's "no answer" sentinel is NOT neutral when the caller has a
  default — so a DECLINE LIST is a set of testable claims, and each entry must be
  measured by lifting it ALONE.** `fnAssignKindGuard` returned `null` for five
  cell kinds under a header that called `null` "no answer, leave every classifier
  exactly as it was". Its caller's default was `i32`, so every decline was really
  a claim that an `i32` result valtype beats the named one — and under a body
  pushing a ref that is check-clean invalid wasm, not a no-op. Four of the five
  recorded reasons were false once each was lifted on its own and the grid
  re-graded; the fifth named a real mechanism but a false premise about it. The
  transferable rule: state a decline against the DEFAULT the caller will fall back
  to, never against "whatever the code did before", and measure entries one at a
  time — a list measured as a block cannot tell you which entry is carrying it.
  The corollary is that a decline is worth keeping only when it is LOUDER than the
  default: `nulreflist` and `variant` are NOT declined precisely because naming
  them reaches `fbValtype`'s out-of-bounds guard and a loud reject. (#1938, D27 /
  D28 / D29; `docs/internals/silent-class-inventory.md`)

## Parser, distribution & bootstrapping

- **Hand-written parser over a generator.** Dropped antlr4 (Java/Gradle build
  step; can't be part of a self-hosted compiler). Chose hand-written (Pratt)
  over peggy/parser-combinators for error quality and bootstrappability. (Track
  G)
- **Newlines are SOFT statement boundaries.** Never force-required — statements
  abut freely on one line (`let a = 1 let b = 2`, `return 1 print(9)`). A newline
  is load-bearing only where omitting it is genuinely ambiguous (a leading
  `+`/`-` that would otherwise continue the previous expression: `a` ⏎ `-b` is
  two statements, `a - b` is subtraction) or carries a real perf cost. Applies to
  both the TS parser and the self-hosted `parser.vl` being built for the
  bootstrap. (G8)
- **Self-hosted WASM emission: emit bytes directly + optional `wasm-opt`.**
  binaryen's npm build is JS-bound (Emscripten glue, not a standalone WASI
  module), so the self-hosted compiler emits the wasm binary encoding itself and
  treats `wasm-opt` (native CLI) as an _optional_ optimizer rather than
  embedding binaryen. Caveat: loses Heap2Local scalarization until `wasm-opt`
  runs. (binaryen stays for the TS compiler.) (H4)
- **Off-V8: binaryen's role collapses from IR builder to optional optimizer.**
  The TS backend (`compiler/toWasm.ts`) uses binaryen as its codegen data
  structure — ~640 `m.<op>(…)` IR-builder calls. The self-hosted backend
  (`compiler/wasmEmit.vl`) emits the wasm binary encoding _directly_, so that
  builder role — and all ~640 calls — simply doesn't exist to port; only an
  _optional optimizer over bytes_ remains. Reaching it needs no JS engine:
  default to the `wasm-opt` subprocess (zero bindings, H4), with an in-process
  **libbinaryen FFI** slice (~5–6 C calls: read → set GC features → optimize →
  write → dispose, vs. the 640 builder calls) as an upgrade when subprocess
  latency/`PATH` bites. Self-hosting removes the reason V8 ships (the TS
  compiler); direct emission removes the reason binaryen ships as a builder.
  Full analysis: `docs/internals/binaryen-transition.md`. (H4.1)
- **B-validwasm is the gate that makes optimization optional.** Today some
  constructs only _validate_ after `optimize()` runs (binaryen's passes quietly
  fix up naive emission), so the "unoptimized" path isn't actually optional.
  Emitting wasm that validates _as emitted_ (B-validwasm) is the highest-value
  transition work, independent of optimizer choice — it's what lets
  `wasm-opt`/libbinaryen be skipped at all and unblocks leaning on wasmtime's
  own JIT. The libbinaryen route additionally needs a WasmGC-array ↔
  linear-memory ↔ libbinaryen byte handoff (**H4.5**); the `wasm-opt` subprocess
  sidesteps it (bytes go out a pipe, not across FFI). Target runtime:
  **wasmtime** (stable WasmGC, ≈v27+). (H4.5)
- **`-O3` stays the named release profile, and the emitter is the long-term
  route.** A three-rung sweep over all 46 benchmarks
  (`bench/findings/three-rung-sweep.tsv`) settles the per-program split as the
  answer rather than leaving it open: at a 5% materiality floor `-O3` beats
  `-O` on **12 rows** (`lambda-hot` 2.23x, `dispatch-table` 1.43x, `mandelbrot`
  1.28x) and loses on **4** (`sort-heap` 1.37x, then three at ~1.05x) — it wins
  materially three times as often as it loses, and its largest win exceeds its
  largest loss. The nominal 23/23 split is noise. `sort-heap`'s shape is
  written down as the named exception instead of flipping the rung for it.
  Costs accepted: ~50% more wall time and ~1.3 KB on the 1.1 MB compiler
  (19.5 s / 919,547 B vs 13.1 s / 918,258 B). Reversal stays one line
  (`RELEASE_PASSES`, `scripts/vl-host/src/main.rs:1493`) and the melt/loop
  goldens already carry all three columns, so a later flip re-labels rather
  than re-measures. **Direction:** optimization should eventually be
  internalized so it can be applied selectively — keeping the wins where they
  are and avoiding the regressions where they are not — but that work is gated
  on whether it meaningfully improves OVERALL self-compile time; individual
  function wins do not qualify. (P1.3, `O-release-rung-default`)
- **The binaryen inline budget is a build flag, never a default.**
  `--always-inline-max-function-size=60` melts the view descriptor outright
  (`axpy-view` 1.736 -> 0.636 ns/elem, in a kernel module 113 B smaller), but on
  the 1.16 MB compiler module it costs **+82% bytes** (955,265 -> 1,740,871) and
  **+127% `wasm-opt` time** (22 s -> 50 s) for no self-compile speedup at all.
  `--flexible-inline-max-function-size=60` is the shippable half: 1.45x for
  +28% compiler size. Same shape and same answer as the names section (C10) —
  a large fixed tax on every module to buy a win only some modules want, so the
  consumer passes the flag. Note the hand-written spelling needs no flag and is
  faster than either (hoist `byteAddrF32(0)` and `.length`, then bare
  `__load_f32__`/`__store_f32__`: 0.296-0.500 ns at all three rungs), so the
  flag is a convenience over an existing route, not the only one. (P1.3, C3)
- **Versioning (when needed): rustup/Volta model, not nvm.** A launcher that
  resolves a committed project pin and auto-installs the right toolchain — not
  manual `use`/shims. Deferred until multiple releases warrant it. (H5)
- **Modules: whole-program merge to ONE wasm module, not separate
  compilation/linking.** N `.vl` files resolve into a single `VLProgramNode` the
  existing `toWasm` compiles unchanged — the natural fit for VL's
  monomorphization + single-wasm output and the H-M2 end-state (one module).
  Rejected wasm-linking (cross-module ABI + linker, fights monomorphization).
  Syntax: explicit `export` modifier on `function`/`let`/`const`/`type`
  (greppable public surface, not Go capitalization or Python export-all); named
  `import { a, b as c } from "./util"` only, relative specifiers with the `.vl`
  extension OMITTED (resolution appends it, no index guessing). Per-module name
  isolation by **mangling** every module's top-level value names (`name$mN`) and
  rewriting references — so two files' private `helper`/`Tok` coexist (self-host
  gap #1) and an `import` rewrites to the exporter's mangled target; user
  `type`s are already structural at codegen so only value names need it. The
  single-string `compile(source)` is untouched (back-compat); the graph driver
  is `compileProgram`/`checkProgram` over an injected file reader
  (runtime-agnostic, like the rest of the core). Phase 1 = relative user-file
  imports only; the `std:` scheme + embedded std (phase 2) and cross-file LSP
  (phase 3) are deferred, as are import maps / namespace+default imports /
  re-exports. Design + full rationale: `docs/internals/modules-design.md`. (H0)
  - _Sub-questions resolved at implementation:_ (a) the entry module is mangled
    uniformly like every other (simpler rule, debuggable names) rather than kept
    verbatim; (b) modules merge in dependency-first (import topological) order
    so a dependency's top-level initializers run before its dependents' — the
    design's open cross-module `let`-init-order question is answered as "import
    order, cycle = error" for phase 1; (c) a file compiled single-string with a
    stray `import` is harmless (the names just don't bind) rather than a hard
    error — imports are only meaningful through the graph driver; (d) `export`
    keyword spelling chosen over `pub` (matches the `import`/ES family).

- **Host-callable wasm exports: entry-module only, thin scalar wrapper.**
  Entry-module only because binaryen treats exports as DCE roots — non-entry
  exports would pin otherwise tree-shakeable functions. Thin wrapper because
  every VL function carries a leading `structref` closure-env param; the wrapper
  drops that param and forwards a null env, giving hosts a clean scalar ABI
  (scalar params/returns only for v1). (H6, PR #141)

- **Integer divide-by-zero stays a trap.** The universal wasm/hardware
  convention; no checked division by default. A `divChecked: i32|null` dual is a
  possible future opt-in but not planned for v1. (B-debug)

## Editor / LSP

- **D2 symbol table reuses the parser's scope walk, not a second resolver.**
  Go-to-definition / find-references resolve use→declaration, which the parser
  already does as it walks the live `scopes` stack — so the symbol table is
  populated during that same walk rather than by a separate post-parse resolver
  (which would duplicate scope/shadowing logic and drift from the checker).
  Position-indexed, single-document; cross-file and builtins are out of scope.
  (D2)

## Assignment is an expression yielding its right-hand side

`x = e` evaluates to `e`'s value (so `b = (a = 5)` gives 5, `while (line = next()) != ""`
works, and a function whose trailing statement is an assignment returns the assigned value
via the trailing-expression rule — `function bump() { count = count + 1 }` returns the new
count). Confirmed deliberate (2026-06): the classic `if (x = 5)` C foot-gun is mostly
defused by VL's mandatory-`bool` conditions; the residual hole — `if x = true` with a
boolean `x` — is handled by LINT, not semantics (an assignment whose RHS is a LITERAL in
condition position warns; see ROADMAP B17), keeping the expression semantics uniform.

## `else if`, not a fused `elseif` keyword

A chain is `else` whose branch is another `if` (the brace grammar nests with no extra
terminator — the C / Rust / Swift / JS form). The fused `elseif` keyword was removed as a
pure alias (it parsed to the identical nested-`IfStmt` AST and was used once in the whole
corpus vs 571 `else if`). A dedicated `elseif`/`elif` keyword only earns its keep in
block-terminator languages (Python/Lua/Ruby) where `else if` would force an extra `end`;
VL's `{}` blocks make it redundant. One form means no parser ambiguity and no formatter
surface-recovery for the chain keyword.

## Which channel owns a NARROWED argument's type at a monomorphization pin

**The pin's own NAME owns it, and the checker's recorded type on the argument node is
consulted only to pick among that name's OWN members.** (D25, #1938)

Two channels answer "what type is this argument" during monomorphization, and they are
already both per-parameter columns of one instance:

* `pinned[j]` — the pin NAMES, from `monoArgTyName`, which reads the PARAMETER's declared
  annotation because mid-mono every `expr*` classifier is blind (`buildLocals` is post-mono);
* `pinTys[j]` — the ARGUMENT NODE's arena row, which knows the narrow.

The parameter slot and the body's binding column were built from the NAME; the RETURN
annotation's `substTyDeep` was built from the argument's ROW. Inside `if c is Circle` those
disagree — the annotation is still `Circle | null`, the checker has already typed the node
`Circle` — so `idg<T>(x: T): T` was minted `(param (ref null $uVarHeap[vi])) (result (ref
$uVarHeap[vi]))`. `vl check` rc 0, module refused at load.

### The measurement

A 187-cell grid over generic-call shapes (type parameter in the result vs not · `is` /
`!= null` / no narrow · nulvariant, plain variant, nulstruct, struct, nulreflist, reflist,
nulstring, string, nul-i32/f64, nul scalar list, nulmap, nullable closure, litunion,
nominal struct · direct / binding / nested / call-result / field-read / module-scope
delivery · generic returning `T`, returning a concrete type, two type parameters, a
forwarder), graded on `runs` · `loud check reject` · `loud emit reject` · `check-clean
invalid wasm` · `compiler trap` · `runs but wrong value`:

| | runs | loud check | loud emit | check-clean INVALID WASM | blockers (loud→silent) |
|---|---|---|---|---|---|
| master | 94 | 33 | 7 | **53** | — |
| (a) annotation owns it | 134 | 33 | 12 | **8** | 0 |
| (b) node type owns it | 98 | 33 | 10 | **46** | **6** |
| (c) shipped | **146** | 33 | 8 | **0** | 0 |

* **(b) is disqualified on the brief's own rule** — 6 cells moved from a loud outcome to a
  silent one, and 21 more from `runs` to invalid wasm. Its breakage is exactly where the row
  warned: a literal union's render SOFTENS to `string`, a nominal `P` renders `{x:i32}`, a
  closure renders an arrow where the pin needs a `$fnsig` marker, and a generic FORWARDER's
  leaf node still carries the ORIGINAL's `T`.
* **(a) is sound but leaves the result at a rep the checker does not believe in.** Its whole
  residue is the call RESULT's onward use: 8 silent cells at the boxed nullable scalars, and
  4 `runs` cells lost to a loud `field access but no struct type declared` because the
  instance returns `string | null` / `P[] | null` where the checker typed the expression
  `string` / `P[]`.
* **(c) is (a)'s consistency rung plus a GATED narrowing rung**, and it is what shipped.

### The ruling, in two rungs

1. **An instance is a function of its registry key.** The RESULT's substitution takes
   `letTyCol` — the same column the parameter slot and the body's bindings take — not
   `pinTys`. The registry is keyed on `pinned` alone, so sourcing the result from a column
   the key does not carry made the instance depend on something the key cannot see. That was
   an ORDER DEPENDENCE, not merely a wrong type: one program with two function declarations
   swapped moved between `runs` and check-clean invalid wasm, with identical call sites and
   an identical key.
2. **A narrowed argument's pin NAME is the narrowed spelling**, where the checker's recorded
   type renders a name that is a top-level MEMBER of the annotation's own union/nullable
   spelling AND that `monoAnnPinName` echoes back unchanged.

Rung 2 is the reason (c) beats (a), and the MEMBERSHIP gate is the reason it is not (b). The
justification for taking the narrow at all is `monoScalarAnnName`'s exact-name safety
property read at the CALL BOUNDARY: a pin becomes the instance's parameter annotation, so it
is safe exactly where a NON-generic function carrying that annotation already lowers the same
program. Measured, on the concrete twin of every rep in the grid — `function takeN(x: N): N`
called with a `W` value narrowed to `N` — **all ten run on master**, argument coercion
(`ref.as_non_null`, unbox) and result box included. Pinning `W` is equally legal as an
annotation and lands the RESULT off that path; pinning `N` lands the whole instance on it.

Where rung 2 declines (the nominal reps, whose render is structural), rung 1 alone keeps the
instance consistent — which is why the two rungs ship together and neither is redundant.

### What is deliberately NOT done

* **The narrowing is not decided by TYPE identity.** A `tySame`-based membership test would
  reach the nominal reps too (`{r:i32}` matching the `Circle` arm). It is not licenced: the
  grid has 0 silent cells and 0 regressions without it, and widening a rule past its measured
  need is the D-SHAPEFIELD precedent this repo keeps paying for.
* **`monoArgTyName` itself is unchanged**; the narrowing lives in a separate
  `monoArgPinName` that only `monoInstantiate` calls. `wasmEmit`'s `monoStaticIsResult` asks
  `monoArgTyName` about an `is` RECEIVER and const-folds on the answer — narrowing there
  would fold a guard the mono pass has no business deciding.
* **Five cells remain LOUD rather than running**: a narrowed `P[] | null` and a narrowed
  nullable closure whose generic RESULT is then indexed / called. Both are honest emit
  refusals (`field access receiver is not a struct`, `callee is not a function name`), both
  were check-clean invalid wasm before, and a loud floor beats a wrong instance.

## A REFUSAL the checker holds must ride the pin, and a deferred constraint belongs to ONE body

**A rule enforced at `vl check` and lost at monomorphization is not a rule — it is a rule
about spellings.** `checkBinary`'s equality arm asks two questions of the operands
(`isEquatable`, `eqCmpKindOfTy`); of a `T` they answer "equatable" and "OPAQUE", which is
correct about a type VARIABLE and useless about the instance. Nothing re-asked once the pin
was known, so `xs.indexOf(n)` over a `Circle[][]` was `vl check` rc 0 over a module the engine
refuses while the identical `a == b` was a clean checker error. (D35, #1946)

This is the third instance in three days of one shape — **information present at one layer and
silently dropped at the next** — after D25's "an instance is a function of its registry key"
and #1938's "a classifier's no-answer sentinel is not neutral when the caller has a default".
The transferable form: **when a checker rule consults a TYPE, ask what it answers for a type
VARIABLE, and whether anything asks again at the pin.** An answer that is merely *true* of a
`TyVar` is not an answer about the instance.

### Where the question is asked, and why not at emit

At the CALL SITE, through the deferred binary-op constraint (`noteBinCstr` /
`validateBinCstrs` / `binOpDefinedFor`) that already carried exactly this shape of question
from a generic body to its callers — its `==` arm asked only mutual compatibility, and now
asks both gates off one home (`eqRefusals`) that `checkBinary` also calls. The alternative was
a check inside `emit_mono`, which reaches the same programs; it was rejected because **`vl
check` is what an editor runs**, and a soundness rule that only the CLI's run path states is
invisible where the code is written. It also keeps ONE home: two places answering "is this
comparable" is the two-guesses shape the `eqCmpKindOfTy` header was written to end.

### The constraint list was a global keyed on a NAME, and that was already a defect

`substTyDeep` matches TyVars by name, so an unscoped constraint list makes every `<T>` in the
program one namespace. On master, `function addT<T>(a: T, b: T) { return a + b }` anywhere in
a file made `idT(c)` — a generic that adds nothing — report `operator '+' is not defined for
Circle and Circle`. **A false reject that predates this change, and the reason the equality
gate could not be stated without fixing it**: `indexOf`'s `self[i] == needle` would otherwise
have refused `xs.reverse()` over the same receiver.

Constraints now carry the DECLARATION that recorded them, and a call adjudicates only its own
callee's. A call site knows its callee to three degrees and each gets its own answer:

* a **declared** callee adjudicates its own body's constraints;
* a callee with **no declaration** consults everything, as before — but must not RE-RECORD.
  `validateBinCstrs` re-records a partially-substituted constraint under the hole it lands on,
  stamping the body it stands in as the new owner; with the whole list in scope, a HOF's inner
  `f(self[i], i)` re-recorded a sibling generic's `T == T` onto the HOF's own `T`, which is how
  `xs.mapIndexed(toI)` came to report `==` over an element type nothing in the program
  compares. **The re-deferral inherits the scoping bug of whatever it re-records**, so a fix
  that scopes only the direct read leaves the leak intact one hop away — and, symmetrically, a
  fix that scopes the read too far breaks something else (below);
* **no callee at all** — `genericFnAssignable` instantiates a function VALUE from its TYPE —
  consults everything, unchanged.

An owner-less constraint (module scope) always applies, so the scoping can only remove
cross-generic false rejects, never silence one that fires today.

### The callee's own DELIVERY is an axis, and holding it constant cost a round

The first draft scoped the unnamed callee to the ENCLOSING BODY, on the reasoning that a name
with no declaration is a closure parameter whose holes are the enclosing generic's own. **That
reasoning is persuasive and false**: it is also `const f = addT  f(c, c)`, where the holes are
`addT`'s, and the draft turned a loud `operator '+' is not defined for Circle and Circle` into
check-clean invalid wasm — a loud→silent move produced by the fix for loud→silent moves.

It survived a 1514-cell grid, because that grid crossed the NEEDLE's delivery and the
RECEIVER's delivery at five values each and spelled the callee `f(x)` in every cell.
**Enumerate the delivery of everything a call site names, not just the arguments.** The rule
that shipped withholds only the re-record from an unnamed callee, which is the narrower thing
the HOF case actually needed; the callee axis is now in the grid and in
`tests/cases/generics/error-deferred-constraint-true-positives.vl`.

### `validateBinCstrs` reached only the direct-call spelling

`xs.indexOf(nd)` never reached it. The same asymmetry the `u8[]`-meets-a-generic rule had, for
the same reason: **`self` arrives AHEAD of the argument loop the rule sits in.** Any rule
placed in that loop must be placed twice, and the UFCS half is now there.

### The measurement, and the one direction that needed defending

1712 cells (T binding × equatability of `T` over the full rep vocabulary × operation × route ×
needle delivery × receiver delivery × callee delivery × alias-vs-spelled-out). 225 moved, **0
genuine loud→silent**: 132 `check-clean invalid wasm → loud check reject`, 49 `loud emit → loud
check` (the same refusal one stage earlier), 18 `runs → loud check`, and 26 that LEFT a loud
outcome — every one of those the cross-generic false reject being removed, each with a master
diagnostic of `operator '+' is not defined for X and X` from a sibling generic the cell never
calls at that type, and each confirmed by deleting that sibling and re-running master.

The 18 are all `T = ("a"|"b")[]`, the cell D35 itself called its sharpest, and they are the
point rather than the cost. **A program that works because the emitter happens to hold a
comparison for one rep, while the checker refuses the identical comparison spelled out, is
relying on a coincidence one rep table away from changing.** The direct spelling has always
been `K[] isn't equatable`; the pin now says the same. `std/array.vl`'s ledger records this as
its first entry cleared by making a spelling LOUDER.

### What this does NOT reach, measured rather than assumed

A NULLABLE `T` whose compare the checker ACCEPTS and correctly lowers — `string | null`,
`i32[] | null` — is D35's MIRROR and is untouched: `eqCmpKindOfTy` answers `"nulstr"` /
`"nullist"`, a compare core exists, the direct spelling runs and is right. There is no refusal
to lose, so `eqRefusals` is correct to stay silent; the defect is that the PIN drops an
acceptance. Filed as D39 with its own 84 cells.

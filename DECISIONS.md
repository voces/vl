# VL — Design Decisions

Decisions where the **rationale isn't recoverable from the code**.
Implementation detail lives in the code, git history, and `docs/`; this file is
the "why we chose X over Y." Keep entries terse (≈2–4 lines) — the decision and
rationale, not a code walkthrough. Append new entries under the relevant
section. Roadmap items reference these by their tag (e.g. A15, B14).

_(Consolidated from ROADMAP.md, 2026-06-05.)_

## Types & semantics

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
- **Bodyless `type Point` is a clean error for now.** Real nominal/opaque types
  come later; today a bodyless `type` decl is a diagnostic, not a silent
  self-referential alias. (A14)
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

## Memory, runtime & object model

- **Allocation = WasmGC.** Heap values (closures, objects, arrays, strings) are
  WasmGC structs/arrays; linear memory is an opt-in escape hatch;
  escape-analysis stack allocation is a later optimization. Lean on binaryen's
  Heap2Local rather than hand-rolling SROA. (B1)
- **Keep binaryen (unlike antlr4).** Pure WASM/JS, does the IR/validate/optimize
  heavy lifting, and is a library binding that does _not_ block self-hosting —
  it stays for the TS compiler. (Track B)
- **`repOf` slot identity is nominal (the checker's memoized arena index), not a
  purely-structural canonical key.** Two nominally-distinct types with identical
  structure (`type A = {v:i32}`, `type B = {v:i32}`) must keep distinct interned
  slots / heap types — a `B`-typed value resolves its own slot — so slot identity
  keys on the per-alias arena index the checker mints (distinct for `A` and `B`),
  which a structural key would instead collapse. The cycle-terminating structural
  key (full traversal, back-edge tokens for recursive types) is kept only as the
  structural-equality oracle and future dedup foundation, never as slot identity;
  the structural→nominal bridge for an inline shape resolves to a declared slot
  only when exactly ONE declared twin matches (else it stays on the nominal path).
  (repOf unification, roadmap Next#1)
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
  `{[T]:boolean}` set), `string` keys only for now (i32 keys stay the native
  `T[]` path). (B6a)
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

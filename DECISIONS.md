# VL — Design Decisions

Decisions where the **rationale isn't recoverable from the code**. Implementation detail lives in
the code, git history, and `docs/`; this file is the "why we chose X over Y." Keep entries terse
(≈2–4 lines) — the decision and rationale, not a code walkthrough. Append new entries
under the relevant section. Roadmap items reference these by their tag (e.g. A15, B14).

*(Consolidated from ROADMAP.md, 2026-06-05.)*

## Types & semantics

- **Fully typed, no `dynamic`.** Types are hidden by aggressive inference, but `Unknown`/`Infer` are
  inference *holes that resolve* to concrete types — there is no gradual/untyped escape hatch.
  Blueprint: Elixir v1.20 set-theoretic types. (A0)
- **`==`/`!=` are structural (by value) by default.** `{x:1} == {x:1}` is `true` — consistent with
  numerics and strings and VL's value semantics. Function-valued fields compare *by reference* (same
  function + same captured env): "data by value, functions by identity." A custom `==` overrides. (A15)
- **Referential identity gets its own spelling.** `is` is reserved for type-narrowing, so an O(1)
  `ref.eq` identity check would be `===` or `identical(a, b)` — deferred. (A15)
- **Bare literals default to their base type.** `let x = 0` is `i32`, not the singleton `0`; the
  literal type survives only via an explicit annotation (`let x: 0 | 1`). (A16)
- **Literal unions are the enum idiom — no separate `enum` construct.** `0 | 1 | 2`,
  `"expense" | "reimbursement"`. (A16)
- **`?.` is null-only.** Optional chaining guards `null`, not a union variant — a value-union arm
  (`foo: i32 | {x}`) is discriminated with `is`. So a `null` result always means "the receiver was
  null," never "wrong variant." (A5)
- **Bodyless `type Point` is a clean error for now.** Real nominal/opaque types come later; today a
  bodyless `type` decl is a diagnostic, not a silent self-referential alias. (A14)
- **Object-literal field-value mismatches are errors, except behind an alias leaf.** `ensureType`'s
  `Object` case raises on a wrong-typed field value (`{ value: i32 }` given `"x"`). It stays lenient
  *only* when the expected/actual field type resolves to a user-`type` alias leaf (a `Type` wrapper) or
  `Never`: an object literal is a bare `Object`, so checking it against a recursive alias arm
  (`left: Tree | null`) hits the `Type`-vs-bare-`Object` false-negative the A11 traversal depends on,
  and `Never` is an upstream-error placeholder. Tightening only the non-alias-leaf case closes the
  soundness gap without re-introducing infinite recursion on self-references. (A12)
- **Type negation is `!A`, not `not A`; the negated guard is `x !is T`.** Surface syntax for the
  intersection/negation algebra: `A & B` (intersection, binds tighter than `|`), `!A` (negation, prefix,
  binds tighter than `&`), and `x !is T` (negated type-guard). Rationale: VL already chose `!` over the
  `not` keyword for boolean negation (B10), so a single negation token across values, types, and guards
  keeps the surface consistent and reintroduces no `not` keyword. `x !is T` follows Kotlin's `!is`
  (negate the operator) over C#'s `is not` / `is !T` — it reads cleanly and stays `!`-consistent; it
  desugars to the existing `is` node with a `negated` flag and mirrors `is` narrowing (then-branch
  subtracts `T`, else-branch narrows to `T`). Surface type negation is rare across languages (TS has only
  the named `Exclude<A,B>`; set-theoretic systems write `¬t`/difference internally) — Whiley is the main
  precedent for a `!`-style negation type. (A3/A4)

## Memory, runtime & object model

- **Allocation = WasmGC.** Heap values (closures, objects, arrays, strings) are WasmGC structs/arrays;
  linear memory is an opt-in escape hatch; escape-analysis stack allocation is a later optimization.
  Lean on binaryen's Heap2Local rather than hand-rolling SROA. (B1)
- **Keep binaryen (unlike antlr4).** Pure WASM/JS, does the IR/validate/optimize heavy lifting, and is
  a library binding that does *not* block self-hosting — it stays for the TS compiler. (Track B)
- **No `this` keyword.** A method is a function whose first parameter is `self` (Rust-style); `o.f(a)`
  is sugar for `f(o, a)` (UFCS). `self` is an *explicit, optional* marker: first param `self` → a
  method reachable as `o.f()`; no `self` → a plain function, not reachable through an instance (no
  namespace pollution, crisp errors, the method-vs-static split for free). `o.f()` resolution: a
  callable *field* wins (container/data, no receiver), else a free `self`-function, else error.
  Receiver is any expression (incl. literals). Mutation is free (objects are refs); "may a method
  mutate its receiver?" is an A9 variance question, not a receiver one. (B14)
- **One lambda form: `function(params) body`.** No bare `(params) body` (arrow ambiguity); an explicit
  `=>` arrow is deprioritized (purely cosmetic — no `this` to rebind). Declaration-vs-value: a
  top-level `function` monomorphizes per call site (polymorphic across shapes); a `let`-bound lambda
  is a single-signature closure value (monomorphic, pinned by use). (B15)
- **Only `!`, not `not`.** Logical operators are symbolic (`&&`/`||`/`!=`); the lone word operator was
  dropped. (B10)
- **One binding per name per scope** (no ad-hoc overloading for now); nested shadowing is allowed. (B16)
- **Operator / call / index dispatch via well-known methods**, resolved statically (no runtime
  `Proxy`): `"+"`, `"()"`, `"[]"`/`"[]="` are typed methods in a shape's contract. (B13)
- **Size members follow the uniform-access principle.** `length` is a contract member via property
  syntax, dispatched to a native lowering (not a structural field — that broke index-sig subtyping).
  Property syntax (no parens) is reserved for O(1) members (`length`/`count`/`capacity`); computing
  ops (`push`/`map`/`slice`) are methods (parens). `length` is read-only; sparse collections use
  distinct `count`/`capacity`/`extent`, never an overloaded `length`. (B6)
- **String methods follow JS semantics.** `slice(start, end)` is the half-open `[start, end)` range
  with JS clamping (negative counts from the end, bounds clamp to `[0, len]`, `start >= end` → empty);
  `indexOf("")` returns 0. Chosen for least-surprise over Python-style slicing; method types live in
  defaultScope (no typecheck changes), toWasm lowers each by name. (A7)
- **Maps are a separate hash type, not every-object-as-table.** Three representations under one
  `[]`/`.field` surface: static-string-key structs (fastest), `i32`-key arrays (native, contiguous),
  arbitrary-key maps (hashed, heap) — you pay hashing only when you use a `Map`. (B6a)
- **Generics infer through collections, not just scalars.** A generic element type is pinned from the
  argument's element type (the checker unifies index-signature *value* types, not just keys), so
  `first<T>(xs: T[])` resolves `T` per call. Read-side only for now — building a new array of an
  inferred element type (`map`/`filter`) waits on growable lists (B6 tier-2). (A10)
- **Generic type aliases are substitution, not a new nominal kind.** `type Box<T>` stores the body
  plus its param holes; applying `Box<i32>` clones the body, mapping each hole directly to its
  argument — so a concrete application is a concrete object and `Box<T>` in a generic fn keeps `T`
  linked to the function's hole (correlation flows through the existing monomorphization). (A10)

## Parser, distribution & bootstrapping

- **Hand-written parser over a generator.** Dropped antlr4 (Java/Gradle build step; can't be part of a
  self-hosted compiler). Chose hand-written (Pratt) over peggy/parser-combinators for error quality
  and bootstrappability. (Track G)
- **Distribute via `deno compile`.** A single native `vl` binary (V8 + the TS compiler + binaryen.js)
  through brew; versionless for now. Chosen over hand-rolling a wasm-native bundle so distribution
  ships now, decoupled from self-hosting (H-M2). Verified: `npm:binaryen@130` is a single-file
  Emscripten build with the wasm inlined as base64, so it instantiates inside the compiled binary with
  no special flags. Tooling: `scripts/build-binary.ts`, `scripts/smoke-binary.ts`. Compile with
  `--node-modules-dir=none --no-lock` so the binary embeds only cli.ts's import graph (binaryen),
  not the local node_modules trees (incl. `lsp/node_modules`) nor the lsp deps in the shared
  `deno.lock` — without those flags the binary balloons by ~2MB of unused vscode-language* packages. (C5)
- **Self-hosted WASM emission: emit bytes directly + optional `wasm-opt`.** binaryen's npm build is
  JS-bound (Emscripten glue, not a standalone WASI module), so the self-hosted compiler emits the wasm
  binary encoding itself and treats `wasm-opt` (native CLI) as an *optional* optimizer rather than
  embedding binaryen. Caveat: loses Heap2Local scalarization until `wasm-opt` runs. (binaryen stays
  for the TS compiler.) (H4)
- **Versioning (when needed): rustup/Volta model, not nvm.** A launcher that resolves a committed
  project pin and auto-installs the right toolchain — not manual `use`/shims. Deferred until multiple
  releases warrant it. (H5)

## Editor / LSP

- **D2 symbol table reuses the parser's scope walk, not a second resolver.** Go-to-definition /
  find-references resolve use→declaration, which the parser already does as it walks the live `scopes`
  stack — so the symbol table is populated during that same walk rather than by a separate post-parse
  resolver (which would duplicate scope/shadowing logic and drift from the checker). Position-indexed,
  single-document; cross-file and builtins are out of scope. (D2)
- **`vl fmt` is a comment-preserving token reformatter, not an AST printer.** The lexer drops plain `//`
  comments (no token/span; only `///` doc-comments survive) and the public AST is span-less and lossy for
  some surface forms — so an AST→source printer would silently delete every comment (and every corpus file
  + the test `// @directive` lines rely on them). Instead the formatter re-scans source into a comment- and
  newline-retaining token stream and reprints with canonical whitespace, never moving statement-terminating
  newlines — so output re-parses to the same AST and no comment is ever eaten. Trade-off: it normalizes
  whitespace/indentation but does not reflow/wrap lines. A faithful AST printer would require
  comment-carrying tokens + AST spans first. (D4)

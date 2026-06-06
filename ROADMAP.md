# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**, **permissive &
structural**, **fully type-safe** (statically sound — no untyped code; inference holes resolve to
concrete types), compiling to **lean WebAssembly**. Deliverables: an **LSP-backed VS Code extension**
(partial), a **CLI** (`deno task run`/`build`/`check`; native binary TBD), and an **in-browser
playground** (missing).

Status: ✅ done · 🟡 partial · ⬜ not started.

**Repo layout:** `compiler/` — the language core (compile, toAST, typecheck, toWasm, defaultScope) ·
`lsp/` — the VS Code extension + LSP server over the core · `grammar/` — the `.g4` spec (reference
only; the parser is hand-written) · `samples/` · `tests/` — `.vl` corpus + runner · `docs/` ·
`reference/` — retired ts-interpreter. Tracks are **independent** unless a dependency is called out.

> **Maintaining this file.** The roadmap is *forward-looking* — what to do, why, dependencies, what's
> remaining. It is **not** a changelog. Rule of thumb:
> - *Helps decide what to do next?* → here.
> - *Why we chose something non-obvious?* → `DECISIONS.md`.
> - *How an already-done thing works?* → the code + git history, or a `docs/<subsystem>.md` explainer
>   only where the mental model aids future work (`docs/unions.md`, `docs/narrowing.md`).
>
> Done items collapse to a one-line breadcrumb. Don't paste implementation narrative here. (Agents:
> on finishing, set the item to a one-line done marker; put rationale in `DECISIONS.md`.)

---

## Track A — Type system (`typecheck.ts`)
*Blueprint: Elixir v1.20 set-theoretic types, fully-typed (no gradual escape hatch).*

- ✅ **A0. Type-algebra inventory.** `Alias`, `Function`, `Object` (structural + index sigs), literal
  types, `Union`, `Nullable`, `Intersection`, `Negation`, `Unknown`/`Infer` (resolving holes),
  `Never`, `Type`, `Custom`.
- 🟡 **A3. Intersection types** (`A & B`). Done as narrowing algebra (`intersectType`, the then-branch
  refinement; → `docs/narrowing.md`). REMAINING: surface syntax (`A & B` annotation) + uses beyond
  narrowing.
- 🟡 **A4. Negation types** (`not A`). Done as narrowing algebra (`subtractType`, the else-branch).
  REMAINING: surface syntax (`not A`); full open-world negation tracking (needs A12).
- 🟡 **A5. Flow narrowing.** Done broadly — nullness, union-member (then `A` / else `U − A`),
  post-guard guard-clauses, `&&`/`||` chains (short-circuit, multi-place, De Morgan), else-of-else-if
  chaining, literal discrimination, `?.`/`??`. See **`docs/narrowing.md`**. REMAINING: `case`/multi-
  guard (no grammar); stored-witness (A6b Stage B); optional *call* `x?.f()` + chain short-circuit
  `x?.y.z` (use `x?.y?.z`); per-call reachability-pruned return types (blocked on memoize-with-holes —
  see `docs/narrowing.md`).
- 🟢 **A6. `is` operator + tagged unions.** Done — `x is T` discriminates an arbitrary value union at
  runtime (niche / value-kind / boxed encodings, global tag registry, `coerceUnion` at boundaries).
  See **`docs/unions.md`**. REMAINING: `ref.test` fast-path for ref-vs-ref; union arrays
  (`[boolean | i32]`); declared type-guard signatures (A6b Stage A).
- 🟡 **A6b. Proof-carrying narrowing (type guards as values).** Narrowing as a fact carried by a
  return value; discriminating the (possibly stored) witness refines the input that produced it. Done
  (degenerate, immediately-consumed): a body that is exactly `return <predicate-on-a-param>` is an
  inferred guard — `if present(v) { v.x }`, and the guard-clause `if absent(v) { return }`.
  REMAINING — **Stage A:** richer discriminants (`if bar(x) is null`), multi-input correlation,
  declared (verified) predicate signatures. **Stage B:** the *stored witness* (`const f = bar(x); …
  if f is null` narrows x) — needs binding tracking + invalidation (a lightweight borrow). Stage B
  also subsumes per-call tight return types (the forward direction of the same correlation).
- 🟡 **A7. Real `string` type.** Done (core): a proper Object (`{[i32]: i32}` index sig → i32-array of
  char codes, `.length`/`s[i]`/`+`/`==`/`slice`/`indexOf`/`includes`/`charCodeAt`). REMAINING:
  `boolean`-where-`i32`-expected coercion. (UTF-16 backing is B7.)
- ⬜ **A8. Exact / Inexact variance.** Params Inexact by default (accept excess properties), values
  Exact. Guards the `a.foo = b` width footgun. (TODO.md)
- ⬜ **A9. Readable / Writable variance.** Applied automatically during parameter inference. (TODO.md)
- 🟡 **A10. Parametric types / generics** (`function foo<T>(x: T)`). Stage 1 (function type params),
  Stage 2 (array element inference — `first<T>(xs: T[]): T`), Stage 3 (generic `type` aliases —
  `type Box<T> = {value: T}`, applied in any type position incl. nested/array; `tests/cases/generics/`)
  done. REMAINING: build-side array generics (`map`/`filter` constructing a new collection of inferred
  element type) — needs `List` (B6, the primary collection) or fixed-size construction.
- 🟢 **A11. Recursive structural types.** Done — `type Tree = { value, left: Tree | null, … }`
  constructs/traverses/compiles (cycle-safe traversals + a self-referential WasmGC struct rec-group;
  `types/recursive-tree.vl`). REMAINING: mutual recursion across *separate* `type` decls; recursion
  through an **array** element (`{ rest: [List] }`); bodyless `type Point` still errors cleanly (A14).
- 🟡 **A12. Soundness corpus.** Done (started): a must-error / must-not-error `.vl` corpus under
  `tests/cases/soundness/`; the runner is strict-by-default. REMAINING: keep growing it; the
  known-unsound corners are `xfail`-marked (e.g. the permissive `i32 + string` hole rule, A13).
- 🟡 **A13. Operator-constraint inference (row-polymorphic generics).** Done (core): a fully-inferred
  structural function (`add(self, b) { x: self.x + b.x, … }`) monomorphizes per call shape (i32 & f64
  from two call sites). REMAINING: the hole-operand rule is permissive (doesn't reject `i32 + string`
  yet); the *stored-closure* operator case (`vec + vec` via a `"+"` field) still hits the WasmGC
  width wall (B13).
- 🟡 **A14. Named/opaque type robustness.** The bodyless-`type Point` infinite-recursion crash is
  fixed (cycle-guarded `getConcreteType`; it now errors cleanly). REMAINING: real **nominal/opaque
  types** (decision: clean-error-for-now → `DECISIONS.md`).
- 🟡 **A15. Equality.** Done — `==`/`!=` are structural by value; functions by reference; arrays + nested
  structs recurse via a shared `valueEq` helper, gated by `isEquatable`. (→ `DECISIONS.md`.) REMAINING:
  a referential-identity operator (`===` / `identical`, O(1) `ref.eq`); `boolean`→i32 coercion when
  storing a comparison result.
- 🟡 **A16. Literal-union types (enums-as-unions).** Done (type-level): annotations constrain
  (`"a"|"b"` rejects `"c"`); `==`/`!=` discriminate + narrow; a numeric-literal union is its base
  scalar for arithmetic; a covering `if/else if` chain is **exhaustive** (no spurious `| null`). (→
  `DECISIONS.md`.) REMAINING: the **enum representation** (i32 tag for a closed literal union — see
  `docs/unions.md`); a literal union read *inside* a body softens to base (coarser member-narrowing
  there than at the call boundary).

---

## Track B — Codegen, memory model & runtime (`toWasm.ts`)
*Allocation = WasmGC; binaryen stays (it doesn't block self-hosting). → `DECISIONS.md`.*

- ✅ **B0. Numeric literals, i32/f64 arithmetic, if/while, direct calls, start fn, memory builtins.**
- ✅ **B1. Allocation strategy = WasmGC** (binaryen 116→130 for the GC API). → `DECISIONS.md`.
- 🟡 **B2. Numeric codegen.** Done: i64 & f32 arithmetic + float `/` & comparisons; i64/f32 type
  mappings; range-aware integer-literal defaults. REMAINING: explicit value casting/coercion between
  numeric types (today only literals coerce).
- ✅ **B3. First-class functions / indirect calls + per-shape monomorphization.** A function value is
  a fat-pointer closure `{ tableIndex, env }`; each call site instantiates a fresh signature, keyed in
  codegen by wasm param signature. (See `vl-monomorphization` memo; folds into A10.)
- ✅ **B4. Closures** (the first WasmGC codegen) — nested decls, capture analysis, env struct,
  escaping closures. REMAINING: mutable captures (boxing / a mutable env cell).
- 🟡 **B5. Objects.** Done on WasmGC structs — literals, read/write, nested, f64 fields, args/returns,
  reassignment, captured-in-closures, excess-property width subtyping, function-valued fields +
  member-call. REMAINING: methods via `self`+UFCS (B14); method-shorthand `{ add(a,b) … }` (parser);
  typed literals in object values (`{n: 4<i64>}`); Exact-by-default for values (A8).
- 🟡 **B6. Collections — `List` is THE user-facing collection** (WasmGC). MVP done: the raw
  fixed-length array — literal/`a[i]`/`a[i]=v`/`a.length`, bounds-trap (today) — now **demoted to
  `List`'s substrate + an optional low-level escape**, not the everyday type (NOT a coexisting tier).
  Design DECIDED: **`List` is the primary collection** (a `{ backing, len, cap }` struct, not tier-2),
  **`[...]` constructs a `List`** (scripting-feel default — Python/JS/Ruby/Swift), **name `List`**,
  **2× growth**, monomorphized-not-boxed, and a **type-level native-indexing flag** (`List`'s
  `[]`/`[]=`/`.length` lower to native `array.get`/`array.set`/`array.len`, bypassing B13 — like the
  `string`/`i32` nominal special-casing). Size-member design DECIDED (→ `DECISIONS.md`). Indexing
  DECIDED: **result-by-default `a[i]: T | null`** (OOB → `null`) for `List` and the raw-array escape —
  flips today's OOB-trap; trapping becomes an opt-in asserting accessor (→ `docs/collections-design.md`).
  `DECISIONS.md` entry lands with implementation.
- ⬜ **B6a. Maps / non-string keys** (`Map<K,V>` — a separate hash type, not every-object-as-table; →
  `DECISIONS.md`). Index sigs `{[string]: T}` type-check but are dropped at codegen — this is their
  codegen. The `"[]"`/`"[]="` traps it rides on are now in place (B13); what remains is the hash
  representation itself (a nominal `Map<K,V>` shape whose `"[]"`/`"[]="` lower to hashed get/set).
  Deferred.
- ⬜ **B6b. Collections building blocks & open items** (design: `docs/collections-design.md`).
  - **Prerequisite intrinsics** — expose the two-primitive surface: dynamic-length `array.new`
    (`__array_new__`/`__array_new_default__`) + bulk `array.copy` (`__array_copy__`), thin
    `defaultScope` intrinsics lowering to the WasmGC instructions the backend already uses for string
    concat/slice. The building block before `List`.
  - **Std-over-primitives direction** — write `List`/collections (and opportunistically `print`) as
    `.vl` std over those intrinsics, not compiler-privileged types (ties to H3 self-hosting). Open
    dependency: VL has no module system yet (std-module loading is unresolved).
  - **`[...]` = `List` literal** (DECIDED) — `[...]` constructs a `List` (scripting-feel default —
    Python/JS/Ruby/Swift); the syntax fork is resolved. The raw fixed array is `List`'s substrate + an
    optional low-level escape, never a coexisting `[...]` meaning. Construction: `[...]` (seed),
    `List<T>()` (empty), `List<T>(capacity: n)` (named).
  - **Raw fixed array as substrate + low-level escape** (DECIDED direction; surface/timing open) — the
    raw array is `List`'s `backing` from day one; *also* exposing it as a user-facing low-level escape
    (advanced `Array<T>` / unsafe primitive for header-less contiguous memory — matters for future
    FFI/SIMD/linear-memory) is a deliberately-advanced future surface, not v1, not the default.
  - **Constant-literal optimization** (future) — a compile-time `[1,2,3]` may emit a `const` array
    backing (a fixed-size `List` whose backing is constant), skipping the header alloc. An
    optimization, still a `List` to the program — not a separate user type.
  - **Indexing default — `a[i]: T | null`** (DECIDED) — result-by-default for `List` *and* the
    raw-array escape: OOB reads return `null`, not a trap (one shared rule; flips today's OOB-trap).
    The trapping form is an opt-in *asserting* accessor (`getUnchecked(i): T` / `a[i]!`), the
    discouraged escape hatch. (→ `docs/collections-design.md` §VL.6.)
  - **Bounds-narrowing — the enabler** (open; **core narrowing engine**, not collections-only) —
    extend VL's flow-narrowing (A5) to array bounds so a provably-in-range `a[i]` (inside
    `for i in 0 to a.length`, after `if i < a.length`, or a guard) narrows from `T | null` to `T` — no
    null-handle, no per-access unwrap, a bare `array.get`. This is what makes result-by-default indexing
    safe AND native-speed; without it the safe default is slower than trapping (a safety-vs-speed
    inversion). Headline enabler for the indexing decision.
  - **Native-indexing flag — resolves the B13 indirect-call cost** (DECIDED resolution; nominal-vs-
    annotation sub-choice open) — a pure-VL `List` whose `l[i]` routes through the B13 `"[]"` method is
    a per-access indirect call. Resolution: a **type-level native-indexing flag** so `List`'s
    `[]`/`[]=`/`.length` lower to native `array.get`/`array.set`/`array.len` on `backing`, bypassing
    B13 (precedent: `string`/`i32` nominal special-casing in codegen). Open sub-choice: **nominal
    recognition** (codegen knows `List` by name, simplest) vs a **declarative native-lowered/intrinsic
    annotation** (any std type opts in). With this + bounds-narrowing + backing-pointer hoisting
    (below), an in-range `a[i]` in a loop is codegen-identical to a raw `array.get` — the one spot
    `List` needs compiler privilege under "std over primitives."
  - **Backing-pointer hoisting (LICM) — the third indexing-perf enabler** (open; likely VL-explicit) —
    even with the native flag, `l[i]` is a `struct.get` (load `backing`) then an `array.get` — two
    loads per element, ~1.5–2× over a raw array in a tight load-bound loop. `backing` is loop-invariant,
    so hoist its load out of the loop (load once, bare `array.get` in the body — instruction-identical
    to a raw-array loop; how LLVM gets Rust `Vec`/C++ `std::vector` to native speed). binaryen's LICM
    over a GC `struct.get` is **not** guaranteed (must prove no `push`/grow/reassign in the loop), so VL
    likely hoists explicitly for the canonical `for i in 0 to list.length { list[i] }` pattern. All
    three enablers together make a list loop instruction-identical to a raw-array loop; missing the
    hoist leaves the per-access `struct.get` cost.
  - **Value vs reference — language-wide** (open; default **reference**) — not collections-only:
    objects *and* collections decided together. v1 = reference everywhere (consistent with VL objects;
    Python/JS/Java); coherent alternative is Swift-style value-everywhere-with-COW, *only if uniform*.
  - **"Result by default" — language principle** (errors-as-values) — fallible ops return values, not
    control-flow escapes: `T | null` for absence, `T | E` (discriminated with `is`) for "failed with a
    reason", over try/catch; **traps reserved for unrecoverable bugs, an explicit discouraged opt-in**.
    Generalizes the errors-as-values direction; indexing (`a[i]: T | null`) and `pop(): T | null` are
    instances. Ties to the AST `// TODO: exceptions` (the broader try/catch question stays open).
  - **List surface/semantics open questions** — capacity/seed construction specifics; `map`/`filter`
    return type; native-flag nominal-vs-annotation; raw-array-escape surface/timing. DECIDED: `List`
    is THE user-facing collection, `[...]`=`List`, name `List`, 2× growth, `pop(): T | null`,
    **result-by-default `a[i]: T | null`** (opt-in asserting/trapping accessor), native-indexing flag.
    Tracked in the design doc.
- 🟡 **B7. Strings.** Done (core): WasmGC i32-array of code points — literal, `.length`/`s[i]`, `+`,
  `==`/`!=`, `print`. REMAINING: switch the backing to `(array mut i16)` + `wasm:js-string` builtins
  (bulk JS-host interop — what dart2wasm/Kotlin-Wasm do); UTF-8/i8 packing (size); richer methods.
- 🟡 **B8. Loops.** Done: `for…in` over arrays, direction-aware `step`, single-line block bodies,
  empty-range warning. REMAINING: `for…in` over objects/maps; `for val, i in arr` and `for , v in obj`
  destructuring forms.
- ✅ **B9. `break` / `continue` in codegen** (incl. labelled `break outer`).
- ✅ **B10. Unary / prefix / postfix ops** (`-`, `++`/`--`, `!`; → `DECISIONS.md` for `!`-not-`not`).
  Minor gaps: `++`/`--` are i32-only and operate on a `Name` (not `o.x++` / `a[i]++`).
- ✅ **B11. `while true` return analysis** — a non-escaping `while true` types as `Never`, so a
  function tail'd by one returns via its inner `return`s with no spurious `| null`.
- ⬜ **B12. `async`/`await`.** Keywords lexed; no semantics/codegen. Large; likely last.
- 🟡 **B13. Well-known-symbol dispatch (operator / call / index).** Done: operator overloading — a
  user-shape operand dispatches through its operator method (stored-closure field *or*, for object-
  shaped operands like `vec + vec`, a free `self`-named operator function that monomorphizes per call).
  Index traps — a user object that declares a `"[]"` method handles `o[k]` (and `"[]="` handles
  `o[k] = v`), dispatched as a field-method call resolved statically; a native i32-keyed array keeps
  its fast `array.get`/`array.set`, so the trap fires only for non-array objects that declare it.
  (→ `DECISIONS.md`.) REMAINING: callable objects (`"()"`).
- ⬜ **B13a. Multi-index matrix idiom** (low priority). Single-bracket `m[i, j]` (comma-separated
  indices → multi-arg `"[]"`/`"[]="` traps) plus a flat-backed `Matrix`/`Grid` type (contiguous
  storage, no array-of-arrays pointer-chase) for cache-friendly numeric work. Nested `m[i][j]`
  already composes today, so this is the ergonomic/perf matrix sugar, not basic 2D support.
- 🟡 **B14. Methods via explicit `self` + UFCS (no `this`).** Done (core): a free `self`-first
  function is callable as `o.f(args)` (rewrites to `f(o, args)`, monomorphized per receiver);
  resolution order field-then-self-fn; non-`self` functions aren't instance-reachable. (Full decision
  set → `DECISIONS.md`.) REMAINING: route operator dispatch (B13) through self-methods; `c.area`
  (no `()`) as a bound value; mutation/variance (A9).
- 🟡 **B15. Lambdas + the declaration-vs-value distinction.** Done (typed): a `FunctionDeclaration` in
  value position lowers to its closure value (let-bound, capturing, higher-order, inline object
  fields). (Syntax + decl-vs-value decisions → `DECISIONS.md`.) REMAINING: **untyped** lambdas (a
  stored closure has one signature — needs pinning-by-use or boxing); method-shorthand parser sugar.
- ⬜ **B16. Redeclaration / overloading.** Current: same-scope redeclaration errors; nested shadowing
  is allowed (uniquified in codegen). Future: ad-hoc overloading? Default "no, one binding per name
  per scope" (→ `DECISIONS.md`).
- 🟡 **B17. Diagnostics.** Started: `severity` (error/warning/info), a `@warning` test directive, the
  empty-range warning. BUILD OUT: thread `severity` through all error variants; stable diagnostic
  codes; a real lint pass (unused vars, unreachable code, dead branches, `step 0`); LSP quick-fixes;
  consistent message style.
- ⬜ **B18. Tail-call optimization** (low priority). binaryen 130 has `return_call`; detect tail
  position and emit it. Deprioritized — correctness is fine; this is a depth/perf optimization.
- ✅ **B19. `return` / early returns** (early, from loops, fall-through; a bare `return` yields null).
- ⬜ **B20. Loops as expressions + `break <value>`.** Lift `for`/`while` into expression position; a
  loop evaluates to its `break` value or `null` (a natural *search* expression — `let found = for x
  in xs { if test(x) { break x } }` → `Nullable<elem>`). Three layers: grammar → types (mirror the
  `returnTypes` mechanism) → codegen (`__brk` block gets a result type). Labels need a per-loop
  break-value collector stack.

---

## Track C — CLI (`vl` / `vital`)

- ✅ **C1. Headless `compile(source) → { ast, wasm, diagnostics }`** (`compiler/compile.ts`), shared
  by the LSP, the test runner, and the CLI.
- ✅ **C2. `vl run`** — compile + run a file / `-e` snippet / stdin (`deno task run`). Drives the VS
  Code Run-Current-File command.
- ✅ **C3. `vl build <file> [-o out.wasm] [--wat]`** — emit wasm bytes (and optional `.wat`).
- ✅ **C4. `vl check <file>`** — diagnostics only, non-zero exit on errors (CI gate).
- 🟡 **C5. Distribution via `deno compile`** — native `vl` binary builds + runs binaryen embedded
  (`deno task compile`/`smoke`); release workflow + brew formula drafted (→ `DECISIONS.md`).
  REMAINING: an actual public release (tag/tap, sha256 bump).

---

## Track D — LSP / editor experience (`lsp/src/server.ts`)
*Mostly independent; benefits from Track A. AST nodes now carry source spans (Track G), unblocking
D1/D2.*

- ✅ **D0. Diagnostics on change.**
- ⬜ **D1. Hover types** (`stringifyType` exists; map a cursor to a symbol/expression via the new spans).
- ✅ **D2. Go-to-definition / find-references.** Parser populates a symbol/binding table
  (`compiler/symbols.ts`) during its scope walk; the LSP queries it by cursor (`textDocument/definition`
  + `textDocument/references`). Locals, params, function decls, type aliases; single-document. → `DECISIONS.md`.
- ⬜ **D3. Autocomplete** (scope-aware; structural members).
- ⬜ **D4. Formatter** (+ `vl fmt`).
- ⬜ **D5. Semantic tokens.**
- ⬜ **D6. Inlay hints** for inferred types — *the* feature for a "types are hidden" language.
- ⬜ **D7. Cross-references in doc-comments** — expand `///` docs with clickable symbol links following
  established conventions (JSDoc `{@link Name}` / rustdoc intra-doc `` [`Name`] ``) rather than a bespoke
  syntax, resolving names via D2's symbol table definition spans for click-to-definition; single-file first,
  workspace-wide later.

---

## Track E — Browser playground + sandbox
*Depends on C1. The compiler is pure TS + binaryen (wasm), so it runs client-side.*

- ⬜ **E1. Bundle the compiler for the browser** (esbuild browser target).
- ⬜ **E2. Playground UI** — Monaco editor + output pane.
- ⬜ **E3. Sandboxed execution** — compiled user wasm in a Web Worker, fresh `Memory`, controlled
  `log` only, enforced limits. The wasm sandbox + worker isolation is the security boundary.
- ⬜ **E4. Shareable links** (encode source in URL / gist).

---

## Track F — Infrastructure & hygiene
*Independent; do continuously.*

- ✅ **F1. Test harness** (`deno task test` over the `.vl` corpus with `// @directive` expectations).
- ⬜ **F2. Gate debug `console.log`s** in `toWasm.ts` behind a debug flag.
- ✅ **F3. Retired `ts-interpreter/` → `reference/`.**
- ⬜ **F4. Re-enable inline `m.validate()`** during dev for earlier failure.
- ⬜ **F5. Settle the name** (VL vs Vital) and apply consistently.
- ⬜ **F6. Document the build** (`deno task build`/`test`; the antlr/gradle gen step is gone).
- ⬜ **F7. Fix the `paramater` misspelling** project-wide (optional; currently consistent).
- ✅ **F8. Dropped the binaryen patch + `patch-package`** (LSP server is ESM, where binaryen's TLA is
  legal). REMAINING (F5-adjacent): confirm vscode-languageclient forking the ESM server in VS Code.

---

## Track G — Hand-written parser ✅ DONE
Replaced antlr4 with a hand-written TS lexer + recursive-descent/Pratt parser that emits the typed
AST directly. antlr4, the gradle project, the generated dirs, and the `gen` task are gone; AST nodes
now carry source spans (`Context = { start, stop }`). This was the parser-side bootstrap gate (H1). →
`DECISIONS.md` for the hand-written-over-generator choice.

---

## Track H — Self-hosting & distribution (the bootstrap end-state)
*The goal: VL compiles itself; the TypeScript/Deno host (Deno, the TS compiler core, the already-gone
antlr/Java generator) retires; the compiler becomes VL→wasm on a generic wasm runtime. The `.vl`
corpus (A12) is the host-agnostic oracle — the same tests pass whichever compiler runs them.
**Distribution does NOT require self-hosting** (the two timelines below are independent).*

- 🟡 **H-M1. Distribute now via `deno compile` (= C5).** Native binary builds + runs binaryen
  embedded — see C5. Decoupled from everything below; today's compiler unchanged.
- ✅ **H1. Parser self-hostable (= Track G).** The one piece that categorically can't live in a
  VL-in-VL compiler is gone.
- ⬜ **H2. Make VL expressive enough to write a compiler.** Recursive tree types (**A11 ✅**), generic
  collections (**A10**, **B6** `List`, **B6a** maps), string munging (**A7** methods). A10 +
  collections are the remaining gap — the capability bar for the port.
- ⬜ **H3. Port the compiler to VL.** Rewrite `toAST`/`typecheck`/`toWasm` as `.vl`, validated by
  running the corpus through the VL-written compiler. Incremental; TS and VL compilers cross-checked.
- ⬜ **H4. WASM emission — DECIDED: emit bytes directly + optional `wasm-opt`** (binaryen's npm build
  is JS-bound; → `DECISIONS.md`, incl. the Heap2Local caveat). binaryen stays for the TS compiler.
- ⬜ **H-M2. Wasm-native distribution (end-state).** The `vl` binary becomes a wasm runtime (wasmtime —
  full WasmGC since v27 / Wasm 3.0) + a small host shim that runs *both* the compiler-wasm and
  user-program-wasm. No V8, no binaryen, no Deno.
- ⬜ **H5. Versioning — deferred; rustup/Volta model, not nvm** (→ `DECISIONS.md`). Make the H-M1
  install path version-stamped so a launcher can slot in later.

**Sequence:** H-M1 (now) → H2 (A10 + collections) → H3 port → H-M2 host swap. Cost is dominated by
H2/H3; H1 done, H4 decided.

---

## Next (highest leverage)

- **A10 generics + collections (B6 `List`, B6a maps)** — the H2 capability bar, and the gate on
  self-hosting (H3). The deepest remaining type-system work.
- **C5 / H-M1** — `deno compile` + brew. Small, decoupled, ships the distribution story now.
- **D1** — hover types, now that AST nodes carry source spans (D2 go-to-def/refs is done).
- Smaller/independent: B6 growable lists, B13 callable-objects, B17 lint pass, A6b Stage A.

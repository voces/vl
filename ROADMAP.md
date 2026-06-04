# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**,
**permissive & structural**, **fully type-safe** (statically sound — there is no
untyped code; inference holes resolve to concrete types), compiling to **lean
WebAssembly**. Deliverables:
**LSP-backed VS Code extension** (exists, partial) · **CLI to compile/run** (missing) ·
**in-browser playground with a sandbox** (missing).

Status legend: ✅ done · 🟡 partial · ⬜ not started.

**Repo layout** (restructured June 2026): `compiler/` — the language core (compile,
toAST, toWasm, defaultScope + generated `antlr/`), owned by nobody else · `lsp/` — the
VS Code extension/LSP client+server over the core · `cli/` (future) · `playground/`
(future) · `grammar/` — the `.g4` spec + antlr gen project · `samples/` · `tests/` —
`.vl` corpus + runner · `docs/` · `reference/` — retired ts-interpreter. Single root
`package.json`/`node_modules` (so esbuild resolves deps from both `compiler/` and `lsp/`)
and root `deno.json` (workspace config + test/lint).

The tracks below are **independent** unless a dependency is called out. Within a
track, items are roughly ordered. See `docs/language-todo.md` for prose on the
closures / `is` / variance designs referenced here.

---

## Track A — Type system (`toAST.ts`)
*Blueprint: Elixir v1.20 set-theoretic types, adapted for a **fully-typed** language
(no `dynamic`/gradual escape hatch — VL has no untyped code). Independent of codegen.*

- 🟡 **A0. Inventory the existing type algebra.** Have: `Alias`, `Function`, `Object`
  (structural, with index signatures), literal types (`IntegerLiteral`/`RealLiteral`/
  `StringLiteral`/`BooleanLiteral`), `Union`, `Nullable`, `Unknown`, `Never`, `Type`,
  `Infer`, `Custom` (predicate). Missing the rest below. Note: `Unknown`/`Infer` are
  **inference holes that resolve** to concrete types, not a runtime `dynamic` — VL is
  fully typed, so there is no gradual escape hatch.
- ⬜ **A3. Intersection types** (`A & B`). Needed for narrowing results and structural
  refinement. Round out the set-theoretic algebra.
- ⬜ **A4. Negation types** (`not A`). Needed so guards can subtract types on the false
  branch.
- ⬜ **A5. Flow narrowing.** Refine a variable's type along control flow (`if`, future
  `case`, guards). Depends on A3/A4. This is what makes structural types precise.
- ⬜ **A6. `is` operator** (ducktype `instanceof`/`typeof` replacement, from TODO.md).
  The guard primitive that feeds A5: `if x is string then …`.
- ⬜ **A7. Real `string` type.** Currently a half-baked `Alias`. Make it a proper object
  type with its methods/operators (mirrors how numerics are modeled in `defaultScope.ts`).
  Needs **B13** (operator-method codegen) to actually emit those operators.
- ⬜ **A8. Exact / Inexact variance** (TODO.md). Params Inexact by default (accept excess
  properties), values Exact. Guard the `a.foo = b` footgun noted in TODO.md.
- ⬜ **A9. Readable / Writable variance** (TODO.md). Applied automatically during
  parameter inference.
- ⬜ **A10. Parametric types / generics.** `function foo<T>(x: T)`. Elixir defers these too —
  hard. Needed for real collections.
- ⬜ **A11. Recursive types.** `getConcreteType` explicitly punts on recursion today.
  Needed for trees/lists/JSON-shaped data.
- ⬜ **A12. Soundness pass / test suite.** Port the "If T" narrowing benchmark idea; build
  a corpus of "must-error" and "must-not-error" programs. Define the soundness contract
  (statically sound — every well-typed program is type-safe at runtime).

---

## Track B — Codegen, memory model & runtime (`toWasm.ts`)
*The "no-GC vs WasmGC" decision lives here. Recommendation: make placement a compiler
decision — escape analysis stack-allocates non-escaping values; escaping values go to
WasmGC; keep manual linear memory as an opt-in escape hatch.*

*Dependency decision: **keep binaryen** (unlike antlr4 — Track G). It's pure WASM/JS,
does the heavy lifting (IR + validation + optimizer), supports WasmGC types (helps
B1/B4), and is a library binding that does **not** block self-hosting. The binaryen
patch was **removed** (F8 done): the LSP server now builds as ESM, where binaryen's
top-level await is legal, so `patch-package` and the 242KB patch are gone. `toWasm`
stays tolerant of both binaryen forms (sync object / async init).*

- ✅ **B0. Numeric literals + i32/f64 arithmetic, if/while, direct calls, `__program__`
  start fn, memory builtins.**
- ✅ **B1. Allocation strategy DECIDED: WasmGC** (June 2026). The heap phase (closures,
  objects, arrays, strings) builds on WasmGC structs/arrays; linear memory stays as an
  opt-in escape hatch; escape-analysis stack-allocation is a later optimization.
  **binaryen upgraded 116→130** for the ergonomic GC API (`module.struct`/`module.array`/
  `TypeBuilder` — absent in 116). The old upgrade blocker (binaryen TLA breaking CJS) is
  moot since the LSP server is ESM. Only API drift: `i64.const` now takes a single bigint.
- 🟡 **B2. Finish numeric codegen.** i64 & f32 binary ops are not wired (only i32/boolean/
  f64 branches exist). Add numeric **casting/coercion** (none today).
- ✅ **B3. First-class functions / indirect calls** — incl. per-shape monomorphization.
  *Representation note: B4 superseded the bare i32 index — a function value is now a fat-pointer
  closure struct `{ i32 tableIndex, structref env }`; the table + `call_indirect` dispatch below
  still stand.*
  A function value is an **i32 index into a wasm function table** (`addTable` +
  `addActiveElementSegment`); function-typed locals/params hold that index and
  `call_indirect` dispatches on it. An un-annotated higher-order param works: `function
  apply(fn, a, b) fn(a, b)` infers `fn` is a 2-arg function (see A6-adjacent inference in
  `toAST.ts`). Indirect-call signatures and inferred return types are read back from the
  monomorphized scope / compiled body (`getExpressionType`), not the once-inferred AST.
  **Per-shape monomorphization (done, → folds into A10):** each call site instantiates a
  *fresh* copy of the (generic) signature — `cloneTypeFresh` gives fresh-but-consistent
  inference holes, unified against that call's args, then collapsed (`makeExact`) to concrete
  types so the check is strict (this also closed the inferred-return soundness gap). Codegen
  keys wasm instances on the **wasm parameter signature** (`name`, `name$1`, …), so
  `apply(addi, …)` and `apply(addf, …)` emit two correctly-typed instances. *Numeric builtins
  now validate **nominally** (by `name`), not by reference identity, since instantiation
  copies types (`defaultScope.ts isNominal`).*
  **Variant-count tradeoff:** closures collapse to 1 instance (shared fat-pointer struct) and
  primitives to ≤4, but a **structural-object** param yields one instance per distinct concrete
  shape passed — WasmGC structs aren't width-subtypes, and the body is compiled against the
  argument's actual shape (so `getx({x,y})` ≠ `getx({x})`). Bounded in practice (few shapes per
  generic); the principled collapse is **WasmGC struct subtyping** via a global field-slot layout
  (row-polymorphism lowering) — a future optimization, not built. See `vl-monomorphization`.
- ✅ **B4. Closures** — full closures WORK (the project's first WasmGC codegen).
  1. **Nested function declarations** — a function-body block caches its value type during the
     walk (so return-type inference survives the scope pop), and Block codegen registers nested
     decls like the Program case.
  2. **Capture analysis** — `instantiate` compiles a capturing body twice: pass 1 collects the
     captured names (placeholders, body discarded) via a function-boundary check in `lookupName`;
     pass 2 recompiles against the env.
  3. **Environment struct** — a WasmGC struct (`TypeBuilder`, one field per capture); captured
     reads `ref.cast` the env parameter to it and `struct.get`. Captures may be objects (refs).
  4. **Escaping closures** — a function value is a **fat pointer**: a uniform WasmGC struct
     `{ i32 tableIndex, structref env }`. Every impl takes a leading `structref` env param (null
     for non-capturing), so all function values are interchangeable; a value packs
     `{ tableIndexOf(f), env }` (env captured at creation time, travels with the value); direct
     calls prepend the env, indirect calls extract index+env and `call_indirect`. Dispatch stays
     table-based (reuses B3). So capturing functions can be returned / stored in fields / passed,
     each keeping its own env (`functions/escaping.vl`: 15, 110, 17).
  Tests: `functions/closure.vl`, `functions/escaping.vl`. REMAINING (smaller): **mutable
  captures** — writing to a captured variable (needs boxing / a mutable env cell; reads are
  by-value today). Depends on B1 (done) + B3 (done).
- 🟡 **B5. Objects in codegen** — core object support DONE on **WasmGC structs** (reusing the
  closure struct machinery). `{x,y}` → `struct.new`; `p.x` → `struct.get`; `p.x = v` →
  `struct.set`. Shapes are interned by a canonical signature (fields sorted by name, mutable),
  so identical shapes share a struct type; `toWasmType` maps a structural Object to its struct
  ref. Working & tested (`objects/struct.vl`, `objects/pass.vl`): literals, read/write, nested
  reads (`p.a.x`), f64 fields, **objects as function args/returns**, **reassignment**, empty
  objects, and **objects captured in closures** (ref-typed env fields). **Excess properties are
  allowed** (permissive structural width subtyping: `function f(o) o.x` accepts `{x,y}`).
  **Function-valued fields + member-call syntax** work: `let o = { f: someFn }` then `o.f(args)`
  (a new `VLCallNode` for calling an arbitrary expression value; dispatches through the closure
  struct, so the field may hold a plain function *or* an escaping closure — `objects/member-call.vl`:
  7, 42, 105). Also fixed a parser precedence bug this surfaced: member-access *reads* (`.`/`[]`)
  bound looser than arithmetic (`a.x + b.y` mis-parsed as `(a.x + b).y`) — moved them above the
  operators in `VL_Parser.g4` + regen. REMAINING (separate features): **methods via explicit
  receiver + UFCS** (see B14 — DECIDED: no `this`), **function literals in object values**
  (`{ f: function() … }` — parser), typed literals in object values (`{n: 4<i64>}` — parser),
  and **Exact-by-default for values** (A8 variance — excess is permissive everywhere today).
- ⬜ **B6. Arrays in codegen** (WasmGC arrays or linear memory). Depends on B1.
- ⬜ **B7. Strings in codegen.** Depends on A7 + B1.
- 🟡 **B8. Loops: wire `for` `step`** (parsed/typechecked but hardcoded `+1`), and
  implement `for…in` over arrays/objects (aspirational in `samples/loops.vl`).
- 🟡 **B9. `break` in codegen** (only `continue` is handled); verify labeled break/continue.
- ⬜ **B10. Prefix/postfix ops in codegen** (`++ -- not !`) — parsed & in the interpreter,
  not in the wasm path.
- ⬜ **B11. `while true` return analysis.** Compiler can't prove an infinite loop always
  returns (malloc has a trailing-`0` workaround). Special-case or add proper reachability.
- ⬜ **B12. `async`/`await`.** Keywords exist in the lexer; no semantics or codegen.
  Large; likely last.
- ⬜ **B13. Well-known-symbol dispatch (operator overloading / callable objects / index
  traps).** Generalize codegen so an operation on a *user* shape calls the typed method named
  for that operation in the shape's contract, instead of being hardcoded. The type system
  **already** dispatches generically — `_typeFromExpression` BinaryOperation (`typecheck.ts`)
  finds the left operand's property whose name matches the operator and checks the right
  operand against its parameter type — but codegen (`toWasm.ts` BinaryOperation) only inlines
  `i32`/`f64`/`boolean` by name and **throws** for any other shape. The fix reuses the B5
  `VLCallNode` / `indirectCall` machinery (already used for `o.f()`): look up the method,
  `struct.get` the closure field, `call_indirect` it — all **static** (monomorphized via B3),
  so it's Proxy-like power with zero runtime reflection / no JS-`Proxy` overhead.
  - **Operator overloading:** `a + b` (and `- * / %  == < …`) on a user object calls its
    `"+"` method (typed `(right: T) -> R`). Mixed operands already expressible — the method's
    parameter type governs the RHS, so `vec + 5` vs `vec + vec` are distinct contracts.
  - **Callable objects:** an object with a `"()"` method **taking parameters and returning a
    value** is invokable — `obj(a, b)` dispatches to that method with `[a, b]` (the call
    operator is overloadable exactly like `+`). Needs (1) grammar/`toAST` to route a call
    whose callee is a *callable-object*-typed value to a `VLCallNode` instead of erroring
    (today `toAST.ts` pushes a `function-call` type error for a non-`Function` callee), and
    (2) the `"()"` well-known name in the operator-lookup path. (Multiple call signatures —
    true ad-hoc overloading by arity/type — is a later extension.)
  - **Index traps:** `o[k]` / `o[k] = v` dispatch to `"[]"` / `"[]="` methods when the shape
    declares them (else the static `struct.get`/`struct.set` field path). This is the
    "built-in instead of `Proxy`" goal: get/set/apply traps as **typed methods in the
    contract**, resolved statically. (Note: index *signatures* `{[string]: i32}` type-check
    today but are **dropped** at codegen — `objectStruct` keeps only StringLiteral keys — so
    dynamic-key storage is a separate runtime-representation question, likely a map/array
    backing, distinct from the trap-dispatch above.)
  Unblocks/over­laps **A7** (a real `string` object type needs exactly this operator-method
  codegen). Reuses B3 (monomorphization) + B5 (`Call`/`indirectCall`).
- ⬜ **B14. Methods via explicit receiver + UFCS (no `this`).** DECIDED: VL has **no `this`
  keyword**. A method is just a function whose first parameter *is* the object, and `o.f(a)`
  is sugar for `f(o, a)` (uniform function call syntax). Rationale: VL already has first-class
  closures and `o.f()`→`indirectCall`, so this adds **no hidden parameter** and no call-site
  rebinding (the JS footgun) — the receiver is an ordinary, visible, type-checked param,
  consistent with "structural, fully typed, no hidden data flow." Methods need no `class`/
  `shape` declaration site and are open/extensible (any module may add `fn area(self: Circle)
  …`). Design decisions captured:
  - **Resolution order for `o.f()`:** a callable **field** `f` on the shape wins (today's B5
    path); else fall back to a free **function** `f` whose first (receiver) param structurally
    accepts `o`. Field-first keeps shapes self-describing and makes UFCS purely additive; emit
    a clear diagnostic if both exist.
  - **Mutation is free, variance is separate:** WasmGC objects are ref-typed, so `self: T`
    is already a reference and `self.x = …` is a `struct.set`. "May a method mutate its
    receiver?" is therefore an **A9 (Readable/Writable)** question, not a receiver question.
  - **`c.area` without `()`:** start as a plain value (resolves only if `area` is a field);
    optional later sugar = a bound method (a closure `() -> area(c)`), purely additive.
  Reuses B5 (`o.f()` lowering). Pairs with B13 (operator/call/index dispatch) — together they
  make "methods, operators, call, index" all ordinary typed functions resolved statically.

---

## Track C — CLI (`vl` / `vital` command)
*New surface. Depends on the existing parse→AST→wasm pipeline being callable outside the
LSP (today `toWasm` only runs inside `server.ts`).*

- ✅ **C1. Extract a headless `compile(source) → { wasm, diagnostics }`** entry point,
  decoupled from the LSP. Done — `compiler/compile.ts` is the single source of truth shared
  by the LSP, `tests/run.ts`, and (future) CLI + browser.
- ⬜ **C2. `vl run <file>`** — compile + instantiate + execute, wiring the `log` import
  (host stdout) the way `server.ts` does today.
- ⬜ **C3. `vl build <file> -o out.wasm`** — emit `.wasm` (and optional `.wat`).
- ⬜ **C4. `vl check <file>`** — diagnostics only, exit code for CI.
- ⬜ **C5. Decide CLI runtime/distribution** — Deno (`deno compile` for a binary) vs Node.
  Affects packaging.

---

## Track D — LSP / editor experience (`server.ts`)
*Mostly independent; benefits from Track A.*

- ✅ **D0. Diagnostics** (parse + type errors) on change.
- ⬜ **D1. Hover types.** `stringifyType` already exists — surface it on hover.
- ⬜ **D2. Go-to-definition / find-references** (needs symbol→source-range tracking;
  AST nodes currently drop most ctx).
- ⬜ **D3. Autocomplete** (scope-aware; structural members).
- ⬜ **D4. Formatter** (+ `vl fmt` in the CLI).
- ⬜ **D5. Semantic tokens** (richer than the TextMate `syntaxes/vital.tmLanguage.json`).
- ⬜ **D6. Inlay hints** for inferred types — *the* feature for a "types are hidden" language.

---

## Track E — Browser playground + sandbox
*Depends on C1 (headless compile). The compiler is pure TS + Binaryen (WASM), so it can
run client-side.*

- ⬜ **E1. Bundle the compiler for the browser** (esbuild target browser; Binaryen runs in
  wasm already).
- ⬜ **E2. Playground UI** — editor (Monaco) + output pane. Reuse the LSP via
  `monaco-languageclient` or run diagnostics inline.
- ⬜ **E3. Sandboxed execution.** Run compiled user wasm in a **Web Worker** with a fresh
  `WebAssembly.Memory`, no host imports except a controlled `log`; enforce limits
  (memory cap, timeout, no network/DOM). The wasm sandbox + worker isolation is the
  security boundary.
- ⬜ **E4. Shareable links** (encode source in URL / gist).

---

## Track G — Replace antlr4 with a hand-written parser
*Goal: drop the antlr4 dependency. Independent; safe to do incrementally because
the `.vl` test corpus is parser-agnostic and `compile()` isolates the parser.*

Why drop it:
- **Heavyweight non-JS build step.** Regenerating the parser (`deno task gen`)
  needs Java + Gradle + the antlr4 gradle plugin — bolted onto a Deno/TS project.
  Every new syntax feature (e.g. the `is` operator) requires a regen.
- **Large committed generated code that drifts.** `VL_Parser.ts`/`VL_Lexer.ts`
  are committed in two places and copied around; they've already drifted (the
  dead interpreter test, a stray `override` type error in the generated parser).
- **Awkward CST→AST layer.** Half of `toAST.ts` is spelunking the untyped parse
  tree (`ctx.expr(0)`, `ctx.LBRACK()`, null-checks). Precedence is encoded as
  ordered `expr` alternatives; newline handling is `NEWLINE*` sprinkled everywhere.
- **Bootstrap blocker.** A Java-toolchain-generated parser can never be part of a
  self-hosted VL compiler. A hand-written one is a stepping stone toward it.

- ⬜ **G1. Hand-written lexer.** The lexer is already essentially a token list
  (`VL_Lexer.g4`); reimplement directly in TS. Cleaner significant-newline
  handling than `NEWLINE*` everywhere.
- ⬜ **G2. Recursive-descent statements + Pratt/precedence-climbing expressions.**
  Pratt handles the operator-precedence cascade elegantly. **Emit the typed AST
  (`VLExpression`/`VLStatement`) directly**, collapsing the CST→AST translation
  out of `toAST.ts` (the type-checking half stays). Full control over error
  messages and incremental parsing; no build step, no generated blob.
- ⬜ **G3. Keep `.g4` (or an EBNF doc) as the human-readable grammar spec.**
- ⬜ **G4. Delete antlr4 deps, the gradle project, generated dirs, and the
  `gen` task.** The `.vl` corpus validates behavior across the swap.
- Alternatives considered: a pure-JS PEG generator (peggy) drops Java but keeps a
  generic tree + a dep; parser combinators similar. Hand-written wins on errors
  and bootstrappability for a grammar this small.

---

## Track F — Infrastructure & hygiene
*Independent; do continuously.*

- ✅ **F1. Test harness for the wasm path.** `deno task test` runs `tests/run.ts` over a
  black-box `.vl` corpus with `// @directive` expectations. (`reference/ts-interpreter`
  was the only prior test; excluded via `deno.json`.)
- ⬜ **F2. Strip / gate debug `console.log`s** in `toWasm.ts` (getFunction, "???",
  emitText dumps) behind a debug flag.
- ✅ **F3. Retired `ts-interpreter/` → `reference/ts-interpreter/`** (stale tree-walking
  backend; kept for reference, excluded from tests/lint).
- ⬜ **F4. Re-enable inline `m.validate()`** during dev (currently only the final validate
  runs) for earlier failure.
- ⬜ **F5. Settle the name** (VL vs Vital vs Vital Language) and apply consistently.
- ⬜ **F6. Document grammar regen** (`deno task gen`, needs gradle + the antlr4 project)
  and the build (`deno task build`).
- ⬜ **F7. Fix the `paramater` misspelling** project-wide (optional; currently consistent).
- ✅ **F8. Dropped `patches/binaryen+116.0.0.patch` + `patch-package`.** The LSP server
  now builds as **ESM** (`dist/server.mjs`, `--format=esm`); the client stays CJS
  (`dist/extension.js`). binaryen's top-level await is legal in ESM, so no patch is
  needed. Cleared all 9 `npm audit` advisories (77→13 packages). Verified headlessly:
  esbuild-bundled unpatched binaryen compiles + runs a VL program under Node. **Still to
  confirm in VS Code (F5):** vscode-languageclient forking an ESM server over IPC.

---

## Suggested first moves (highest leverage, lowest risk, mostly independent)
1. ✅ **C1** — headless `compile()`. Done: unblocked the CLI, the browser, *and* the
   `tests/run.ts` corpus.
2. **B3** — finish indirect calls (in flight) to unblock closures (B4).
3. **A6 + A5** — `is` operator + flow narrowing. The set-theoretic payoff for a fully-typed
   language: structural guards that refine types along control flow (needs A3/A4 first).

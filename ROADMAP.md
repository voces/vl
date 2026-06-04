# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**,
**permissive & structural**, **fairly type-safe** (sound where types are known,
`dynamic` elsewhere), compiling to **lean WebAssembly**. Deliverables:
**LSP-backed VS Code extension** (exists, partial) · **CLI to compile/run** (missing) ·
**in-browser playground with a sandbox** (missing).

Status legend: ✅ done · 🟡 partial · ⬜ not started.

The tracks below are **independent** unless a dependency is called out. Within a
track, items are roughly ordered. See `vscode-extension/TODO.md` for prose on the
closures / `is` / variance designs referenced here.

---

## Track A — Type system (`toAST.ts`)
*Blueprint: Elixir v1.20 set-theoretic + gradual inference. Independent of codegen.*

- 🟡 **A0. Inventory the existing type algebra.** Have: `Alias`, `Function`, `Object`
  (structural, with index signatures), literal types (`IntegerLiteral`/`RealLiteral`/
  `StringLiteral`/`BooleanLiteral`), `Union`, `Nullable`, `Unknown`, `Never`, `Type`,
  `Infer`, `Custom` (predicate). Missing the rest below.
- ⬜ **A1. `dynamic()` type** (replaces the role of `any`). The gradual escape hatch;
  behaves statically when absent. Foundation for permissiveness.
- ⬜ **A2. Disjoint-only errors.** Change `ensureType` to emit a violation **only when
  supplied and accepted types are provably disjoint** (Elixir's rule). Today it's strict
  and will throw false positives as inference gets fuzzy — directly at odds with the
  "permissive" goal. *Highest-leverage, lowest-risk starting point; independent of GC.*
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
  (sound modulo `dynamic`).

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
- ⬜ **B1. Decide allocation strategy** (see top of track). Recommendation: WasmGC as the
  default "heap", escape analysis for "stack", linear memory as escape hatch. *Unblocks
  B5/B6/B7; everything heap-shaped waits on this.*
- 🟡 **B2. Finish numeric codegen.** i64 & f32 binary ops are not wired (only i32/boolean/
  f64 branches exist). Add numeric **casting/coercion** (none today).
- 🟡 **B3. First-class functions / indirect calls** (in progress, currently broken). Build a
  wasm **function table** + elem segments; store table indices in locals; fix
  `call_indirect`. Generalize monomorphization beyond resolved-name + param validation
  (no real polymorphism today). See `vl-current-work-indirect-calls` memory.
- ⬜ **B4. Closures** (TODO.md plan). Static stack-vs-heap promotion via escape analysis:
  a variable captured by a child function gets promoted (`memoryType: stack → heap`),
  detected by comparing declaration scope to reference scope. Depends on B1 + B3.
- ⬜ **B5. Objects in codegen.** Type system models them structurally, but `toWasmType`
  only handles i32/f64/funcref/none. Lay out objects (WasmGC structs or linear memory).
  Depends on B1.
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

---

## Track C — CLI (`vl` / `vital` command)
*New surface. Depends on the existing parse→AST→wasm pipeline being callable outside the
LSP (today `toWasm` only runs inside `server.ts`).*

- ⬜ **C1. Extract a headless `compile(source) → { wasm, diagnostics }`** entry point,
  decoupled from the LSP. Single source of truth shared by CLI, LSP, and browser.
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
  black-box `.vl` corpus with `// @directive` expectations. (`ts-interpreter` was the
  only prior test; excluded via `deno.json`.)
- ⬜ **F2. Strip / gate debug `console.log`s** in `toWasm.ts` (getFunction, "???",
  emitText dumps) behind a debug flag.
- ⬜ **F3. Decide the fate of `ts-interpreter/`** — keep as a reference oracle for tests,
  or retire. It's older than the wasm path.
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
1. **A2 + A1** — `dynamic()` and disjoint-only errors. Reshapes the type system toward the
   permissive vision without touching codegen.
2. **C1** — headless `compile()`. Unblocks the CLI, the browser, *and* a real test suite.
3. **B3** — finish indirect calls (already in flight) to unblock closures.

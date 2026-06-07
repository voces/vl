# VL — Changelog

Shipped work, in rough area order. Each entry is a terse one-liner; detail lives in git
history, linked PRs, and `docs/`. For the forward plan see **`ROADMAP.md`**; for rationale
see **`DECISIONS.md`**.

---

## Type system (Track A)

- **A0 Type-algebra inventory** — `Alias`, `Function`, `Object` (structural + index sigs), literal types, `Union`, `Nullable`, `Intersection`, `Negation`, `Unknown`/`Infer`, `Never`, `Type`, `Custom`.
- **A3 Intersection surface syntax** — `A & B` parses, binds tighter than `|`, folds through `intersectType` at parse time; narrowing algebra (`intersectType`) done.
- **A4 Negation surface syntax** — `!A` and `x !is T` (Kotlin-style negated guard); `subtractType` narrowing algebra. → `DECISIONS.md`
- **A5 Flow narrowing (broad)** — nullness, union-member, post-guard clauses, `&&`/`||` chains, De Morgan, else-of-else-if, literal discrimination, `?.`/`??`. (→ `docs/narrowing.md`)
- **A6 `is` operator + tagged unions** — `x is T` discriminates a value union at runtime (niche/value-kind/boxed encodings, global tag registry, `coerceUnion`). (→ `docs/unions.md`)
- **A6b Proof-carrying narrowing (degenerate)** — a body that is exactly `return <predicate-on-a-param>` is an inferred guard; guard-clause `if absent(v) { return }` supported.
- **A7 Real `string` type (core)** — proper Object (`{[i32]: i32}` index sig → i32-array of char codes), `.length`/`s[i]`/`+`/`==`/`slice`/`indexOf`/`includes`/`charCodeAt`.
- **A10 Parametric types / generics** — Stage 1 (function type params), Stage 2 (array element inference), Stage 3 (generic `type` aliases incl. nested/array); `map`/`filter` build-side generics over growable `T[]`. (`tests/cases/generics/`)
- **A11 Recursive structural types** — `type Tree = { value, left: Tree | null, … }` constructs/traverses/compiles (cycle-safe traversals + self-referential WasmGC rec-group).
- **A12 Soundness corpus (started)** — must-error/must-not-error corpus under `tests/cases/soundness/`; strict by default; known-unsound corners `xfail`-marked.
- **A13 Operator-constraint inference (core)** — fully-inferred structural functions monomorphize per call shape (i32 & f64 from two call sites).
- **A14 Named/opaque type crash fix** — bodyless-`type Point` infinite-recursion crash fixed (cycle-guarded `getConcreteType`; now errors cleanly). → `DECISIONS.md`
- **A15 Structural equality** — `==`/`!=` by value; functions by reference; arrays + nested structs recurse via `valueEq`/`isEquatable`. → `DECISIONS.md`
- **A16 Literal-union types (type-level)** — annotations constrain (`"a"|"b"` rejects `"c"`); `==`/`!=` discriminate + narrow; covering `if/else if` chain exhaustive.
- **A7b `boolean`-where-`i32`-expected coercion** — a `boolean`-typed VALUE coerces to `i32` (true→1, false→0) at an assignment boundary (binding/argument/return); no-op in codegen (shared i32 rep). One-directional (`i32` ⊄ `boolean`); excludes a bare boolean literal and membership/narrowing queries (`x is boolean` on `string | i32` still rejected).
- **A17 Forward / mutual-reference return-type inference** — demand-driven (lazy + memoized, cycle-detected) return-type inference; a function calling a later-defined or mutually-recursive function no longer infers `any`; only a genuinely base-case-less inferred cycle still needs an explicit annotation. (#105; detail: `docs/selfhost-gaps.md` §A17)

## Codegen, memory & runtime (Track B)

- **B0 Numeric literals, i32/f64 arithmetic, if/while, direct calls, start fn, memory builtins.**
- **B1 Allocation = WasmGC** (binaryen 116→130 for GC API). → `DECISIONS.md`
- **B2 Numeric codegen (core)** — i64 & f32 arithmetic + float `/` & comparisons; i64/f32 type mappings; range-aware integer-literal defaults.
- **B2 Value-level bitwise/shift operators** — `& | ^ ~ << >> >>>`, integer-only, i32/i64 → native wasm instructions (#99; H4.2 self-host gap).
- **B3 First-class functions / indirect calls + per-shape monomorphization** — fat-pointer closure `{ tableIndex, env }`; each call site gets a fresh signature keyed by wasm param signature.
- **B4 Closures (first WasmGC codegen)** — nested decls, capture analysis, env struct, escaping closures.
- **B5 Objects (core)** — literals, read/write, nested, f64 fields, args/returns, reassignment, captured-in-closures, excess-property width subtyping, function-valued fields + member-call; method-shorthand `{ add(a,b){…} }`.
- **B6 Growable `T[]` (core)** — `{backing,len,cap}` WasmGC struct monomorphized per element type; 2× growth; `[...]` seed; `a[i]`/`a[i]=v` trap on OOB; `.length`/`.get(i)`/`push`/`pop`/`clear`/`+`; for-in + structural equality updated. (`compiler/builtins/lists.ts`; → `docs/collections-design.md`) `.capacity` removed (leaky growth detail; `cap` stays internal). → `DECISIONS.md`
- **B6b Build-loop fusion** — `const a = [..seed]` + `for i in A to B { a.push(e) }` (bare push, step-1, `e` free of `a`) lowers to a pre-sized indexed fill, ~2–3× faster than per-element push (elides the frontier bounds-check the engine can't); guard-gated, falls back to push otherwise. (`tests/cases/lists/build-fusion-*`; → `DECISIONS.md`)
- **B6a `Map` + `Set` (core)** — ordered open-addressing hash maps (Python-dict shape) over WasmGC; string keys; `Map[k]: V|null`; `.size`/`.get`/`.has`/`.set`/`.delete`/`.keys()`/`.values()`; `Set` `.add`/`.has`/`.delete`; deterministic insertion-order iteration; tombstone-aware probing + compaction. (`compiler/builtins/maps.ts`)
- **B7 Strings (core)** — WasmGC i32-array of code points; literal, `.length`/`s[i]`, `+`, `==`/`!=`, `print`.
- **B8 Loops (core)** — `for…in` over arrays, direction-aware `step`, single-line block bodies, empty-range warning.
- **B9 `break` / `continue` in codegen** (incl. labelled `break outer`).
- **B10 Unary / prefix / postfix ops** — `-`, `++`/`--`, `!`. → `DECISIONS.md` for `!`-not-`not`.
- **B11 `while true` return analysis** — non-escaping `while true` types as `Never`; no spurious `| null` on functions tail'd by one.
- **B13 Well-known-symbol dispatch (operators + index)** — operator overloading via `"+"` field or free `self` function; `"[]"`/`"[]="` index traps dispatched statically. → `DECISIONS.md`
- **B14 Methods via explicit `self` + UFCS (core)** — free `self`-first function callable as `o.f(args)`; field-then-self-fn resolution; non-`self` functions not instance-reachable. → `DECISIONS.md`
- **B15 Lambdas / declaration-vs-value (typed)** — `FunctionDeclaration` in value position lowers to its closure value (let-bound, capturing, higher-order, inline object fields). → `DECISIONS.md`
- **B17 Diagnostics + lint (started)** — `severity`, `@warning` directive, empty-range warning, stable `code`s; lint pass (`compiler/lint.ts`): unused-variable, unreachable-code (`unnecessary` tag = VS Code grey-out).
- **B17 Export-aware top-level unused** — exported top-level bindings exempt from unused-variable lint; landed with `export` keyword (H0 phase 1).
- **B19 `return` / early returns** — early, from loops, fall-through; bare `return` yields null.
- **B-debug Name section + source maps + trap-to-source** — wasm name section + Source Map v3 (binaryen debug locations, survives `optimize()`); trap → precise VL `file:L:C` error message. (#76)

## CLI (Track C)

- **C1 Headless `compile(source) → { ast, wasm, diagnostics }`** (`compiler/compile.ts`), shared by LSP, test runner, and CLI.
- **C2 `vl run`** — compile + run a file / `-e` snippet / stdin (`deno task run`).
- **C3 `vl build <file> [-o out.wasm] [--wat]`** — emit wasm bytes (+ optional `.wat`).
- **C4 `vl check <file>`** — diagnostics only, non-zero exit on errors; `--codegen` opt-in for full binaryen pipeline.
- **C5 Distribution via `deno compile`** — native `vl` binary (binaryen embedded); `deno task compile`/`smoke`; 11 smoke checks pass. → `DECISIONS.md`

## LSP / editor (Track D)

- **D0 Diagnostics on change.**
- **D1 Hover types** — `onHover` resolves cursor via D2 symbol table + `receiver.member` (object fields, array/list/string members via `typeFromExpression`/`listMemberType`/field); rendered via `stringifyType`.
- **D2 Go-to-definition / find-references** — symbol/binding table (`compiler/symbols.ts`); `textDocument/definition` + `textDocument/references`; locals, params, function decls, type aliases, single-document. → `DECISIONS.md`
- **D3 Autocomplete (core)** — scope-aware identifier completion + structural member completion (`lsp/src/typeFeatures.ts`); tested (`tests/lsp_completion_test.ts`).
- **D4 Formatter (core)** — AST-driven source formatter (`compiler/format.ts`, `vl fmt`, LSP `textDocument/formatting`); idempotent, round-trip-AST-equivalent, comment-preserving, 80-col reflow.
- **D5 Semantic tokens** — `textDocument/semanticTokens/full`: identifiers via D2 table, literals/keywords/operators via lexer, comments by source scan, `receiver.member` names (→ `property`/`method`).
- **D6 Inlay hints** — inline `: <type>` at unannotated `let`/`const`/params and omitted returns; annotated positions and unresolved holes suppressed.
- **D3 Keyword + snippet completions** — 26 keywords + 10 snippet skeletons with tab-stops; after-dot completions suppress keywords/snippets; trigger-character tuning. (#143)
- **D4 Formatter: collapse short if/if-else** — a single-conditional `if { stmt }` or `if { a } else { b }` that fits 80 cols folds to one line; comments/multi-statement bodies stay block. (#138)
- **D4 Formatter: trailing comment on `type` alias** — a trailing comment on a `type X = …` line now stays on that line instead of being displaced. (#146)
- **D4 Formatter: verbatim-fallback for fn with commented expression body** — a function whose body is a single expression spanning multiple lines with an own-line comment is reproduced verbatim, preventing the comment from being displaced after the closing brace.
- **D7 Doc-comment cross-references (single-file)** — `` [`Name`] `` / `[Name]` rustdoc-style intra-doc links in `///` comments resolve via D2's symbol table and render as clickable markdown links in hover and completion `documentation`; unresolved names left verbatim; cross-import resolution deferred (needs H0 phase 3 module graph).

## Browser playground (Track E)

- **E1 Browser bundle** — esbuild + `esbuild-deno-loader`; binaryen@130 runs client-side ESM; `deno task playground`.
- **E2 Playground UI (core)** — `<textarea>` + Run + diagnostics/log/WAT panes + sample picker (`playground/`).
- **E4 Shareable links** — source encoded in URL hash (#94).

## Infrastructure (Track F)

- **F1 Test harness** — `deno task test` over the `.vl` corpus with `// @directive` expectations.
- **F3 Retired `ts-interpreter/` → `reference/`.**
- **F8 Dropped binaryen patch + `patch-package`** — LSP server is ESM; binaryen's TLA is legal there.
- **F9 Perf baseline** — `deno task perf`; compile-time (front/codegen split) + wasm size over corpus; best-of-N. Finding: literal-union compilation is ~cubic in member count (200 → ~2 s). (→ `docs/perf-findings.md`)
- **F9c Memoize `structSig` in `toWasm.ts`** — the structural-signature walk was uncached and dominated IR-build on the self-host module (~6 s of ~7.7 s total; 268k calls). Caching by type-node identity (empty `nameStack` only) cut selfhost-suite wall time ~107 s → ~30 s with byte-identical wasm. Post-fix: binaryen `optimize()` is only ~0.8 s on this module, not the bottleneck. (#107; detail: `docs/perf-findings.md`)
- **F10 Bare `deno check` passes** — lsp sub-project excluded; playground + lsp-test type errors fixed so top-level `deno check` exits clean. (#140)
- **F11 CI skips heavy suite for docs-only changes** — an in-job `git diff` gate (not a workflow-level `paths` filter) `if`-guards the heavy steps, so docs-only PRs go green fast while the `ci` check still reports. (#142)

## Parser (Track G — complete)

- **G Hand-written parser** — replaced antlr4 with hand-written TS lexer + recursive-descent/Pratt parser emitting the typed AST directly; antlr4/Gradle/generated dirs gone. → `DECISIONS.md`
- **G AST source spans** — `NodeSpans` + `spanOf` publicly exposed via `toAST`/`compile`; unblocks D4/D6/D7.
- **G Comment-carrying tokens** — comments retained with spans (flat `comments` list + per-token `leading`/`trailing` trivia) without entering the grammar stream; unblocks AST-driven formatter.

## Self-hosting & modules (Track H)

- **H0 Module system phase 1** — relative-path named `import { a, b as c } from "./util"` + `export` modifier on `function`/`let`/`const`/`type`; whole-program resolver walks import graph, detects cycles, type-checks across modules, merges into ONE wasm module with per-module name mangling. `compileProgram`/`checkProgram`. (#96; → `DECISIONS.md`, `docs/modules-design.md`)
- **H-M1 Distribute via `deno compile`** — same as C5.
- **H1 Parser self-hostable** — same as Track G above.
- **H2 gap-1 Push non-nullable struct array** — `Tok[]` works; backing slot nullable-widened to `(ref null $T)`; reads `ref.as_non_null` to surface non-null type. Unblocks AST-node lists.
- **H2 gap-2 Module-level mutable `let` through a function** — scalar top-level bindings lower to shared wasm `global` (`global.get`/`global.set`). (`tests/cases/globals/`)
- **H2 gap-3 String escapes** — `\n`/`\t`/`\xXX`/`\uXXXX`/… decoded in lexer.
- **H2 gap-4 `toString` prototype-chain leak fix** — scope lookup uses `Object.hasOwn` everywhere (closes `constructor`/`valueOf`/etc. hazards).
- **H2 gap-5 `fromCodePoint(code): string` builtin** — code-point-named; replaces JS-ism `fromCharCode`.
- **H2 gap-6 Ref/string module-globals through a function** — extends gap-2's scalar-only support to ref/string cells.
- **H2 gap-7 One-char string literal `.length`** — string literals soften to nominal `string`; no longer mis-types as a char.
- **H2 char literals + `toString`/stringify** — both landed as part of H2 gap work.
- **H3-gap3 `checkProgram` in value position** — resolved by #89 (void/statement-position value drop); a discarded value is dropped in statement position, so `checkProgram(...)` as a bare statement (or `let r = ...`) no longer hits "Expected numeric type" in codegen. (detail: `docs/selfhost-gaps.md` §3)
- **H4.2 Value-level bitwise/shift operators** — shipped in #99 (see B2 above).
- **H4.3 Unsigned right-shift** (`>>>`) — resolved by #99 (`>>>` is now a native operator); `ulebToArr` in `wasmEmit.vl` uses `v >>> 7` for all i32 values including those with bit 31 set. (detail: `docs/selfhost-gaps.md` §H4.3)
- **H4.4 Signed `%` sign fix** — resolved via H4.2 (#99): `& 0x7f` / `& 0xff` bitwise masks replace the arithmetic correction branches; naturally unsigned, no special-casing needed. (detail: `docs/selfhost-gaps.md` §H4.4)
- **H-pipeline VL-in-VL front end end-to-end** — `lexer.vl → parser.vl → typecheck.vl` chain driving source text through a wired pipeline; proves the front end self-hosts. (`tests/selfhost_pipeline_test.ts` + `tests/selfhost/pipeline_harness.vl`)
- **H-emitProgram structs** — `emitProgram` parses + emits WasmGC struct types, `struct.new`, and `struct.get`; construct + field-read proven by real `WebAssembly.instantiate`. (#137)
- **H-emitProgram arrays** — `emitProgram` parses + emits WasmGC array ops: literal (`array.new_fixed`), index read/set, `.length`; 8 new live-instantiation cases. (#145)
- **H-emitProgram strings** — `emitProgram` lowers string literals + `.length`/`s[i]` to the array-i32 code-point representation (a VL string is CURRENTLY an `array i32` of code points, reusing the arrays slice's `(array (mut i32))` machinery); string-typed locals/params/returns carry the array ref valtype; 7 live-instantiation cases. Concat (`+`), equality (`==`), and the UTF-8 `array i8` storage migration (B7) are deferred.
- **H-exports Host-callable wasm exports** — entry-module `export function`s become host-callable wasm exports via a thin scalar no-env wrapper; non-entry exports remain DCE-able. (#141; → `DECISIONS.md`)

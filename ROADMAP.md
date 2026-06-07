# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**, **permissive &
structural**, **fully type-safe** (statically sound — no untyped code; inference holes resolve to
concrete types), compiling to **lean WebAssembly**. Deliverables: an **LSP-backed VS Code extension**
(partial), a **CLI** (`deno task run`/`build`/`check`; native binary TBD), and an **in-browser
playground** (partial).

Status: 🟡 partial · ⬜ not started.

**Repo layout:** `compiler/` — the language core (compile, toAST, typecheck, toWasm, defaultScope) ·
`lsp/` — the VS Code extension + LSP server over the core · `grammar/` — the `.g4` spec (reference
only; the parser is hand-written) · `samples/` · `tests/` — `.vl` corpus + runner · `docs/` ·
`reference/` — retired ts-interpreter. Tracks are **independent** unless a dependency is called out.

> **Maintaining this file.** The roadmap is *forward-looking* — what to do next, why, dependencies,
> what's remaining.
> - *Shipped work?* → `CHANGELOG.md`.
> - *Why we chose something non-obvious?* → `DECISIONS.md`.
> - *How an already-done thing works?* → the code + git history, or a `docs/<subsystem>.md` explainer.
>
> Done items graduate to CHANGELOG. Partial items keep only the remaining/forward part. (Agents:
> on finishing, move the item to CHANGELOG as a one-liner; put rationale in `DECISIONS.md`.)

---

## Next (highest leverage)

- **Contextual parameter inference (A-infer-ctx)** — infer lambda param types from the expected
  function type at the call site (`xs.map(function(n) n*2)`). 🟡 In-progress
  (`claude/contextual-param-inference`).
- **Robustness floor (A-robust)** — an unresolved `Infer`/`Unknown` must yield a clear diagnostic,
  never a cryptic codegen crash (repro: `const xs = []; xs.push(1)`).
- **Exhaustiveness analysis for `is`-chains (A-exhaust)** — flag dead arms, enable omitting the
  final `else`, elide provably-true discriminants in codegen.
- **H4.1 / H4.5–H4.6** — remaining self-host codegen gaps before VL-in-VL can emit wasm.
- **H2a Re-land clean `selfhost/lexer.vl`** — now unblocked; first concrete H3 slice.
- **C5 / H-M1** — `deno compile` + brew tap. Small, decoupled; ships the distribution story now.
- Smaller/independent: B6b collections building blocks, B13 callable objects, B17 lint backlog,
  A6b Stage A, A3 structural intersection merge.

---

## Track A — Type system (`typecheck.ts`)
*Blueprint: Elixir v1.20 set-theoretic types, fully-typed (no gradual escape hatch).*

- 🟡 **A3. Intersection types** (`A & B`). REMAINING: object-type structural intersection
  (`{x} & {y}` merge — needs `intersectType`/`meet` extension; today distinct objects meet to `Never`).
- 🟡 **A4. Negation types** (`!A`). REMAINING: full open-world negation tracking (needs A12).
- 🟡 **A5. Flow narrowing.** REMAINING: `case`/multi-guard (no grammar); stored-witness (A6b Stage B);
  optional *call* `x?.f()` + chain short-circuit `x?.y.z` (use `x?.y?.z`); per-call
  reachability-pruned return types (blocked on memoize-with-holes — see `docs/narrowing.md`).
- 🟡 **A6. `is` operator + tagged unions.** REMAINING: `ref.test` fast-path for ref-vs-ref; union
  arrays (`[boolean | i32]`); declared type-guard signatures (A6b Stage A).
- 🟡 **A6b. Proof-carrying narrowing (type guards as values).** REMAINING — **Stage A:** richer
  discriminants (`if bar(x) is null`), multi-input correlation, declared (verified) predicate
  signatures. **Stage B:** stored witness (`const f = bar(x); … if f is null` narrows x) — needs
  binding tracking + invalidation (a lightweight borrow). Stage B also subsumes per-call tight return
  types (the forward direction of the same correlation).
- 🟡 **A7. Real `string` type.** REMAINING: `boolean`-where-`i32`-expected coercion. (UTF-16 backing is B7.)
- ⬜ **A8. Exact / Inexact variance.** Params Inexact by default (accept excess properties), values
  Exact. Guards the `a.foo = b` width footgun. (TODO.md)
- ⬜ **A9. Readable / Writable variance.** Applied automatically during parameter inference. (TODO.md)
- 🟡 **A10. Parametric types / generics.** REMAINING: same `map`/`filter` generics for `Map`/`Set`
  (B6a); **const generics** (numeric/value type parameters, e.g. `Decimal<10, 8>` /
  `Buffer<N>`) — today generics take *type* params only; enabler for the parameterized
  `Decimal<Backing, Scale>` family (B2) and any fixed-size/parameter-by-value type.
  (Forward/mutual-reference return-type inference: shipped as A17 — see `CHANGELOG.md`.)
- 🟡 **A11. Recursive structural types.** REMAINING: mutual recursion across *separate* `type` decls;
  recursion through an **array** element (`{ rest: [List] }`).
- 🟡 **A12. Soundness corpus.** REMAINING: keep growing it; the known-unsound corners are
  `xfail`-marked (e.g. the permissive `i32 + string` hole rule, A13).
  **Known bugs (all RESOLVED; pinned by passing cases):**
  - ✅ **A12-bug1. `is <literal>` always-false on literal-unions** — RESOLVED.
    (`literal-is-runtime-value.vl`; detail: `docs/soundness-findings.md` §literal-is-always-false)
  - ✅ **A12-bug2. Flat `A|B|null` `is`-chain "illegal cast" trap** — RESOLVED.
    (`struct-union-null-is-chain-sound.vl`; detail: `docs/soundness-findings.md` §struct-union-null-is-chain)
  - ✅ **A12-bug3. `x?.field` false error when `x` is typed via a named alias** — RESOLVED.
    (`optional-chain-coalesce-sound.vl`; detail: `docs/soundness-findings.md` §optional-chain-named-alias)
- 🟡 **A13. Operator-constraint inference.** REMAINING: the hole-operand rule is permissive (doesn't
  reject `i32 + string` yet); the *stored-closure* operator case (`vec + vec` via a `"+"` field)
  still hits the WasmGC width wall (B13).
- 🟡 **A14. Named/opaque types.** REMAINING: real **nominal/opaque types** (decision: clean-error-for-now → `DECISIONS.md`).
- 🟡 **A15. Equality.** REMAINING: a referential-identity operator (`===` / `identical`, O(1) `ref.eq`);
  `boolean`→i32 coercion when storing a comparison result.
- 🟡 **A16. Literal-union types.** REMAINING: the **enum representation** (i32 tag for a closed
  literal union — see `docs/unions.md`); a literal union read *inside* a body softens to base
  (coarser member-narrowing there than at the call boundary).
- ⬜ **A17 follow-up: `never` inference + `unconditional-recursion` lint.** A17 demand-driven inference
  is shipped. REMAINING: (a) infer `never` for a genuinely base-case-less divergent recursive cycle
  (currently a stopgap "annotate a return type" error); (b) an `unconditional-recursion` lint that fires
  even when the return type is explicitly annotated (catches accidental infinite loops).
- 🟡 **A-infer-ctx. Contextual parameter inference.** In-progress (`claude/contextual-param-inference`).
  Infer lambda/callback param types from the **expected function type** at the call site, e.g.
  `xs.map(function(n) n*2)` infers `n: i32` from `T[]`'s element type. Consistent with the
  "hide types where possible" identity; today untyped lambda params are a type error. Ties A10 (generic
  element type) and B15 (untyped lambdas).
- ⬜ **A-infer-empty. Usage-based inference for empty collections.** Infer `Map()`/`Set()`/`[]` element
  / key / value types from **later usage** (`m.set(k,v)`, `xs.push(x)`) — like evolving-array
  inference. Today `const xs = []` then `xs.push(1)` crashes with an `Infer`/`Unknown` codegen error
  rather than inferring `xs: i32[]` from the `push` constraint.
- ⬜ **A-infer-params. Top-level function param inference.** Infer named-function param types from
  usage constraints (HM / the existing A13 row-poly inference path), consistent with "hide types where
  possible." Requiring annotations on all named-fn params is NOT VL's stated stance.
- ⬜ **A-exhaust. Exhaustiveness analysis for `is`-chains.** Three sub-items all reuse the existing
  `conditionsExhaust` helper: (a) flag a **dead arm / dead `else`** after an already-exhaustive chain;
  (b) recognize exhaustiveness for return-coverage so the trailing `else` can be **omitted** (the
  checker sees the chain as covering); (c) **codegen**: elide the provably-true final discriminant test
  + drop the dead arm — a type-driven optimization binaryen cannot do (it lacks union exhaustiveness).
- ⬜ **A-robust. Robustness floor.** An unresolved `Infer`/`Unknown` type must produce a clear
  **"cannot infer — annotate"** diagnostic; it must NEVER surface as a cryptic `Unhandled "Unknown"
  type` codegen error or a `containsInfer` TypeError crash. Repro: `const xs = []; xs.push(1)`.
  Ties A-infer-empty (fixing that removes the main trigger).

---

## Track B — Codegen, memory model & runtime (`toWasm.ts`)
*Allocation = WasmGC; binaryen stays (it doesn't block self-hosting). → `DECISIONS.md`.*

- 🟡 **B2. Numeric codegen.** REMAINING: explicit value casting/coercion between numeric types
  (today only literals coerce); **`0x` hex / `0o` octal / `0b` binary integer literals + digit
  separators** (`1_000`, `0xFF_FF`) — a lexer/parser add; **arbitrary-precision `BigInt` and a
  `Decimal<Backing, Scale>` family** as future `std`-library generic types (not primitives).
  Prereq: const generics (A10).
- 🟡 **B5. Objects.** REMAINING: methods via `self`+UFCS (B14); typed literals in object values
  (`{n: 4<i64>}`); Exact-by-default for values (A8).
- 🟡 **B6. Collections — growable `T[]`.** REMAINING: in-place bulk append (deferred — will be
  `xs.push(...ys)` once variadics land); representation inference (§VL.7 — lower never-grown
  values to a header-less fixed array); `map`/`filter` build-side generics for `Map`/`Set` (A10);
  `.vl`-std migration once a module system exists. (design: `docs/collections-design.md`)
- 🟡 **B6a. `Map` + `Set`.** REMAINING: **i32-keyed Map/Set** (clean diagnostic for now — i32 keys
  use `T[]`); `for k in map` direct iteration (parser; use `.keys()` today); `map`/`filter` over
  Map/Set (A10); clean diagnostic polish for unannotated/used `Map()`.
- ⬜ **B6b. Collections building blocks & open items** (all detail in `docs/collections-design.md`).
  - **Prerequisite intrinsics** — `__array_new__`/`__array_new_default__` + bulk `__array_copy__`,
    thin `defaultScope` intrinsics.
  - **Std-over-primitives** — write the collection (and opportunistically `print`) as `.vl` std, not
    compiler-privileged types (ties to H3 / H0 phase 2 `std:` scheme).
  - **Indexing perf** (DECIDED resolutions; sub-choices open) — native-indexing flag (drops B13
    indirect call), backing-pointer hoisting (LICM), bounds-narrowing.
  - **Representation inference** (DECIDED direction; open compiler work) — infer fixed-array vs
    growable rep from usage; interprocedural + alias-unioned; co-design with variance (A9).
  - **Naming & forcing surface — UNCOMMITTED** — `T[]` + inference is the committed surface; names
    `List`/`Array` and any annotation to force a representation are deliberately open.
  - **Language-wide, still open** — value-vs-reference (default reference), error model.
  - **Deferred** — per-frame pooling; user-facing low-level array escape.
  - **Remaining open questions** — capacity/seed construction spelling; `map`/`filter` return type.
- 🟡 **B7. Strings.** REMAINING: switch backing to `(array mut i16)` + `wasm:js-string` builtins
  (bulk JS-host interop — dart2wasm/Kotlin-Wasm style); UTF-8/i8 packing (size); richer methods.
  **Strings direction:** `docs/strings-design.md` — long-term UTF-8 internal storage,
  code-point-indexed API made O(1) for the ASCII common case via an ASCII fast-path flag; strings
  immutable. Ties A7.
- 🟡 **B8. Loops.** REMAINING: `for…in` over objects/maps; `for val, i in arr` and `for , v in obj`
  destructuring forms.
- ⬜ **B12. `async`/`await`.** Keywords lexed; no semantics/codegen. Large; likely last.
- 🟡 **B13. Well-known-symbol dispatch.** REMAINING: callable objects (`"()"`).
- ⬜ **B13a. Multi-index matrix idiom** (low priority). Single-bracket `m[i, j]` → multi-arg
  `"[]"`/`"[]="` + flat-backed `Matrix`/`Grid` type. Nested `m[i][j]` already composes today.
- 🟡 **B14. Methods via explicit `self` + UFCS.** REMAINING: route operator dispatch (B13) through
  self-methods; `c.area` (no `()`) as a bound value; mutation/variance (A9).
- 🟡 **B15. Lambdas + declaration-vs-value.** REMAINING: **untyped** lambdas (a stored closure has
  one signature — needs pinning-by-use or boxing).
- ⬜ **B16. Redeclaration / overloading.** Current: same-scope redeclaration errors; nested shadowing
  allowed (uniquified in codegen). Future: ad-hoc overloading? Default "no" → `DECISIONS.md`.
- 🟡 **B17. Diagnostics + lint.** BUILD OUT — the lint rule backlog (a few at a time):
  - **prefer-`const`** — a `let` that is never reassigned should be `const` (info/warning + quick-fix).
  - **unused function / unused import**; **dead/constant branch** (`if false`); **`step 0`** range
    loop; **unreachable after a diverging `if/else`** (have the simple after-`return` case).
  - **LSP quick-fixes** (code actions): "remove unused binding" / "prefix with `_`" / "`let`→`const`".
    Diagnostics already carry stable `code`s; the LSP has no code-action provider yet.
  - ✅ **`vl check --fix`** — apply the provably-safe lint fixes from the CLI (`let`→`const`,
    unused→`_`-prefix), reusing `codeActions.ts`; idempotent, clean-file no-op.
  - Cross-cutting: thread `severity` through all remaining error variants; consistent message style.
- ⬜ **B18. Tail-call optimization** (low priority). binaryen 130 has `return_call`; detect tail
  position and emit it.
- 🐛 **B-bug. `while` as the tail statement of a void function crashes binaryen's Vacuum pass.**
  A `while` loop in *tail position* of a `void`-returning function body aborts inside binaryen
  optimization. Workaround: don't end a void function on a bare `while`. Fix: investigate the
  Vacuum-pass input for a result-less loop in tail position (likely a malformed/None-typed block tail).
- ⬜ **B-validwasm. Codegen must emit valid wasm WITHOUT relying on binaryen `optimize()`.** Some
  constructs (nullable-ref narrowing after null-checks, divergent loops, maps/sets, recursive types)
  currently produce valid wasm only after `optimize()` runs. The H4 self-hosted emitter path has no
  binaryen, so codegen must produce valid wasm pre-optimize. Surfaced by the `VL_NO_OPT` experiment;
  prerequisite for H4 / H-M2 (emit-bytes-directly). Audit each construct that relies on binaryen to
  legalize its output and fix the IR-builder to emit legal wasm directly.
- ⬜ **B20. Loops as expressions + `break <value>`.** Lift `for`/`while` into expression position;
  a loop evaluates to its `break` value or `null`. Three layers: grammar → types (mirror the
  `returnTypes` mechanism) → codegen (`__brk` block gets a result type).
- ⬜ **B21. `match` construct.** A `match` expression with **exhaustiveness-by-default**: a missing
  arm is a hard error (à la Rust/Swift), not a silent fall-through. The proper language home for
  enforced exhaustiveness on union/literal discrimination — complements the if-chain coverage check
  (A-exhaust) with structured syntax and compiler-enforced completeness. Design: arms match on type
  or literal; each arm is an expression; the `match` evaluates to the arm's type (union of arms).
- 🟡 **B-debug. Source maps + trap diagnostics follow-ups.** REMAINING: (1) **full source-mapped
  stack traces** — map every wasm frame in the trap's stack → VL `function (file:L:C)`, not just
  the top frame; (2) **value-rich panic messages** — a host `panic(msg)` abort path that formats
  the offending values (e.g. `index 7 out of bounds (length 3)`); (3) an index-assignment LHS has
  no parser span yet — broaden parser span coverage for OOB *write* errors. Also feasible: a
  **REPL** (accumulate-session-source + recompile-per-entry) as a future CLI item.

---

## Track C — CLI (`vl` / `vital`)

- 🟡 **C5. Distribution (public release).** REMAINING: tag / brew tap / sha256 bump — decoupled
  from all compiler work. (Shipping the binary: `deno task compile`/`smoke` already pass.)

---

## Track D — LSP / editor experience (`lsp/src/server.ts`)
*Mostly independent; benefits from Track A. AST nodes carry source spans (Track G).*

- 🟡 **D1. Hover types.** REMAINING: flow-narrowed receiver types; Map/Set members (when B6a fully lands).
- 🟡 **D3. Autocomplete.** REMAINING: keyword/snippet completions, trigger-character tuning, wiring
  a completion provider into the Monaco playground (E).
- 🟡 **D4. Formatter.** REMAINING:
  - **Unfaithful-fallback constructs** — reproduced verbatim from the source span rather than
    regenerated: `type` aliases (body & span discarded by the checker), operator-named &
    method-shorthand functions, operator/index-method call desugars, leaf statements that enclose
    an own-line comment.
  - **AST type-syntax fidelity gap** — the typechecker fully resolves every type it records (a tiny
    `i32` annotation becomes a giant structural `Object`; `type`-alias bodies and spans are
    discarded). Retain the *as-written* type syntax (or its span) so the AST is lossless for
    types — also benefits hover/inlay rendering (D1/D6/D8).
  - **Trailing commas** — reflow doesn't yet emit trailing commas in multi-line literals.
- ⬜ **D7. Cross-references in doc-comments** — expand `///` docs with clickable symbol links
  (`{@link Name}` / `` [`Name`] `` conventions), resolving via D2's symbol table; single-file first.
- ⬜ **D8. Preserve type-alias names in display (the "`aliasSymbol`" gap).** Today a reference to
  an alias resolves *through* to its body before rendering (e.g. hover on `type thing = "a" | I32`
  shows `"a" | i32`). Fix: carry the alias name on the resolved type and let the renderer choose
  per context — **preserve** in hovers/inlay, **expand** in type-mismatch errors.
  **Manual step-expansion (owner ask):** expand one depth level at a time, on demand, via VS Code
  hover verbosity levels (`+`/`−` controls). Needs `stringifyType` to grow a `maxDepth` parameter;
  default hover = depth 0 (all names preserved); stepping reveals structure progressively.

---

## Track E — Browser playground + sandbox
*Depends on C1. The compiler is pure TS + binaryen (wasm), so it runs client-side.*

- 🟡 **E2. Playground UI.** REMAINING: Monaco/CodeMirror editor.
- ⬜ **E3. Sandboxed execution** — compiled user wasm in a Web Worker, fresh `Memory`, controlled
  `log` only, enforced limits. (Today user wasm runs on the main thread — fine for local use,
  harden before any public deploy.)

---

## Track F — Infrastructure & hygiene
*Independent; do continuously.*

- ⬜ **F2. Gate debug `console.log`s** in `toWasm.ts` behind a debug flag.
- ⬜ **F4. Re-enable inline `m.validate()`** during dev for earlier failure.
- ⬜ **F5. Settle the name** (VL vs Vital) and apply consistently.
- ⬜ **F6. Document the build** (`deno task build`/`test`; the antlr/gradle gen step is gone).
- ⬜ **F7. Fix the `paramater` misspelling** project-wide (optional; currently consistent).
- 🟡 **F8.** REMAINING (F5-adjacent): confirm vscode-languageclient forking the ESM server in VS Code.
- 🟡 **F9. Perf baseline.** REMAINING: a *runtime* benchmark (run compiled `.vl` programs on large
  inputs); investigate the cubic literal-union compile (A16).
  **Perf wins identified (detail: `docs/perf-findings.md`):**
  - ✅ **F9c. Memoize `structSig`** — shipped (#107); see `CHANGELOG.md`. Post-fix: binaryen
    `optimize()` costs only ~0.8 s on the self-host module — NOT the bottleneck.
  - 🚫 **F9a. `VL_NO_OPT` / skip `optimize()` in tests — ABANDONED / SUPERSEDED.** The original
    premise was that `optimize()` dominates self-host compile time (~4 s/test). After the F9c
    `structSig` memoize fix (#107) the true bottleneck was eliminated: optimize is only ~0.8 s.
    F9a's projected ~20–25 s saving no longer applies. Keeping `VL_NO_OPT` as a "someday" option
    (LOW priority) if a future regression makes optimize a bottleneck again; not a near-term action.
    (detail: `docs/perf-findings.md`)
  - ⬜ **F9b. Cache / clone binaryen IR across selfhost sub-tests** — each of the 5
    `selfhost_pipeline_test.ts` sub-tests recompiles the same base source. Caching the binaryen IR
    for the shared base is more involved (binaryen modules are not trivially cloneable); LOW priority
    now that F9c removed the dominant cost.
    (detail: `docs/perf-findings.md` §Part 3 — Medium-Impact)

---

## Track G — Hand-written parser — ✅ DONE — see `CHANGELOG.md`

---

## Track H — Self-hosting & distribution (the bootstrap end-state)
*The goal: VL compiles itself; the TypeScript/Deno host retires; the compiler becomes VL→wasm on a
generic wasm runtime. **Distribution does NOT require self-hosting** (the two timelines are
independent).*

- 🟡 **H0. Module system.** Phase 1 done — see `CHANGELOG.md`.
  - **Phase 2 (⬜):** the `std:` scheme + embedded `.vl` std over the two-primitive intrinsic floor
    (collections, `std:fmt`, `std:testing`).
  - **Phase 3 (⬜):** cross-file / std LSP.
  - **Deferred:** import maps, namespace/default imports, export-all, re-exports.
- 🟡 **H2. Make VL expressive enough to write a compiler.** All H2 gaps fixed — see `CHANGELOG.md`.
  REMAINING: maps (B6a), enum tag for literal-unions (A16).
- 🟡 **H2a. Re-land a clean `selfhost/lexer.vl`** (near-term, now unblocked). The spike PR #54 was
  closed "fix gaps, re-land clean"; with the H2 gaps fixed, re-land a lexer that drops the
  workarounds: hand-rolled `i32ToStr` → real `toString`, raw `\xXX` lexemes → `fromCodePoint`,
  struct-threaded scanner state → a real ref-typed module global. First concrete slice of H3.
- ⬜ **H3. Port the compiler to VL.** Rewrite `toAST`/`typecheck`/`toWasm` as `.vl`, validated by
  running the corpus through the VL-written compiler. Incremental; TS and VL compilers cross-checked.
  First slice (lexer) spiked + closed (#37, then #54) pending the H2 gap fixes; re-lands clean as
  `selfhost/lexer.vl` (H2a). The multi-file substrate now exists (H0 phase 1).
  Migrating the H3 `.vl` files onto real imports is a separate follow-up.
  **Open self-host codegen limits (re-confirmed at pipeline scale; detail: `docs/selfhost-gaps.md`):**
  - ✅ **H3-gap3. `checkProgram` value-position** — resolved (#89, void/statement-position value drop);
    see `docs/selfhost-gaps.md` §3.
  **Codegen capabilities needed before VL-in-VL can emit wasm (H4 sub-items):**
  - ⬜ **H4.1. No `byte`/`u8` type** — the self-hosted wasm emitter needs a byte type for binary
    output; VL has no unsigned 8-bit integer primitive today. (detail: `docs/selfhost-gaps.md` §H4.1)
  - ✅ **H4.3 / H4.4** — resolved via bitwise/shift ops (#99); see `CHANGELOG.md`.
  - ⬜ **H4.5. In-VL byte→host handoff** — no mechanism to pass a raw byte buffer from VL code to
    the host; linear-memory FFI or a `bytes()` builtin needed. (detail: `docs/selfhost-gaps.md` §H4.5)
  - ⬜ **H4.6. Array spread / concat in call position** — the self-hosted emitter needs to accumulate
    byte sequences with spread or bulk-append; `xs.push(...ys)` / spread-into-call not yet supported.
    (detail: `docs/selfhost-gaps.md` §H4.6)
- ⬜ **H4. WASM emission — DECIDED: emit bytes directly + optional `wasm-opt`** (binaryen's npm
  build is JS-bound). → `DECISIONS.md`. binaryen stays for the TS compiler.
- ⬜ **H-M2. Wasm-native distribution (end-state).** The `vl` binary becomes a wasm runtime
  (wasmtime — full WasmGC since v27) + a small host shim. No V8, no binaryen, no Deno.
- ⬜ **H5. Versioning — deferred; rustup/Volta model, not nvm** (→ `DECISIONS.md`). Make the H-M1
  install path version-stamped so a launcher can slot in later.

**Sequence:** H-M1 (now) → H2 (B6a maps + A16 enum tag) → H2a (clean lexer) → H3 port → H-M2
host swap. Cost is dominated by H2/H3; H4 decided.

# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**, **permissive &
structural**, **fully type-safe** (statically sound — no untyped code; inference holes resolve to
concrete types), compiling to **lean WebAssembly**. Deliverables: an **LSP-backed VS Code extension**
(partial), a **CLI** (the native `vl` — `build`/`check`/`run`, `-O` via wasm-opt; brains in
`build/vl-compiler.wasm` under wasmtime), and an **in-browser playground** (partial).

**Self-hosting status:** the compiler is written in VL (`compiler/*.vl` — lexer/ast/parser/
typecheck/wasmEmit) and **compiles itself to a byte-exact fixpoint** (stage3 == stage4,
`scripts/native-fixpoint.sh`, ~6s, no TS past the seed; gated in CI by `ci-native`). The TS host
(`compiler/*.ts`) remains as the bootstrap seed builder + the spec oracle while the self-host
closes its corpus-coverage tail.

Status: 🟡 partial · ⬜ not started.

**Repo layout:** `compiler/` — the language core (compile, toAST, typecheck, toWasm, defaultScope) ·
`lsp/` — the VS Code extension + LSP server over the core · `grammar/` — the `.g4` spec (reference
only; the parser is hand-written) · `tests/` — `.vl` corpus + runner · `docs/` ·
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

- **Kill the TS host (the new front).** Corpus parity reached (sweep 312/316; → `CHANGELOG.md`
  rounds 5–7), so retire the TS compiler in stages — make it unnecessary, then delete.
  **STANDING POLICY (maintainer): no parity-BACKWARDS work — new language/module/std features are
  NATIVE-ONLY; the TS compiler is feature-frozen and never grows a twin of a native feature.**
  The structural enabler is step 0; until it lands, a corpus case for a native-only feature
  cannot pass the TS-driven tier, which is the forcing function to remove:
  0. ⬜ **Flip the corpus oracle off the TS compiler.** `cases_test`-class corpus adjudication
     runs the WASM compiler under deno (the harness stays; the TS compiler leaves the gate
     path): compile via `build/vl-compiler.wasm` (the #345 loader pattern), run emitted bytes
     under V8 (`runWasm`), same directives. After this, the corpus gates are wasm-under-deno +
     native-under-wasmtime — one brain, two engines, zero TS. **Killing the TWO COMPILERS is the
     top priority** — and it is the first and largest leg on the road to killing Deno: it deletes
     Deno's biggest role (the TS-oracle brain) outright. Deno itself comes off afterward (Track J,
     the follow-through); it is no longer treated as permanent, but it is sequenced behind this
     front, not run in parallel with it.
  1. 🟡 **LSP-on-wasm.** Spike verdict GO (wasm checker 30–60× the TS checker; Stage 1 —
     `vital.checker: ts|wasm|both` — shipped, → `CHANGELOG.md`). The batch parity instrument
     (`scripts/checker-parity-sweep.ts`) holds the divergence inventory (83, mostly span
     anchors). REMAINING: Stage 2 (symbol occurrences + binding types ported into
     parser.vl/typecheck.vl, driver query exports for def/refs/hover) and Stage 3 (members,
     doc comments, a .vl lint pass).
  2. ⬜ Delete the gated deno-side RUN half + its 305-file whitelist outright (see F-tiers);
     the deno-side CHECK verdicts fold into the oracle flip (step 0).
  3. ⬜ `std:` Phase 2 (H0) written in VL — DESIGNED: `docs/std-design.md` (the `std:` scheme,
     hybrid delivery, the two-primitive intrinsic floor + `__trap__`, slices 0–6 with gates; six
     open decisions flagged for the maintainer). Doubles as the demand-driven discovery engine
     for the remaining emitter long tail (each gap fails loudly).
  4. Once the `.vl` compiler is the spec, the parked soundness xfails (arith-hole-operand — A13;
     array-element-recursion — i32-keyed maps) become fixable bugs, not parity constraints.
- ⬜ **`vl test`.** DESIGNED: `docs/test-runner-design.md` (jest-shaped `describe`/`it`/`expect`
  over `std:testing`; two-phase registration, host-driven `vlt*` protocol; `*.test.vl` discovery
  + configurable globs; files parallel by default / in-file serial, opt-in fresh-instance
  `it.concurrent`; per-test capture, failure-first reporting). v1 lands with std-design slice 4;
  chartered follow-ups: compiler-injected call sites, generic `expect<T>` + structural diffs,
  power-`assert` rewriting. New behavioral tests switch to `*.test.vl` at v1 (directive-corpus
  growth stops; conversion waits for the TS-tier teardown).
- ⬜ **Error-handling design** (`docs/error-handling-design.md`, to write) — the language's
  failure story BEFORE std grows fallible APIs (`std:fs`, parsing): Go-style error returns (VL
  unions already express `T | Error`) vs Rust `Result`+`?` vs try/catch over the standardized
  wasm exception-handling proposal (`exnref`); how the choice composes with async/await (B12) and
  streams. Until it lands, std ships only total functions + `__trap__` aborts (std-design D1).
- **Explicit numeric conversion syntax** — the lossless-only implicit-widening rule (#298) makes
  the lossy edges (`i32→f32`, `i64→f64`, all narrowings) EXPRESSIBLE ONLY via a cast that does
  not exist yet; design + land it (both compilers).
- **Param-skip ergonomics** (`docs/lambda-param-skip-design.md`) — prerequisite 1 (self-host
  lambdas/HOFs) is nearly satisfied; decide leading-comma vs `$#` (recommendation deliberately open).
- **C5 / H-M1** — `deno compile` + brew tap. Small, decoupled; ships the distribution story now.
- Smaller/independent: A-robust holes (`Map()`/`Set()` empties, generics), A-exhaust codegen elision,
  B6b collections building blocks, B13 callable objects, B17 lint backlog, A6b Stage A.

---

## Track A — Type system (`typecheck.ts`)
*Blueprint: Elixir v1.20 set-theoretic types, fully-typed (no gradual escape hatch).*

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
- ⬜ **A8. Exact / Inexact variance.** Params Inexact by default (accept excess properties), values
  Exact. Guards the `a.foo = b` width footgun. (TODO.md)
- ⬜ **A9. Readable / Writable variance.** Applied automatically during parameter inference. (TODO.md)
- 🟡 **A10. Parametric types / generics.** REMAINING: same `map`/`filter` generics for `Map`/`Set`
  (B6a); **const generics** (numeric/value type parameters, e.g. `Decimal<10, 8>` /
  `Buffer<N>`) — today generics take *type* params only; enabler for the parameterized
  `Decimal<Backing, Scale>` family (B2) and any fixed-size/parameter-by-value type.
  (Forward/mutual-reference return-type inference: shipped as A17 — see `CHANGELOG.md`.)
- 🟡 **A12. Soundness corpus.** REMAINING: keep growing it; the known-unsound corners are
  `xfail`-marked (e.g. the permissive `i32 + string` hole rule, A13). The SELF-HOST checker's
  soundness floor (15 false-accept classes) is closed; new classes go straight to corpus +
  both checkers.
- 🟡 **A13. Operator-constraint inference.** REMAINING: the hole-operand rule is permissive (doesn't
  reject `i32 + string` yet); the *stored-closure* operator case (`vec + vec` via a `"+"` field)
  still hits the WasmGC width wall (B13).
- 🟡 **A14. Named/opaque types.** REMAINING: real **nominal/opaque types** (decision: clean-error-for-now → `DECISIONS.md`).
- 🟡 **A15. Equality.** REMAINING: a referential-identity operator (`===` / `identical`, O(1) `ref.eq`);
  `boolean`→i32 coercion when storing a comparison result; SELF-HOST struct/function-value equality
  (guarded loudly today — and note the `call_ref`-ABI wrinkle: funcrefs admit no `ref.eq`, so
  function-identity compare needs an identity token on the closure struct).
- 🟡 **A16. Literal-union types.** REMAINING: the **enum representation** (i32 tag for a closed
  literal union — see `docs/unions.md`); a literal union read *inside* a body softens to base
  (coarser member-narrowing there than at the call boundary).
- ⬜ **A17 follow-up: `never` inference + `unconditional-recursion` lint.** A17 demand-driven inference
  is shipped. REMAINING: (a) infer `never` for a genuinely base-case-less divergent recursive cycle
  (currently a stopgap "annotate a return type" error); (b) an `unconditional-recursion` lint that fires
  even when the return type is explicitly annotated (catches accidental infinite loops).
- 🟡 **A-infer-empty. Usage-based inference for empty collections.** Empty ARRAY `[]` inference shipped
  (see `CHANGELOG.md`): `const xs = []; xs.push(1)` infers `xs: i32[]` from downstream usage (push /
  `T[]` param / annotated assignment / `T[]`-returning tail / index-set). REMAINING: the same for
  `Map()`/`Set()` — infer key/value/element from `m.set(k,v)` / `.add(x)` later usage; the `Map()`/`Set()`
  hole isn't yet materialised into a `{[K]:V}` object by `.set`/`.add`.
- ⬜ **A-infer-null. `let x = null` as a nullable hole.** Treat `let x = null` like `[]`: infer the `T`
  in `T | null` from later usage (`x = 5` ⇒ `i32 | null`), the initializer contributing `| null`, with
  flow-narrowing stripping the `| null` on definitely-assigned paths (no null tax on the straight line);
  an unconstrained `let x = null` resolves to `null`. Today `let x = null` pins `x` to the exact `null`
  type, so `let x = null; x = 5` errors. Distinct from a pin violation — `null` is hole-bearing, not a
  complete type. Ties A-infer-empty (same usage-driven hole-filling) and A-definite-assign (shared flow
  machinery). (Rationale: DECISIONS "`let x = null` is a nullable hole".)
- ⬜ **A-infer-params. Top-level function param inference.** Infer named-function param types from
  usage constraints (HM / the existing A13 row-poly inference path), consistent with "hide types where
  possible." Requiring annotations on all named-fn params is NOT VL's stated stance.
- 🟡 **A-exhaust. Exhaustiveness analysis for `is`-chains.** Dead-arm flagging and omit-the-`else`
  return-coverage shipped. REMAINING: **codegen** — elide the provably-true final discriminant test +
  drop the dead arm (a type-driven optimization binaryen cannot do; runtime already correct via the
  no-`else` `unreachable` fall-through; pure size/speed, deferred).
- 🟡 **A-robust. Robustness floor.** An unresolved `Infer`/`Unknown` type must produce a clear
  **"cannot infer — annotate"** diagnostic; it must NEVER surface as a cryptic `Unhandled "Unknown"
  type` codegen error or a `containsInfer` TypeError crash. The main trigger — `const xs = []; xs.push(1)`
  — is fixed (A-infer-empty now infers it, and the "cannot infer — annotate" floor is deferred to
  scope-close so it fires only for a genuinely-unconstrained empty). REMAINING: audit the other holes
  (`Map()`/`Set()` empties, unresolved generic params) for the same clean-diagnostic-not-crash guarantee.

---

## Track B — Codegen, memory model & runtime (`toWasm.ts`)
*Allocation = WasmGC; binaryen stays (it doesn't block self-hosting). → `DECISIONS.md`.*

- 🟡 **B2. Numeric codegen.** Hex/octal/binary literals + digit separators: SHIPPED (see
  `tests/cases/literals/`). Self-host i64/f64/f32 scalars, `f64[]` arrays, and the
  lossless-only implicit-widening matrix: SHIPPED (#290–#298; see `CHANGELOG.md`). REMAINING:
  **explicit value casting/coercion between numeric types** — now load-bearing, since the
  lossless-only rule (#298) leaves the lossy edges (`i32→f32`, `i64→f64`, narrowings,
  float→int) with NO syntax at all; **arbitrary-precision `BigInt` and a `Decimal<Backing,
  Scale>` family** as future `std`-library generic types (not primitives). Prereq: const
  generics (A10).
- 🟡 **B5. Objects.** REMAINING: methods via `self`+UFCS (B14); typed literals in object values
  (`{n: 4<i64>}`); Exact-by-default for values (A8).
- 🟡 **B6. Collections — growable `T[]`.** REMAINING: in-place bulk append (deferred — will be
  `xs.push(...ys)` once variadics land); representation inference (§VL.7 — lower never-grown
  values to a header-less fixed array); `map`/`filter` build-side generics for `Map`/`Set` (A10);
  `.vl`-std migration once a module system exists. (design: `docs/collections-design.md`)
- 🟡 **B6a. `Map` + `Set`.** REMAINING: **i32-keyed Map/Set** (clean diagnostic for now — i32 keys
  use `T[]`); `for k in map` direct iteration (parser; use `.keys()` today); `map`/`filter` over
  Map/Set (A10); clean diagnostic polish for unannotated/used `Map()`. (Self-host native parity:
  string-keyed maps, delete, `Set`/`.add`/`.get`, and ref-valued maps (string/struct values, #319)
  landed; map-typed params are the remaining native map gap.)
- ⬜ **B6a-opt. `Set` drops the unused `vals` array** (LOW priority). A `Set` is emitted as a
  boolean-valued map, so it carries a `vals` array that is always `true` (~17% of a Set's memory +
  needless alloc/grow/`array.copy` on resize). The type already tracks `mSet` (a Set is distinguished
  from a real `{[string]: boolean}` Map, which genuinely needs `vals`), so a Set can leave `vals`
  null and skip the vals-touch in new/add/compact/rehash (~5 `mSet`-gated sites). Memory/perf
  refinement, behaviorally invisible; would intentionally diverge from the host (which keeps `vals`
  for sets) as a justified improvement, not a regression.
- 🟡 **B6b. Collections building blocks & open items** (all detail in `docs/collections-design.md`).
  - ✅ **Prerequisite intrinsics** — `__array_new__`/`__array_new_default__` + bulk `__array_copy__`
    (+ `__trap__`, std-design D1), thin `defaultScope`/typecheck.vl intrinsics lowered inline in both
    emitters, monomorphized per element type (native: i32/boolean/f64 element reps; ref/string
    elements fail loudly — emitter long tail). Corpus `tests/cases/intrinsics/`.
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
  destructuring forms; **expression `step`** on a counter range (`for i = 1 to 5 step i * 2` — a
  multiplicative/variable step, not just a const increment), distinct from the const-step
  build-loop-fusion descriptor (DECISIONS) and the `step 0` lint (B17);
  **float for-range bounds** (`for i = 1 to 1.5` — today bounds must be i32; open up to f64, maint.
  note on #377); **user-defined iterators** (`for x in <anything>` via an iterator protocol, so
  `for…in` is not array/map-only — maint. note on #377).
- ⬜ **B12. `async`/`await`.** Keywords lexed; no semantics/codegen. Large; likely last.
- 🟡 **B13. Well-known-symbol dispatch.** REMAINING: callable objects (`"()"`).
- ⬜ **B13a. Multi-index matrix idiom** (low priority). Single-bracket `m[i, j]` → multi-arg
  `"[]"`/`"[]="` + flat-backed `Matrix`/`Grid` type. Nested `m[i][j]` already composes today.
- 🟡 **B14. Methods via explicit `self` + UFCS.** REMAINING: route operator dispatch (B13) through
  self-methods; `c.area` (no `()`) as a bound value; mutation/variance (A9).
- 🟡 **B15. Lambdas + declaration-vs-value.** SELF-HOST function-value ABI shipped (#306: `call_ref`
  + closure struct, non-capturing + capturing; design `docs/selfhost-lambdas-design.md`); escaping
  closures + function-valued struct fields shipped (#310); `.map`/`.filter` EMIT is the next slice
  (see Next). REMAINING (host): **untyped** lambdas (a stored closure has one signature — needs
  pinning-by-use or boxing).
- ⬜ **B16. Redeclaration / overloading.** Current: same-scope redeclaration errors; nested shadowing
  allowed (uniquified in codegen). Future: ad-hoc overloading? Default "no" → `DECISIONS.md`.
- 🟡 **B17. Diagnostics + lint.** BUILD OUT — the lint rule backlog (a few at a time). Shipped (see
  `CHANGELOG.md`): prefer-`const`, unused-import, dead/constant branch (`constant-condition`), `step 0`
  (`for-step-zero`), unreachable-after-return / -break / -diverging-if/else. REMAINING:
  - **unused function** — a never-referenced (non-exported) top-level function (today only unused
    variables/params/imports are flagged; functions are excluded via the `kind` guard).
  - **discarded call result** — a non-void call whose result is silently dropped at statement
    position (`work()` for an `(): i32`) is likely a bug; warn (with an explicit-discard escape
    hatch TBD, e.g. `_ = work()`). Codegen correctly emits `drop` today
    (`tests/cases/statements/discarded-call-return.vl`); eliding a provably-pure dropped call is
    binaryen `optimize()`'s job, not ours. (Very low priority.) An intentional bare assignment
    STATEMENT (`x = 5`) is fine and never warns — assignment-as-expression yields the RHS by
    design (→ `DECISIONS.md`).
  - **assignment-of-a-literal in condition position** — `if x = true { … }` (especially with
    `x: boolean`) slips past the mandatory-bool condition check because the assignment
    EXPRESSION types as the RHS; an assignment whose RHS is a LITERAL inside a condition is
    almost certainly a mistyped `==`. Warn. (The non-literal form `while (line = next()) != ""`
    is the intended idiom and stays clean.)
  - **per-line / per-file diagnostic suppression** — an `// vl-ignore <code>` (line) /
    `// vl-ignore-file <code>` mechanism so any lint can be locally silenced; prerequisite for
    shipping opinionated lints like the two above. Diagnostics already carry stable `code`s.
    (Low priority.)
  - **LSP quick-fixes** (code actions): "remove unused binding" / "prefix with `_`" / "`let`→`const`".
    Diagnostics already carry stable `code`s; the LSP has no code-action provider yet.
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
- ⬜ H3 merge-by-renaming is a bridge — post-parity revisit notes live in native-modules-design.md
  §Post-parity revisit (symbol-based resolution replaces the rename walker).

---

## Track C — CLI (`vl` / `vital`)

*The NATIVE `vl` exists (`scripts/vl-host`, ~150 lines of frozen Rust over wasmtime): `vl build`
(`-O` via wasm-opt) / `vl check` (parse+typecheck only) / `vl run` (incl. `.wasm` passthrough) /
`vl fmt` (`-w`/`--check`, AST-driven via `format.vl` — the sole formatter; the TS `format.ts` is
retired), brains in `build/vl-compiler.wasm`. Iteration: `scripts/refresh-compiler.sh` refreshes the
seed from current `compiler/*.vl` in ~3s.*

- 🟡 **C5. Distribution (public release).** REMAINING: tag / brew tap / sha256 bump — decoupled
  from all compiler work. (Shipping the deno binary: `deno task compile`/`smoke` already pass;
  the native `vl` ships under H-M2's model.)
- ⬜ **C-cli polish.** `vl build` to stdout when no `-o` (decided: yes, pipe-friendly); WAT output
  (`--wat`, via wasm-tools or wasm-opt); surfacing diagnostics with spans once the spans rungs land.

---

## Track D — LSP / editor experience (`lsp/src/server.ts`)
*Mostly independent; benefits from Track A. AST nodes carry source spans (Track G).*

- 🟡 **D1. Hover types.** REMAINING: flow-narrowed receiver types; Map/Set members (when B6a fully lands).
- 🟡 **D3. Autocomplete.** REMAINING: wiring a completion provider into the Monaco playground (E).
- 🟡 **D4. Formatter.** REMAINING:
  - **Unfaithful-fallback constructs** — reproduced verbatim from the source span rather than
    regenerated: `type` aliases (body & span discarded by the checker), operator-named &
    method-shorthand functions, operator/index-method call desugars. (Trailing comments on `type`
    aliases now stay on their line — #146; functions with a commented expression body now fall back
    to verbatim correctly — #154; the trailing-comment placement fixes — #165/#172/+.)
  - **AST type-syntax fidelity gap** — the typechecker fully resolves every type it records (a tiny
    `i32` annotation becomes a giant structural `Object`; `type`-alias bodies and spans are
    discarded). Retain the *as-written* type syntax (or its span) so the AST is lossless for
    types — also benefits hover/inlay rendering (D1/D6/D8).
- 🟡 **D — Project-wide unused-export hints.** Core shipped: debounced workspace pass on save (+ 3 s idle), use-map over ≤500 `.vl` files, `hint`/`unnecessary` diagnostics for zero-reference exports. REMAINING: **struct field–level unused-export analysis** — deferred because VL's structural typing makes field-level usage tracking fuzzy (a field could be "used" via a widened receiver type without any import); a future refinement could cross-check field names against known call sites once structural subtyping is tightened.
- ⬜ **D8. Hover verbosity step-expansion.** Alias-name preservation is done (see `CHANGELOG.md`).
  REMAINING: the interactive shallow↔deep verbosity stepper — expand one alias layer at a time
  on demand via the proposed LSP 3.18 hover-verbosity API (`HoverParams.context.verbosityLevel`
  + `Hover.canIncrease`/`canDecrease`). The renderer (`stringifyType` `maxDepth`) is ready;
  blocked on the protocol landing in `vscode-languageserver` (currently 3.17.5). When it lands:
  deps/min-version bump + map `params.context.verbosityLevel` → `maxDepth`, set
  `canIncrease`/`canDecrease` on the returned `Hover` — no renderer change needed (see comment
  in `lsp/src/server.ts` ~L394).

---

## Track E — Browser playground + sandbox
*Depends on C1. The compiler is pure TS + binaryen (wasm), so it runs client-side.*

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
- 🟡 **F9. Perf baseline.** Runtime benchmark shipped (`scripts/perf-runtime.ts` / `perf-compare.ts`);
  the past wins/abandons live in `docs/perf-findings.md` + `CHANGELOG.md`. REMAINING:
  - ⬜ **F9b. Cache / clone binaryen IR across selfhost sub-tests** — LOW priority (the dominant
    cost fell with the F9c memoize; binaryen modules are not trivially cloneable).
  - 🟡 **F-tiers. Collapse the redundant corpus runner.** (This is Track J's J1 — it removes
    Deno-as-an-engine.) REMAINING: delete the
    `SELFHOST_DENO_RUN`-gated tiers (the corpus RUN half + its 305-file whitelist, the check→emit
    verdicts, the V8-side golden fixpoint + emit-program suite) outright once the native tier is
    the undisputed runner; fold the deno-side CHECK verdicts the same way when the native checker
    gates message/span parity. Also: the single-unit assembly compile is SUPERLINEAR in the TS
    host (~5s as a 2-module graph vs ~100s concatenated — wasmEmit.vl is the multiplier); worth a
    profile if any gated assembly is still exercised regularly. (Landed → `CHANGELOG.md`: gating,
    parallel sweep, seed cache + ~3s refresh, graph-compile caching, the NATIVE golden
    byte-tripwire `scripts/native-golden-check.ts` — no big assembly remains always-on.)

---

## Track H — Self-hosting & distribution (the bootstrap end-state)
*The goal: VL compiles itself; the TypeScript/Deno host retires; the compiler becomes VL→wasm on a
generic wasm runtime. **Distribution does NOT require self-hosting** (the two timelines are
independent).*

- 🟡 **H0. Module system.** Phase 1 done — see `CHANGELOG.md`.
  - **Phase 2 (⬜):** the `std:` scheme + embedded `.vl` std over the two-primitive intrinsic floor
    (collections, `std:fmt`, `std:testing`).
  - **Phase 3 (🟡):** cross-file / std LSP. Module-aware DIAGNOSTICS landed (`lsp/src/moduleGraph.ts`):
    the open file is analyzed as the entry module — its imports resolve through a workspace
    `ModuleReader` (open buffers + disk), so imported names no longer flag "undeclared" and genuine
    import errors (bad path / not-exported / cycle) surface on the import line. Hover/completion seed
    the same imported-name types (real types, no squiggle). Cross-file NAVIGATION now landed:
    go-to-definition and doc-comment xrefs on an imported name jump to the EXPORTING sibling's
    declaration (resolved by reading the sibling through the workspace reader and locating the
    exported binding's decl span via the symbol table); find-references gathers occurrences across
    the current file + other OPEN documents + UNOPENED on-disk siblings (a name's canonical
    `(exportingKey, exportedName)` is matched per document; the importer's symbol table is
    graph-seeded so imported-name uses are recorded). On-disk crawl is scoped: project root detected
    from the LSP workspace-folder root, or by walking up to the nearest ancestor containing
    `deno.json`, `package.json`, or `.git` (at most 6 levels); `.git`, `node_modules`, `dist`,
    `.claude`, `reference` dirs are skipped; at most 500 `.vl` files read per request
    (`MAX_DISK_FILES`); open-buffer text wins over disk for any file open in the editor.
    REMAINING: the `std:` scheme (phase 2).
  - **Deferred:** import maps, namespace/default imports, export-all, re-exports.
- 🟡 **H2. Make VL expressive enough to write a compiler.** REMAINING: maps (B6a), enum tag for
  literal-unions (A16).
- 🟡 **H3. The self-host compiler (`compiler/*.vl`).** Corpus parity REACHED (sweep 312/316, the
  residue is the parked soundness xfails — see "Kill the TS host" in Next; history →
  `CHANGELOG.md`). The port compiles ITSELF to a byte-exact native fixpoint (stage3 == stage4,
  `scripts/native-fixpoint.sh`, ~6s, gated in CI by `ci-native`). REMAINING:
  - **Real import/export for the `.vl` BUILD** — retire the concat + symbol-rename glue (the
    assembly renames the lexer's colliding `Tok`/`Diag`/`advance`). Import HEADERS landed (every
    compiler file checks as a module — LSP/`vl check` clean); switching the BUILD waits on the
    post-parity module revisit (symbol-based resolution — don't bet the compiler on the rename
    walker; → `docs/native-modules-design.md` §Post-parity revisit).
  - **Spans** — continue the rungs (rung 1 = token positions; rung 2 = native `path:line:col:`
    diagnostics, #312; rung 3 = end positions for LSP ranges, `diagEndCol`) so more diagnostics
    carry real positions; message/span parity gates the deno-CHECK-tier deletion (F-tiers).
  - **The untested emitter long tail** — each fails loudly (nullable lists beyond `i32[]|null`,
    map-typed params / nullable map fields, struct-union `==`, `?.` beyond i32/boolean leaves,
    …); burned down demand-driven as real VL code (std, the compiler) hits them.
  - ⬜ **H4.1. No `byte`/`u8` type (ergonomic/representation gap, not a blocker).** Bytes are
    represented as `i32` masked `& 0xff` in `wasmEmit.vl` and round-trip/instantiate fine; a real
    packed byte buffer (B7/B6 `(array i8)`) would drop the 4×-wide detour. (detail: `docs/selfhost-gaps.md` §H4.1)
  - ⬜ **H4.6. Array spread / concat in call position (worked around).** A small `appendAll()` loop
    helper covers bulk-append today; `xs.push(...ys)` lands with variadics (B6). (detail: `docs/selfhost-gaps.md` §H4.6)
- ⬜ **H-M2. Wasm-native distribution (end-state).** The `vl` binary becomes a wasm runtime
  (wasmtime — full WasmGC since v27) + a small host shim. No V8, no binaryen, no Deno.
  **Engine choice re-validated (2026 survey):** wasmtime remains the only standards-track
  non-browser engine with complete, production WasmGC (27.0+, DRC + null collectors; the
  collector is a per-invocation tuning knob). Wasmer gets GC mainly via its V8 backend (a JS
  engine again); WAMR/wazero are embedded/Go niches without GC. **System-API strategy:** WASI
  preview 1 is the whole OS surface `vl` needs (fd_read/fd_write/path_open/args_get/proc_exit),
  implemented natively by wasmtime — we write no OS code. The split: formatting + all compiler
  logic in VL; ONE emitter prerequisite — a linear memory + a GC-string→linear-memory copy
  (the `__store_string__` analog), since WASI's ptr/len ABI can't take GC refs (this also
  subsumes H4.5: emitted bytes leave via fd_write, killing the decimal-string handoff).
  Target WASI p1 (p2/component-model + GC interop still settling). Distribution: zero-code via
  `wasmtime run --dir . vl.cwasm` (AOT-compiled) behind a launcher script; a single static
  `vl` binary is an OPTIONAL thin Rust embedding of the wasmtime crate (engine setup +
  preopens only — no OS logic), deferrable until the flip.
  **Status (2026-06): the INTERIM Rust host shipped** (`scripts/vl-host` — `vl build/check/run`,
  brains in `build/vl-compiler.wasm`; the native stage3 == stage4 fixpoint holds via
  `scripts/native-fixpoint.sh`, ~6 s, no TS past the seed). **Killing the Rust host entirely is
  confirmed feasible** (no negatives beyond the VL-side work): (1) the emitter gains WASI p1
  imports + a linear memory + the GC-string↔memory copies above (UTF-8 encode/decode written in
  VL); (2) the driver becomes a WASI `_start` reading `args_get`/`fd_read`, writing bytes +
  diagnostics via `fd_write`; (3) `print` lowers to `fd_write` so EMITTED user programs also run
  under any stock engine. Then the only dependency is a prebuilt conforming engine binary (any
  GC+WASI engine — wasmtime today), same trust/distribution model as deno now, and
  `scripts/vl-host` is deleted. Low priority while the interim host is ~150 frozen lines.
- ⬜ **H5. Versioning — deferred; rustup/Volta model, not nvm** (→ `DECISIONS.md`). Make the H-M1
  install path version-stamped so a launcher can slot in later.

**Sequence:** kill-the-TS-host staging (LSP-on-wasm stages → tier deletion → `std:` Phase 2) →
real import/export for the `.vl` build (post module-revisit) → C5/H-M1 distribution (anytime,
decoupled) → H-M2 host swap (kill the interim Rust host once the WASI driver lands).

---

## Track J — Kill Deno (the destination behind the TS-host kill)
*The north star: remove Deno entirely — no `deno test`, no `deno run`, no `deno compile`, no
`deno.json`/`deno.lock`, no `setup-deno` in CI. End-state runtimes: wasmtime+WASI for the `vl`
brain (Track H, H-M2), Node for the JS-side tooling that outlives the TS compiler (LSP bundling,
the playground). Detailed inventory + staged plan: `docs/deno-deprecation.md`.*

**This track is NOT a competing now-priority.** The active front is **killing the two compilers**
(see Next) — that is the top goal, and it is the road this leads down: it removes Deno's largest
role for free. Track J is the follow-through *behind* that front. Deno is NOT one dependency — it
fills six roles on different timelines, and most of the surface dies as a side effect of work
already in flight (the TS-host kill, `vl test`, H-M2); J is the genuinely Deno-specific residue
plus the final teardown, sequenced after the compilers are gone (the J4 bundling swap is the one
piece that can land early, fully decoupled).

- **J0 — the TS-oracle brain (biggest role; rides the TS-host kill).** `compiler/cli.ts` + the
  `compiler/*.ts` graph run under Deno; corpus adjudication + emit run in Deno's V8. This vanishes
  when the TWO COMPILERS die (see Next) — no Deno-specific work, just don't block it. `deno check`
  / `deno lint` (the TS type+lint gate, CI) go with it; the `.vl` side is already covered by the
  native checker + `lint.vl`.
- 🟡 **J1 — the V8 wasm executor.** Tests run emitted wasm via `runWasm` in Deno's V8; the native
  tier already runs the same bytes under wasmtime (`scripts/vl-host`, `ci-native`). REMAINING:
  finish folding the corpus RUN + CHECK verdicts onto the native/wasmtime tier (this is F-tiers +
  Next step 2) so no gate depends on Deno-as-an-engine. Then the only thing left for Deno is
  *orchestration*, not execution.
- ⬜ **J2 — the test harness (the hard core).** All 52 `tests/*.ts` are `Deno.test`. Split by what
  they test:
  - **Behavioral `.vl` corpus** (`cases_test`/`cases_wasm_test`, `selfhost_*`) → migrate to the
    native runner + `*.test.vl` under **`vl test`** (already designed/charted — see Next +
    `docs/test-runner-design.md`). This is the bulk of the harness and the main forcing function.
  - **TS-infra tests** (LSP, playground, lint-TS, format, symbols, stringify, source-map) → these
    test TS that outlives the compiler; they move to a **Node** test runner (`node --test`) when
    their subsystem is ported, OR ride along under Deno until then. Decide the Node-runner cutover
    once `vl test` has absorbed the behavioral corpus.
- ⬜ **J3 — build/dev scripts.** `deno run scripts/*.ts` (gen-std, build-binary, smoke-binary,
  perf*, checker-parity-sweep, native-golden-check). Two buckets: **load-bearing** (gen-std embeds
  the std; native-golden-check is a CI tripwire) → port to `.vl`/native or to Node; **dev-only**
  (perf, parity sweeps) → can lag, move to Node last or retire. Audit each for a `Deno.*` global.
- ⬜ **J4 — bundling (independent; can land anytime).** The LSP (`cd lsp && deno task build`) and
  the playground (`playground/build.ts`) are esbuild-under-Deno; their deps are already
  node-resolvable (binaryen, vscode-languageserver*, monaco). Swap to esbuild-on-Node (`npm`
  scripts) — decoupled from all compiler work, the cleanest early win.
- ⬜ **J5 — distribution.** `deno compile` builds the `vl` binary today (C5 / `release.yml` /
  DECISIONS "Distribute via `deno compile`"). Superseded by H-M2 (wasmtime+WASI; `scripts/vl-host`
  already exists). The `deno compile` binary is now explicitly the **interim** distribution, not
  the destination — retire it when H-M2's WASI driver lands. (DECISIONS entry annotated.)
- ⬜ **J6 — final teardown.** Once J0–J5 land: delete `deno.json` + `deno.lock`, drop
  `denoland/setup-deno` from `ci.yml`/`pages.yml` (replace the deno cache steps with node/wasmtime),
  rewrite the AGENTS.md command list off `deno task *`, and remove the dual-runtime `no unguarded
  Deno globals` rule (compiler core becomes Node+wasmtime only).

**Sequence:** J4 (anytime, independent) ‖ J0 rides the TS-host kill ‖ J1 finishes with F-tiers →
J2 behavioral corpus onto `vl test` → J3 load-bearing scripts → J2 TS-infra onto `node --test` →
J5 folds into H-M2 → J6 teardown. **Dependencies:** J2-behavioral needs `vl test` (Next); J5
needs H-M2 (Track H); the rest is unblocked. **Open decisions (maintainer):** Node `node --test`
vs another runner for the surviving JS-side tests (J2/J3); whether load-bearing scripts port to
`.vl` (dogfood) or to Node (faster).

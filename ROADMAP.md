# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**, **permissive and
structural**, **fully type-safe**, compiling to **lean WebAssembly**. Deliverables: a VS Code extension,
the native `vl` CLI, and an in-browser playground. Layout and pipeline: `docs/ARCHITECTURE.md`.

The compiler is self-hosted (`compiler/*.vl`) and compiles itself to a byte-exact fixpoint
(`scripts/native-fixpoint.sh`). The seed is the published `seed-latest` release, anchored by `seed-v0`.
The native `vl` (`scripts/vl-host`, Rust over wasmtime) is the only CLI; its brains are
`build/vl-compiler.wasm`.

Status: 🟡 partial · ⬜ not started.

> **Maintaining this file.** The roadmap is *forward-looking*: what to do next, why, what it depends
> on, what is left.
> - Shipped work goes to `CHANGELOG.md`.
> - Why we chose something non-obvious goes to `DECISIONS.md`.
> - How a finished thing works goes to the code, git history, or a `docs/` explainer.
> - Migration status lives in `docs/internals/architecture-refactor-plan.md`, not here.
> - Questions for the owner live in `docs/internals/open-rulings.md`; this file lists their ids only.
>
> A finished item is deleted here in the same PR that adds its CHANGELOG line. A partial item keeps
> only its forward part. No measurement narrative, no dates on tables, no effort or time units.
>
> **Keeping this file honest.** This file has been rewritten from scratch several times, each time
> after the same rot: done markers left in place, one list of rulings kept in three copies, a dated
> ranking table, status copied from the plan doc, and an effort column. Three rules stop it:
> - **A scheduled audit re-validates every entry** against a witness or the tree. Each entry is
>   graded done / partly done / stale / still open / ruled / obsolete, and the verdicts are applied
>   in one PR.
> - **Every docs batch graduates the items its landings finished.** When a PR closes an entry, the
>   docs batch that records the PR deletes the entry and adds its CHANGELOG line.
> - **The ordered list below is derived from the architecture target's §3 order, not hand-dated.**
>   A new item goes in a track; it reaches the ordered list only by reach, and the list carries no
>   date.

---

## Next, in order

1. **The architecture migration**, in [`architecture-target-2026-10.md`](docs/internals/architecture-target-2026-10.md)
   §3 order. Plan and status: [`architecture-refactor-plan.md`](docs/internals/architecture-refactor-plan.md).
   - Steps 1–3 (the elaboration worklist, the checker owns the instance set, `Fn#d` singletons).
   - Step 4: finite function sets and their coercion record (D3975 ruling).
   - Step 5: contextual type and coercion records, one field group per PR (5b, 5c, 5d).
   - Step 6: narrowing produced once.
   - Step 7: `repOf(ty)` and one row per canonical type. This absorbs the rep-descriptor campaign
     ([`rep-descriptor-campaign.md`](docs/internals/rep-descriptor-campaign.md)), the `vtKindOfType`
     annotation ladder, the return-kind family and the slot layer.
   - Then: move the elaboration into check with an error channel (deletes `pinHoleLambdaArg`).
2. **Clause-1 defects still open:** `f(...cs)` with a covariant `Circle[]` into `...Shape[]` is
   check-clean invalid wasm (needs D791's element-converting copy or a check refusal); `(() =>
   {[i32]: V})[]` is check-clean invalid wasm and needs a row.
3. **Initialization order** (owner ruling 2026-09-26): a compile error whenever init-before-read is not
   statically guaranteed, plus compile-time reordering of initializers. D2655 (an uninitialized module
   `let` is a loud emit reject after `vl check` accepts it) is open.
4. **Generated-code performance** (see the emoji-sheep-tag item in Track B): print imports only when
   reachable; B-range (D4000); the optimizer as a VL phase (L10 ruling); B-hint.
5. **Reference identity and equality (A15):** the 2026-09-01 ruling is unbuilt, and a later diagnostic
   tells users "VL has no `===`". The owner reconfirms the ruling first.
6. **Width subtyping, the container half:** `Wide[]` into `Narrow[]` still refuses "not yet supported
   by codegen" (ruled a gap, 2026-09-01).
7. **Struct keys for `Map`/`Set` (A15.2):** refused today ("A P-keyed Map isn't supported yet").
8. **Memory safety:** `Buf` is a forgeable structural record (`std/buffer.vl`); buffer-design.md §L2b
   has the one-word `new` newtype fix. Decide fix or accept (std-api-reviewer).
9. **Undeclared-identifier "did you mean":** reuse `tyEditDist` over the in-scope names.
10. **`docs/guide/soundness.md`:** replace the stale "silently accepted and emits invalid wasm" example
    with the current ruled refusal, and add the clause-1 / clause-2 paragraph.

### Architecture refactor

🟡 **Bring the compiler and its tools in line with `docs/ARCHITECTURE.md`.**
- Plan, order, acceptance rules and status: [`architecture-refactor-plan.md`](docs/internals/architecture-refactor-plan.md).
  Target and migration order: [`architecture-target-2026-10.md`](docs/internals/architecture-target-2026-10.md) §3.
- A step lands when it loses no `runs` and is a sound move toward the target (owner, 2026-10-26).
  Lines, seed bytes and fuel are reported, not landing bars. Increments and slices land in slices,
  one PR each with its own proof.
- Merged most recently: #4824 (container adoption, slice 1: list elements), #4825 (increment 3,
  slice 1: mono reads a hole instance's types from the elaboration) and #4826 (increment 3, slice 2:
  a hole instance's lambdas and value calls read its elaboration; D3616 closed).
- In progress:
  - container adoption, slice 2: map values (`Map()` plus key writes);
  - step 6: narrowing produced once.
- Next in increment 3: delete the binding fallback, the D6210 rung and `holeFnSplit*`.
- Next:
  - **Container adoption, the rest:** delete the emitter's name scan (`structIndexOfObjCtxGo`,
    `anonMintLiteral` reuse), `letMapDestShape` (D203), `rlElemKindTbl` (5b) and 5a's residue hints.
  - **Move the elaboration into check, with an error channel** (target §2.1); deletes `pinHoleLambdaArg`.
  - **Importer-demand tracking for the check-skip** (vl-cross-module-adoption ruling): an importer's
    wider delivery pins a library's literal-only binding, so the check-skip declines every edit to
    that library until importer demand is tracked.

### Awaiting owner rulings

Each id is a section of [`open-rulings.md`](docs/internals/open-rulings.md) or the named design doc.
Nothing here is scheduled until it is ruled.

- **Language surface:** B8-for-struct · B8-for-float-range · scope-exit-cleanup · bare-block-as-expression ·
  A16-tag-scheme-kind-vs-band (the mixed literal-union box) · property-access · eh-user-defined-cast-functions (O6(b)) ·
  user-defined iteration protocol (B8) · callable records (B13) · multi-index `m[i, j]` (B13a) ·
  `p.method` as a bound value (B14) · discarded non-void call result and its escape hatch (B17) ·
  open-world negation tracking (A4; the clause-1 half is DESIGN, D1775) · `readonly` record fields (A9) ·
  `const x = loop(1)` and a diverging `while true` as non-returning (A17) · an inferred `never` (A17) ·
  generic newtypes (A14) · const generics (A10) · a `"+"`-named struct field (A13) · `u8` value type (H4.1) ·
  object/array/parameter destructuring (A-destructure; list destructuring is bounded by the no-tuples ruling).
- **Json:** does `j as T` propagate `JsonError { kind: "shape", path }` (S4; DECISIONS.md)? ·
  serde OQ-2 (union-arm wire-index order), OQ-3 (NaN in VLB), OQ-4 (canonical sorted-map mode),
  briefs in `docs/serde-design.md`.
- **std and host ABI:** reopen buffer-design O5 (a `memory.grow` epoch global) · buffer-design O8
  (delete `__store_string__`/`__log_string__`) · remove `utf8Length` (equals `.length`) ·
  `dogfood:` fs-directory-mutation · text-pattern-matching · process-run-timeout · concurrent children ·
  script-stderr · script-self-location · child env/cwd · child resource use · a digest in std ·
  a wall clock in std.
- **Tooling and distribution:** C5 publish (release tag, brew tap) · F5 the name (VL vs Vital) ·
  compile-cache default (C-incremental Q2) and the `--watch` surface (Q3) · a Node runner for the
  surviving JS-side tests (J2) · `--strip-locations` for release builds (recommended 2026-09-01, never ruled).

### Parked (ruled low priority, or build on ask)

- `vl test --trace` inline run values; `vl compile` to a standalone executable (both owner, 2026-09-01).
- A-LISTAS: list `as` conversion (`b as K[]`), until someone asks.
- SIMD f64x2 and relaxed SIMD, when a consumer asks (vl-simd-threads ruling).
- A build-configuration surface (`std:build`), only if users need build-dependent code (owner,
  2026-09-24); `__memory_shared__` stays std-internal (D2355).
- A15.5: a lazy i64 serial for identity hashing, only if a program measures the flat scan as a problem.
- Deferred import forms: import maps, namespace/default imports, export-all.
- Non-asks that stand: exceptions/async, separate compilation and wasm linking, WASI, in-language GC knobs.

### Consumers

Each consumer keeps its own list; re-run an ask before scheduling it.
- **webcraft:** its asks are tracked in `~/webcraft/docs/design/vl-requirements.md`.
- **plumb:** queued (owner, 2026-09-24) — std wrappers over the shared-memory and atomics intrinsics
  and raw integer SIMD intrinsics, each through std-api-reviewer. `~/plumb/docs/`.
- **veldt / sunsuz:** SIMD S4, integer and byte shapes (`I32x4`, `U8x16`, ...) in `std:simd`; `flat`
  sub-byte fields and newtypes over byte widths (flat-records-design.md §11.3), on ask only.
- **sunpa:** `std:test` boolean matchers take no message; `vl test` has no per-test time (opt-in
  `--durations`). Both are std API changes (std-api-reviewer, owner first), and may fall outside
  sunpa's 2026-10-07 scope directive.
- **diderven:** B-range (D4000, DV-1000), in Track B.
- **emoji-sheep-tag:** Track B, "Consumer feedback".

---

## Track A — Type system

- 🟡 **A5. Flow narrowing.** An index after `?.` (`o?.y[0]`) is a check error; a `?.` call over a map
  read is declined (D1827); `case`/multi-guard has no grammar. Join narrowing slices are ruled in the
  flow-narrowing ruling and tracked there.
- ⬜ **A4/A5b. Pruning by negation.** `foo("ok")` infers `i32 | string` while `foo(true)` infers
  `string`: the else branch does not prune by negation (string minus string = never). A4's only
  consumer is A5b.
- 🟡 **A5c. Literal-preserving inference for strings:** a function whose every return is a string
  literal infers `string`, not the literal. `let` keeps `string` by ruling (DECISIONS 2026-09-23).
- 🟡 **A6. `is`:** a `ref.test` fast path for ref-vs-ref (unmeasured).
- 🟡 **A6b. Proof-carrying narrowing.** Stage A: a guard on a call's result narrows its argument
  (`if bar(x) is null`), via the effects summary (function-effects-design.md §G6). Stage B: a stored
  witness (`const f = bar(x); if f is null` narrows `x`), held until `callMayWrite` says a call may
  write `x` or `f`.
- ⬜ **A6c. Narrowing across calls.** (1) Keep a narrowing when the writer can only write a member it
  admits (needs A6b's per-path W). (2) D2408: a bare-name re-test inside an arm whose condition's call
  ended the narrowing. (3) The owner's deferred ideal: keep a narrowing across an escaping closure when
  no write of the path can run first. Open: ban side effects in operator overloads, or let one modify
  only its operands.
- ⬜ **A8. Exact/Inexact** (ruled 2026-08-18): params Inexact, values Exact, no annotation surface in v1.
  No witness shows unbuilt work; find one or demote to ruled-only.
- ⬜ **A9. Readable/Writable variance beyond lists:** `readonly` record/map/field/export, and inferred
  read-only parameters. Readonly record covariance is planned as an additive extension
  (record-covariance ruling, 2026-09-29). Backlogged behind demand. The A9 container-copy diagnostic
  still says "not yet supported by codegen" for a refusal the ruling made DESIGN: reword it.
- 🟡 **A10. Generics:** `map`/`filter` on `Map`/`Set`; const generics (`type Buf<N: i32>` is a parse
  error), which gate Decimal (B2) and the fixed-array direction.
- 🟡 **A12. Soundness corpus.** Keep growing it; naming contract in `tests/cases/soundness/README.vl`.
  Harness gap: no exact-output directive, so a program that exits 0 and prints the wrong output cannot
  be pinned by `@run` + `@log` (#1864, #1867).
- 🟡 **A13. Operator-constraint inference:** the stored-closure operator case (`vec + vec` via a `+`
  field) and the E7 `any` rendering in these diagnostics. Re-probe before scheduling.
- 🟡 **A15. Equality.** Owner reconfirms the 2026-09-01 ruling against the DV-1214 diagnostic, then:
  1. `===`/`!==` as `ref.eq` on reference reps; `==` on a function becomes a check error. Acceptance is
     a value table (same object true, equal objects false, across union arms false, `null === null`
     true, inside and outside an `is` guard).
  2. Struct keys for `Map`/`Set`: key-eligible means `==`-comparable; hash and `==` share one lowering
     (D1017 first); `-0.0` folds into `0.0`.
  4. `IdentityMap`/`IdentitySet` in std (std-api-reviewer), after item 1.

  Unverifiable this audit: the self-host struct/function-value equality remainder. Confirm and delete.
- 🟡 **A16. Literal unions:** the mixed box (`K | string`, `K | K2 | null` niche) lacks a tag scheme for
  atoms (A16-tag-scheme-kind-vs-band; `ref.i31` is ruled out). Optional: O(1) ordering for a string
  literal union's `<`, only if a profile asks.
- 🟡 **A-robust.** An unresolved `Infer`/`Unknown` gives "cannot infer — annotate", never a codegen
  error or a crash. Unaudited: an unconstrained `Map()`/`Set()` with no uses
  (`tests/cases/maps/error-uninferred.vl` pins one).
- ⬜ **`[null]`, the later target** (spec Q3, open-rulings D1832): infer the element from the first
  non-null use.
- ⬜ **Variadics:** a rest parameter is deliberately not part of a function type, and an `extern` cannot
  take one.
- ⬜ **Deep `is` over Json:** D1198 (a recursive JSON shape target has no walker) and D1190 (a deep `is`
  arm that rebinds or writes the tested place refuses). The `as` trio over Json (S4) needs the ruling
  above, `"shape"` in `JsonError.kind` (std-api-reviewer), a JSON-pointer path in the walker, and a
  position matrix before the checker narrows.
- 🟡 **Destringify types, the standing check** (`destringify-types-program.md`, "How to verify") shows
  three live rendered-type comparisons: `call_bind_shadow.vl:76`, `check_match_desugar.vl:216`,
  `check_narrow_flow.vl:1343`. Classify each as nominal/diagnostic or fix; the migration's L6 work may
  delete them.
- ⬜ **A clamp-to-range `std:math` helper** is the ruled substitute for saturating casts (2026-09-07);
  confirm it exists or file it.
- ⬜ **B21.3 `match` over literal members:** check which numeric-literal spelling (`n is 0`) still
  refuses; the const-pattern ruling answers part of it.

## Track B — Codegen, memory model and runtime

- ⬜ **Consumer feedback: emoji-sheep-tag (2026-10-26).** A perf round porting a pathfinding search to
  VL (`voces/emoji-sheep-tag` PR 3) reported three rough edges.
  - **Verified: a module that never calls `print` imports the host print functions.**
    `shared/pathing/vl/search.vl` has no print call. Built with master's `vl`, it imports seven
    `imports.__print_*__` functions without `-O`, and two with `-O` (`__print_char__`,
    `__print_str_flush__`). A trivial module imports none, so some lowering pulls them in, probably a
    runtime-error or trap-message path. Forward: emit a host print import only when it is reachable.
  - **First use builds the toolchain, and `-O` needs a separate binaryen install.** The consumer
    reported about 5 minutes for the first build. This bears on the L10 ruling (the optimizer becomes
    a VL compiler phase) and on distribution (C5, H-M2).
  - **Unverified: in the consumer's line-of-sight port, `-O3` produced slower code than no
    optimization.** Obtain the program and reproduce it before scheduling. If it holds, either fix the
    rung choice or document `-O`/`-O3` as per-program (P1.3 below).
  - Context, not a demand: the VL search ran about 19.0 ms against about 21.5 ms for the hand-optimised
    flat-array TypeScript (about 12% faster), and end to end the two were within noise, because the
    boundary and the non-search work dominate. Read it as a data point on generated-code performance.
- ⬜ **B-range** (D4000, DV-1000). Induction ranges for `for … until`, propagated through inlined
  helpers, folding the compares and list bounds tests the range decides. Keep the trap messages that
  cannot fold. Grade against a node/JS control.
- ⬜ **B-hint.** Emit `metadata.code.branch_hint` for trap arms and `??` fallbacks; wasmtime must opt in.
- 🟡 **P1.3 Optimization defaults.** Add the `-O` column to `bench/results/summary.md` and name
  `sort-heap` as the `-O3`-worse exception in cli-design.md; the per-program rung is not selectable
  (see the emoji-sheep-tag item); the optimizer moves into VL under L10, so the rung is chosen by
  whole-compile cost.
- 🟡 **B-alloc. Allocate less:** Heap2Local on the default path (an `opt_*` pass under L10); rep
  inference to drop the list wrapper; more union-arm niches; B6a-opt (`Set` drops its always-true
  `vals` array).
- 🟡 **String building:** a module-global accumulator appended from inside a function stays quadratic
  (200,000 two-char appends take 3.8 s); the function-local and top-level-loop cases are linear. Ropes
  were refused.
- 🟡 **String interpolation:** a string-only hole still pulls `std:fmt` and `std:str` until whole-program
  dead-code elimination (unverified this audit; related to the print-import item above).
- 🟡 **B2. Numerics:** arbitrary-precision BigInt and `Decimal<Backing, Scale>` as future std generics
  (needs const generics, A10).
- ⬜ **B6-ro.** Widen the eight pure readers of `std:array` to `readonly T[]`, one fixture per export
  (std-api-reviewer).
- 🟡 **B6. Collections:** representation inference (a never-grown list becomes a header-less fixed
  array, §VL.7), under `repOf(ty)`.
- 🟡 **B6a. `Map` and `Set`:** a recursive nested-collection map value `{[string]: Tree[]}` hits an emit
  error; D2673 (a `Set<K>` union member); clean diagnostics for an un-annotated `Map()`.
- 🟡 **B6b.** Representation inference (with A9), std over primitives, and the naming and forcing
  surface (owner). `docs/guide/collections-design.md` owns the design.
- 🟡 **B6c. Unchecked map read:** the lowering exists. Remaining: measure whether any population needs
  the hatch, and the map and closure niche cells of `as!` (loud emit reject).
- ⬜ **B6d.** Lint a `.has(k)` or `!= null` guard whose body re-reads `m[k]` (two probes where one would
  do); suggest bind-once or `as!`. A repo lint over the syntax tree (syntax-tree API ruling).
- 🟡 **B7. Strings:** `__print_string__` per element (non-ASCII print is slower); source intake is still
  UTF-32; the bimodal map probe cost (hash clustering); a display-width model beyond code points.
- 🟡 **B12. Concurrency** (concurrency-design.md, not `async`/`await`): stack switching, `map(f, limit)`,
  effect inference. A std `map` needs a generic sized-array constructor; re-grade D1472.
- 🟡 **B15. Function values:** a nested un-annotated capturing function delivered as a value
  (`[k][0](1)`, `use(k)`) still refuses at emit. Find or file the rows; the migration's step 3–4
  function-value types are where it closes.
- 🟡 **B17. Diagnostics and lint:** a float zero-divisor warning; a discarded-call-result warning (owner
  ruling first); assignment of a literal in a condition; per-line `// vl-ignore <code>` and
  `vl-ignore-file`; LSP quick-fixes; severity threading. Each is a lint over the syntax tree.
- 🟡 **B-mem.** Narrow 8- and 16-bit stores are absent; the allocator tier is `std:buffer`. The two dead
  intrinsics wait on buffer-design O8.
- 🟡 **B-sym.** Identifier-interning phases 4 (the checker scope chain) and 5 (`modRenamed`) remain
  (perf-program.md §9.7). Phase 4 touches the scope chain that `identDeclIx` will replace, so check it
  against the migration first.
- 🟡 **B-ci.** `build.rs`'s `VL_SEED_KEY` recompiles the embed job on each push; verify `ci-native` uses
  `check --batch`. Target: `ci.yml` wall at most 3 minutes.
- ⬜ **B-validwasm.** Confirm that non-optimized output validates for narrowing, divergent loops, maps
  and recursive types (run the corpus without `-O`). Unverifiable this audit; likely done.
- 🟡 **B21.** The two buried-position prelude rejects (`match` inside a call argument, a top-level
  binding) were not re-probed.
- 🟡 **B-debug.** Value-rich panic messages (`index 7 out of bounds (length 3)`); the index-assignment
  left-hand side's span.
- ⬜ **B-emitmsg.** Emit failures still use compiler-internal jargon; rewrite each as a source-located,
  plain-language message. Under the target most become check-time facts or disappear.
- ⬜ **B-repdebug.** `vl check --why-reject`, `vl build --dump-reps`, and a corpus label for which tier
  failed. Likely superseded once `repOf(ty)` is one function whose result can be printed.

## Track C — CLI

- 🟡 **C5. Distribution.** `release.yml` and `Formula/vl.rb` are drafts. Remaining: the publish job, a
  release tag, the brew tap and the sha256 bump. Waits on the owner; first-use toolchain build time
  (emoji-sheep-tag) belongs here.
- 🟡 **C-test-cache.** Built opt-in. Remaining: the owner's call (Q2) on flipping the default
  (`VL_NO_COMPILE_CACHE` / `--no-cache`, `vl cache clean`) once the trial ends (on or after
  2026-10-28), and the `VERIFY=sample:N` mode.
- 🟡 **C-incremental** (incremental-compilation-design.md). S0–S2 built, S5 in progress, S3 `--watch`
  and S6 not started, S4 ongoing. Q1 and Q4 are ruled; Q2 and Q3 wait on the owner.
- ⬜ **C-extern-read.** `vl run` refuses every declared extern global, including one only an imported
  module declares and nothing reads. Goal (owner, 2026-09-26): refuse only a global that reachable code
  reads or writes.
- 🟡 **C-ci-compile.** The cross-program checked-form cache (perf-opportunities-2026-09.md §B1) would
  remove the per-file std re-check that dominates `vl_check_codegen_test.ts`. Re-measure first.
- 🟡 **`vl test` follow-ups:** f64 failure rendering, per-test timings and timeouts, `--no-capture`,
  dot and json reporters, structural diffs, power-assert rewriting.

## Track D — LSP and editor

- ⬜ Completion and hover for the members a bound grants on `x: T` (`<T: Showable>`).
- 🟡 UFCS completion offers a workspace `f(self: T, ...)` only from a module already in the graph.
- 🟡 **Lossless recovery, stage 2:** convert the remaining lossy skip sites one at a time, each making
  the recovery faithful and deleting its pin from `tests/vl_lossless_recovery_test.ts` (DECISIONS.md,
  "A recovered parse IS typechecked").
- 🟡 **D1.** Hover for `Map`/`Set` members, unverified.
- 🟡 **D4. Formatter:** `type` alias bodies are printed verbatim from the source span; method-shorthand
  and index/operator call desugars are not probed.
- ⬜ **AST type-syntax fidelity:** keep the as-written type syntax (or its span) so the AST is lossless
  for types. Unverifiable this audit.
- ⬜ **Unused-export hints** at struct-field level (structural typing makes it fuzzy); owner-gated.
- ⬜ **D8.** The hover verbosity stepper waits on vscode-languageserver shipping the 3.18
  hover-verbosity API; the renderer's `maxDepth` is ready.
- Not queued until a consumer asks: workspace symbols, DAP, notebooks, monikers, call hierarchy.

## Track E — Browser playground

- ⬜ **E3. Sandboxed execution.** Run user wasm in a Web Worker with a fresh `Memory`, log-only imports
  and time or step limits, so a long-running or trapping program cannot freeze the editor. Required
  before any public deploy. `playground/src/{runtime,playground,main}.ts`.

## Track F — Infrastructure

- 🟡 **Dogfooding** (standing order, vl-dogfooding-lane). About 56 shell scripts still do work a VL
  program can (`gate.sh`, `fuzz-vl.sh`, `refresh-compiler.sh`, ...); `fuzz-vl.sh` rewrites `fuzzgen.vl`'s
  `RICHVALUES` by `sed` and should pass it as an argument. The host-ABI gaps are the `dogfood:` rulings
  above.
- 🟡 **F9.** No wall-time baseline for `vl build`/`vl run` is tracked (seed size, generated-code cost
  and scaling shape are).
- 🟡 **F-tiers.** The corpus oracle is not redundant (#2950); moving emitted-wasm execution from V8 to
  the native runner is J1.
- ⬜ **Compiler cleanup:** about 110 hand-written bulk-append loops in `compiler/` and `std/` are each
  `dst.push(...src)`. Migrating them changes compiler bytes, so it needs its own identity proof.
  Re-derive the count with a script before briefing.

## Track H — Self-hosting and distribution

- ⬜ **H3 merge-by-renaming** is a bridge; native-modules-design.md §"Post-parity revisit". Likely
  superseded by the resolve phase (`identDeclIx`). Unverifiable this audit.
- ⬜ **H-M2. Wasm-native distribution.** Retire the Rust host by emitting WASI p1, linear memory and
  GC-string copies, and running under a stock wasmtime. The host has grown (compile cache, test pool,
  GC knobs) rather than shrunk; secondary to the refactor (owner, 2026-10-13).

## Track J — Retire Deno

Secondary to the architecture refactor; shrink TS over time.
- 🟡 **J1.** Twelve test files execute emitted wasm under V8 via `support/runWasm.ts`; move them to the
  native runner.
- ⬜ **J2.** 251 `tests/*.ts` files remain, and the behavioural corpus is still driven from Deno.
- 🟡 **J3.** Six `scripts/*.ts` remain (gen-std, shared-instance-probe, probe-rollback-census,
  perf/lsp-keystroke, perf/oracle-abi-probe, std-math/run-v8): port to VL or delete.
- 🟡 **J4.** The LSP bundle is `npx esbuild` plus `bundle-seed.ts`; the playground bundler
  (`playground/build.ts`) is still esbuild under Deno.
- ⬜ **J6.** Delete `deno.json`, `deno.lock` and the setup-deno steps once J1–J4 land.

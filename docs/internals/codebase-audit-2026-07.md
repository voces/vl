# VL codebase audit — 2026-07

A full-repo audit: software-engineering and compiler-design first principles, tools, testing —
with a specific focus on the rep-fuzz workstream and the question *"is there a more cohesive,
generalized, recursive approach, or is the remaining work grunt work?"* Part I is the review;
Part II answers the strategic question; Part III is the technical plan; Part IV lists language
features that would make the compiler itself cleaner.

Method: five parallel deep-read audits (front end + checker · emitter/rep · fuzz infra · testing/
CI/tooling · language design/docs/process), plus direct verification of the rep layer, and an
**empirical probe**: the fuzzer was run at three fresh (non-CI) seeds against the committed
baseline. All counts and timings below were measured, not estimated.

---

# Part I — Comprehensive review

## Scorecard

| Area | Rating | One-liner |
|---|---|---|
| Lexer / parser / AST | **Strong** | Conventional, well-recovered, well-positioned; one defect — types leave the parser as strings |
| Type representation | Adequate | Real structured `Ty` arena; no interning; error/hole sentinel conflation |
| Inference | Adequate/Weak | ~10 coherent local mechanisms (seeding, deferred constraints, in-place pinning), not a unification core |
| Checker soundness | **Weak** | Bivariant holes, `-1` universal-accept, textual literal identity, checker/emitter grammar divergence |
| Emitter rep architecture | **Weak** | 8 parallel rep vocabularies; flat non-recursive `RepDesc`; nominal slot keying; the active pain center |
| Emitter code quality | Adequate | Exemplary comments + pass-DAG; two 12–13k-line grab-bag files; byte-emission interleaved with lowering |
| Fuzz generator | B (mission) / D (surface) | Genuinely recursive over *path* shapes; zero branching-tree shapes; no mutation/control-flow/value dimensions |
| Fuzz oracle | B− | Self-describing round-trip; one observation per program; grep-based classification |
| Fuzz baseline/ratchet | **A− mechanism / C coverage** | Exact bidirectional, class-tagged — best-in-class; but coverage ≡ 16 pinned seeds, proven twice |
| Test suite | A− | 938-case directive corpus, strict-by-default runner, 1.7 s; weak positional oracle; no isolated unit tests of checker/emitter |
| CI | A− | Everything that matters gated in ~3m15s; Linux-only; **publish-seed not gated on the corpus** |
| Tooling (host/CLI/fmt/lint/LSP) | A− | 862-line Rust host is a model thin adapter; CLI-in-VL is a ~60-global state machine |
| Internal docs / process | A− / **C hygiene** | Design docs are exceptional; CHANGELOG/DECISIONS/ROADMAP violate their own rules; AGENTS.md teaches the deleted TS pipeline |
| User docs / spec | **D** | No language tour or reference; no spec — the corpus + seed *are* the spec, circularly |
| Risk posture | C | Bus factor 1; seed lineage break-glass-free; trusting-trust unaddressed |

## The one disease, stated once

Nearly every defect class in this repo — the fuzz-fix waves, the checker soundness holes, the
emitter fragility — traces to a single architectural fact:

> **The compiler represents each type in many places, in many vocabularies, most of them
> strings, with no mechanism forcing the copies to agree.**

Measured extent:

- **Types are strings at both compiler boundaries.** The parser builds no type AST — every
  annotation becomes a synthetic name string on `TypeRef.tyName` (`parser.vl:361-536`, e.g.
  `"(A|B)[]"`, `"(i32)=>i32"`). `nameToTy` (`typecheck.vl:3676-3958`) is a second, hand-written
  288-line recursive-descent type parser over those strings. At the other end,
  `canonEmitTypeNames` (`typecheck.vl:4517-4669`) re-renders every type into a third vocabulary
  ("the emitter's" spelling), which the emitter re-parses with ~30 `nameIs*` predicates and
  paren/brace-depth machines. Three grammars for one type language; ~800–1,000 lines exist solely
  to re-derive structure the checker already had in the arena.
- **Eight parallel rep vocabularies in the emitter** (the roadmap's "3+ numbering schemes"
  undercounts): `VKind` (27 members, `emit_state.vl:291-317`, grew 22→27 in one recent fix), the
  raw legacy codes 0–21, struct field codes with **three independent producers**
  (`fieldTypeCode` / `nameFieldCode` / `anonFieldCode` — documented as having drifted,
  `rep-fuzz-findings.md:678-688`), the 19-char `$fnsig` token alphabet, the ~13–16 `fRet*` flag
  tables, `MfKind`, `BtKind`, `PushKind`. 94 distinct `nameIs*`-style string classifiers and 77
  `*Kind*` functions across the compiler; `structIndexByName` has 50 references across 7 files,
  `rlSlotByName` 42 across 5.
- **The fuzz-findings log is a catalog of exactly this failure mode.** Recurring root causes,
  quoted from `docs/internals/rep-fuzz-findings.md`: "the same field-code vocabulary had three
  producers … drifting independently"; three ref-array classifiers each hard-coding `"i32[][]"`
  ("a fourth parallel enumeration of the same fact"); "another drifted parallel enumeration";
  "Prime repOf evidence: three sites, one kind vocabulary". The doc's own three-way-agreed
  diagnosis: **"rep resolution + interning don't recurse through composition boundaries …
  don't patch these piecemeal."**

Everything below is detail on top of this.

## 1. Front end and type checker

`lexer.vl` (733) / `parser.vl` (1,966) / `ast.vl` (850) are solid: run-based string building,
precedence climbing, sync-token error recovery with bounded closer-skips, one-diagnostic
policies, construct-anchored lexer diagnostics. The commentary discipline across the whole
compiler is the best feature of the codebase — nearly every function documents motivation and
its pinning test.

`typecheck.vl` (11,396 lines, 302 functions) has a real structured type arena (`T.tys`, 11
`is`-discriminated variants, index-linked because VL aliases cannot self-reference). Inference is
not HM and not classically bidirectional; it is an accretion of local mechanisms that work:
demand-driven return inference with a fixpoint pre-pass, expected-type seeding (`seedExpected` —
the one genuinely unified bidirectional mechanism), named holes (`TyVar("?f.N")`) with **no
unification** — soundness recovered by per-call-site deferred-constraint validation — and
in-place arena mutation as the empty-collection story (order-dependent by design).

Checker-side soundness risks (independent of the emitter):

1. **`assignable` returns true when either type index is negative** (`typecheck.vl:4767`) while
   `-1` also means "hole" and "unresolved annotation"; two documented near-misses
   (`:3693-3699`, `:3810-3816`).
2. **Holes are bivariant** (`:4787-4788`); rejection depends on a finite enumeration of deferred
   recorders — a hole used outside that list (condition position, field write, nullable return)
   is validated by nothing at instantiation.
3. **`splitUnionAtoms`/`unionMemberCount` (`:9702-9800`) are not quote-aware** while every
   checker-side scanner is (`skipQuotedName`, `:3414`) and nullable-litunion canon names keep
   members quoted — a litunion member containing `|`/`{`/`(` splits differently in the checker
   and the emitter classifier. (Also the known paren-depth gap behind the `(C | D)[]` family.)
4. **String-literal type identity is textual with escapes unresolved** — `"a"` and `"a"`
   are distinct literal types denoting the same runtime value (`:203-208`, `:1913-1926`); ints
   got `canonIntLexeme` precisely because `0x10 ∉ 16 | 32` broke, strings did not.
5. **Eight exact-spelling `*RetName` renderers** (`:8123-8394`) export inferred types to the
   emitter as strings that must byte-match what the emitter's name predicates expect —
   documented invalid-wasm incidents whenever two renderings disagreed.

Quality/perf notes: mega-functions (`checkFuncDeclNode` 760 lines, `checkCallNode` 711 —
inlining the entire builtin surface), a duplicated ~30-name import block, six depth-aware string
splitters with divergent rules, no type interning, unmemoized structural `assignable`,
O(all-constraints) validation per generic call, per-codepoint string concat in
`splitUnionAtoms`. Three previously fixed quadratics of the same shapes are memorialized in
comments — the class recurs.

## 2. Emitter and the rep layer

The pass manager (`emit_sections.vl:2134-2176`, a declared dependency DAG with runtime ordering
verification) and `emit_rep.vl` itself are genuinely well-built. The problems are structural:

- **`RepDesc` is flat, not recursive** (`emit_rep.vl:97-104`): `{rdKind: VKind, rdNul, rdSlot,
  rdSigTok, rdListElem: string}` — classification deliberately recurses "at most one wrapper
  deep" (`:41-46`), and `rdListElem` is a ninth string mini-vocabulary. A composition — a map
  whose value is a struct whose field is a nullable f32 list — has **no denotation**; it is
  `rdCovered == 0` until someone mints a new `VKind` and threads it through the ladders. Witness:
  four separate kinds (`nuli64list`/`nulf64list`/`nulf32list`/`nulstrlist`) for the single
  concept `Nullable(List(leaf))`. The kind alphabet grows multiplicatively with depth; the type
  grammar is infinite. This is the mathematical reason the burn-down cannot terminate by
  enumeration.
- **Cost per rep family, measured**: the nullable-scalar-list addition took 4 new VKinds + ~13
  wiring sites across 5 files (valtype ladders, name classifier, binding/init classifiers,
  local-slot chain, global cell, null seeds, narrowed reads, collect forcing). The project's own
  `codegen-architecture.md` calls a full type kind "the recurring ~50-site migration."
- **Slot resolution is still nominal**: `rdSlot` has zero consumers; inline shapes, variants,
  ref-lists, and map values remain name-keyed (`emit_rep.vl:33-38`). The struct heap layer is the
  one place structural interning landed (`repCanonKey` → `sTwin`, layout-guarded by
  `structFieldCodesEq`) — and it fixed an active soundness bug, which is the existence proof for
  the rest.
- **The `$fnsig` value-call ABI is a hand-parsed string format** — single-char tokens; consumers
  re-scan the key string for the last `'>'` and hand-parse decimal slot digits
  (`emit_classify.vl:12299-12351`). Kinds with no token silently fall out of the ABI — the direct
  cause of the closure-returned-map hole.
- **Hot-path perf red flag**: `repSlotOfTy` (`emit_rep.vl:290-314`) linearly scans all `sNames`
  recomputing an unmemoized `repCanonKey` (full recursive string build) per declared struct, per
  query, behind `vtKindOfType`. `repTyScalarMask`'s generation-stamped memo (`:637-704`) is the
  template it should copy.
- `wasmEmit.vl` (11,794) interleaves lowering with raw byte writing (~600+ bare opcode pushes at
  the last count in `codegen-architecture.md`); the designed builder layering has not landed.
  `emit_classify.vl` (12,994) is a grab-bag of classification + ABI codecs + scratch kinds.

## 3. Fuzzing — generator, oracle, ratchet, and what the frontier actually looks like

**Generator** (`scripts/fuzzgen.vl`): seeded-random, grammar-directed, written in VL, genuinely
recursive over 7 containers × 7 leaves × 4 positions × read/construct variants, with smart
adversarial details (decoy-cannot-admit-carrier invariant, ~1/3 real nulls, inert parens on
guards — which immediately caught a real miscompile class). **But every generated type is a
single-spine path**: `Slot` has exactly one recursive `child` (`fuzzgen.vl:45-67`); union
alternates and struct siblings come from fixed 6-entry leaf pools (`pickAlt` :204-241,
`pickDecoyField` :245-276). Never generated: a union of two composites, a struct with two
recursive composite fields, multi-element arrays, composite or multiple closure params, arity>2
unions — and nothing outside the rep mission: no mutation, no loops, no `match`, no generics, no
methods, no negative/zero/boundary numerics (first digit is 1–9!), no string edge contents.

**Oracle**: self-describing `// @log <payload>` round-trip — sound but narrow. One observation
per program (decoy siblings, non-carrier arms, map backings unobserved); construct-only variants
observe only "didn't crash"; classification is a grep over wasmtime stderr prose
(`fuzz-vl.sh:76-83`) — a wasmtime rewording silently re-buckets classes. One latent generator
bug: the map arm passes `allowNul=1` (`fuzzgen.vl:324`) against its own header comment — the day
nullable map values graduate, stored-null-vs-miss ambiguity will produce false MISMATCHes.

**Ratchet** (`rep-fuzz-check.sh`): exact, bidirectional, class-tagged — new/worse lines fail,
stale lines fail, graduations must be pinned as corpus regressions. Best-in-class. Two holes:

1. **"Soundness is never baselineable" is documentation, not mechanism.** Since #876,
   `fuzz-vl.sh --baseline` accepts any class as a committed known issue and `rep-fuzz-check.sh`
   enforces nothing class-wise. The baseline is 283 lines, 100 % REJECT *today* — one `git add`
   of an INVALID-WASM line would reinstate a suppressed miscompile with no mechanical objection.
2. **Coverage ≡ the 16 pinned seeds — proven three times now.** Historically: 3-seed zero →
   16 seeds instantly surfaced 71 unsound holes ("the seed set IS the test surface"). And
   empirically, during this audit: **three fresh seeds (55501/90210/314159; 900 programs, depth 5)
   produced 84 non-baselined findings including 4 INVALID-WASM and 2 TRAP.** Repros captured:
   - TRAP: `{a: i32, f: (boolean | string | null)[], z: f64} | f64` — niche-nullable-union list
     element read through a union-boxed struct (p0r and p0c both trap).
   - INVALID-WASM: `{[string]: {[string]: {a: f64, f: boolean, z: string}} | {w: i32}}` as a
     param; `{[string]: f64[]} | string | null = null`.

   So the roadmap's "every unsound class is now 0" is true only at the pinned net; the true
   frontier runs at roughly **1 unsound shape per ~200 fresh programs** — before any
   branching-tree shapes, which have never been sampled at all.

**Process**: ~50 root-caused fix PRs in 4 days, one family per PR, every graduation frozen as a
corpus regression, fuzz-neutrality checks, an R1–R8 taxonomy with losing sites. Exceptional
discipline. Per-fix effort is trending up (one-line classifier arms → new reps/ABI tokens),
consistent with a long tail, not convergence.

## 4. Testing, CI, bootstrap, tooling, DX

- **Corpus**: 938 files / 39 areas; 3,007 `@log` (full ordered-array equality — a strong oracle),
  717 `@run`, 182 `@error(+at)`, 14 `@emit-error`, 0 `@skip`. Strict-by-default runner with
  directive-hygiene enforcement and a stale-divergence tripwire. Weaknesses: `@error-at` matches
  line only; `@trap` positions unassertable (no native source map); one shared wasm instance
  across ~920 cases with manual state hygiene (including a compile-`print(1)`-to-flush
  workaround, `cases_wasm_test.ts:318-337`); **parser (6 files) and lexer (7) are thin** for a
  hand-written front end; and **nothing can test `typecheck.vl` or the emitter in isolation** —
  the only sub-pipeline harness is the sed/heredoc assembly hack in `run-lint-diff.sh`, lint-only.
- **CI**: ~3m15s total, gating fixpoint ladder (64 s), pinned rep-fuzz (68 s), 573 native tests,
  corpus, self-lint, embed-seed smoke. High engineering quality (rustc-keyed caches,
  `ci_seed_coverage_test.ts` closing the "seed-backed test runs nowhere" rot hole). Gaps:
  Linux-only; no fuzz cron (randomized sweeps are maintainer-manual); the detached self-lint
  collection polls unboundedly if the subshell dies (`ci.yml:302-307`); release path is a manual
  draft.
- **The scariest single gap: `publish-seed.yml` republishes `seed-latest` on master push gated
  only by fixpoint + a `print(6*7)` sanity — not the corpus, and independent of CI outcome.**
  With no second compiler and no re-mint path, a fixpointing-but-miscompiling published seed is
  the repo's worst-case event, and this is its open door. The corpus oracle costs 2 s.
- **Inner loop**: cold cargo build 2m25s; **`refresh-compiler.sh` measures ~37 s** locally (64 s
  with the CI ladder) vs the "~3s" still claimed in its header — every compiler edit pays this,
  print-debugging pays it *per probe*, and a stale seed silently tests the old compiler. No
  incremental path (design doc only). The per-code-point host string ABI (one wasm call per char;
  staging the 65k-line compiler source is millions of boundary calls) is a prime profiling
  suspect.
- **Tooling**: the Rust host (862 lines) is a model thin adapter — null-GC for the compiler
  instance, graceful ABI fallbacks, atomic `.cwasm` publish with a documented UB analysis.
  CLI-in-VL's command-queue-pump design is clean; its implementation is a ~60-global state
  machine (a language-limitation artifact — see Part IV). fmt/lint are honest about their
  limits and well-tested (idempotency + re-parse gates). LSP: clean environment-agnostic core
  over the seed's flat i32 ABI, 0.1–1.3 ms/keystroke measured.
- **DX**: no debugger, no trace hooks, no source maps; debugging a miscompile in the checker is
  print-debugging at 37 s/probe. Onboarding docs actively mislead: `AGENTS.md:8-16` still teaches
  the deleted TS pipeline two paragraphs before declaring it gone; test headers cite deleted
  files.

## 5. Language design, docs, process

- Surface today is broad and real (structural objects, unions/litunions/intersections/negations,
  narrowing incl. De Morgan, monomorphizing generics, `match` phase 1, modules + nascent `std:`,
  UFCS, closures with contextual adoption). Absent: casts, error handling, string interpolation,
  destructuring, classes, async.
- **Two deferred decisions are now on the critical path**: (a) explicit numeric conversions —
  the lossless-only rule shipped with **no cast syntax**, so `i32→f32` and all narrowings are
  currently inexpressible; (b) error handling — `docs/error-handling-design.md` is chartered in
  two places and **does not exist** while `std/` ships and `std:fs` is named next.
- **No spec.** `grammar/` is deleted (ROADMAP still cites it); "native is the spec" + "the corpus
  goldens are the spec" is circular for a self-hosted language: the fixpoint proves *stability*,
  not *correctness*, and the corpus cannot answer "what should this program do" for anything it
  doesn't sample — precisely the gap the widened fuzz net keeps proving.
- **Process hygiene has drifted**: CHANGELOG "one-liners" — 205 of 345 lines exceed 500 chars
  (274 KB); DECISIONS entries of 15–25 lines with function names against its own 2–4-line rule;
  `match` is shipped-but-⬜ in the roadmap with no CHANGELOG graduation. The docs *system* is
  excellent; its rules are not being followed at agent velocity.
- **Risk**: bus factor 1 at ~12 PRs/day; seed lineage deliberately break-glass-free (GitHub
  release is the sole source; sha256 fail-closed; auditable via `seed-fingerprint.txt`), which is
  a defensible design but concentrates existential risk with the publish-gate hole above;
  trusting-trust unaddressed (no diverse double-compilation, even as a one-off audit).

---

# Part II — The strategic question

**You asked: are we missing a more cohesive, generalized, recursive approach, or is it grunt
work? The answer is: the cohesive approach exists, is already named in your own docs, is
partially built, and the evidence that it wins is overwhelming — but the day-to-day work pattern
hasn't switched to it yet.** The last ~50 PRs are predominantly seam point-fixes (a missing arm
here, a mirrored dispatch there), while the strangler (`repOfTy`/`RepDesc`) advances as a side
activity. That allocation should invert.

Three independent lines of evidence:

1. **Combinatorics.** The failure space is compositional: leaves × wrappers × depth × positions.
   A flat kind alphabet (`VKind`, field codes, `$fnsig` chars) must grow multiplicatively to
   cover it — 27 kinds and counting, four of them spellings of `Nullable(List(_))`. Enumeration
   cannot reach 100 % of an infinite grammar; only a lowering that is *closed under composition*
   can. Meanwhile the fuzzer currently samples a few thousand of ~10⁵ path shapes and zero
   branching shapes, and fresh seeds still find unsound output at ~1/200 programs. "Empty
   baseline at the pinned seeds" is a moving milestone, not a terminal state.
2. **Your own bug history.** Nearly every fixed finding root-causes to "one enumeration arm that
   drifted from its twins," and each *structural* layer that landed retired a whole family at
   once (struct heap dedup → the twin invalid-wasm class; one `mvValKindOfName` → three drifted
   map enumerations; one token table → encoder/decoder drift). The findings doc itself concluded:
   don't patch piecemeal.
3. **The safety net you built is exactly the harness the rewrite needs.** The corpus
   byte-compare, the fixpoint ladder, and the exact bidirectional fuzz baseline make
   behavior-preserving migration *checkable* — which is the hard part of any strangler. The
   grunt-work waves were not wasted: they produced 42+ frozen regressions, the R1–R8 taxonomy,
   and the differential net. The point is to stop spending that net on one-arm fixes and start
   spending it on layer migrations.

**What "cohesive, generalized, recursive" concretely means here** (and what the current
`RepDesc` is not yet):

- A **recursive rep tree**, not a flat kind: `Rep ::= Scalar(i32|i64|f32|f64) | Str | Atom |
  Struct(fields: Rep[]) | List(elem: Rep) | Map(val: Rep) | Box(variants) | Closure(sig) |
  Nullable(inner, discipline)` — computed **totally** over the post-mono `Ty` arena by one
  function, with checker metadata (alias-ness, variant-ness) as explicit inputs.
- **Interning keyed by the layout hash of the rep tree** — NOT the checker-structural
  `repCanonKey` alone. The repo already learned this lesson the hard way (litunion-alias field
  vs inline `"a"|"b"` field: same checker structure, different layout): the two-layer split
  (layout identity + structural dedup guarded by `structFieldCodesEq`) is the correct design and
  it generalizes. Heap-type slots (struct, ref-list, map value, variant) become caches over this
  interner; `structIndexByName`/`rlSlotByName` become lookups of last resort, then dead.
- **Totality forces the policy decisions into one place.** Every current `repUncovered()` is
  either (a) a composition whose rep follows mechanically from the tree (most of R1/R4/R5/R6), or
  (b) a genuine ABI decision (niche-nullable element boxing, value-union-through-closure-result).
  Expect ~30 explicit decisions. That's the honest size of the remaining "grunt work" — made
  once each, in a table, instead of rediscovered shape-by-shape at seams.
- **The string seams die**: `$fnsig` keys become interned rep ids (retiring the char alphabet and
  its digit-parsing consumers); the checker→emitter contract becomes arena indices only
  (`nodeTyIx` + sidecars), retiring the `*RetName` renderers, `canonEmitTypeNames`, the `nameIs*`
  predicates, and `splitUnionAtoms`; the parser grows a type AST, retiring `nameToTy`.

**Blockers, and why none is fatal**: layout-vs-structure keying (solved in principle by the
existing two-layer split); missing ABI policy (surfaced, not created, by totality); the string
`$fnsig` seam (mechanical but wide); post-mono arena growth (the pass manager already re-runs
passes post-mono, and `repTyScalarMask` shows the generation-stamped memo pattern). The fixpoint
gate is blind to the rep layer (i32-only compiler), so the corpus + fuzzer remain the real gate —
which is why the fuzzer should be generalized *first* (Part III, Phase 1), so the net measures
the rewrite it is gating.

**Bottom line**: do the grunt work, but change its unit. Stop buying single shapes; buy layers.
Each wave should land one structural migration (a rep-tree constructor family, a consumer moved
off a string vocabulary, a slot table re-keyed) and let the fuzzer + corpus certify that a whole
family graduated. On the evidence of the layers already landed, this converges; arm-by-arm
demonstrably does not.

Also: **redefine the "100 % representation" milestone.** As stated ("100 % representation on
existing syntax before expanding functionality") it is currently operationalized as "empty
baseline at 16 pinned seeds" — which fresh seeds falsify today. The reachable, meaningful
definition is: *`repOfTy` is total over the type grammar of existing syntax — every type either
lowers compositionally or hits an explicit, tested, single-site policy reject — certified by a
tree-shaped fuzzer at rotating seeds with zero unsound findings.* That is achievable and, once
achieved, stays achieved, because it holds by construction.

---

# Part III — Technical plan

Ordered; each phase gated by the existing net (fixpoint + corpus + exact baseline). Estimates
assume current velocity.

## Phase 0 — Close the safety-net holes (days; do immediately, independent of everything)

1. **Gate `publish-seed.yml` on the corpus oracle** (2 s) — and ideally on `ci-native` overall —
   before releasing `seed-latest`. This is the single highest-risk/lowest-cost fix in the repo.
2. **Make "soundness is never baselineable" mechanical**: `rep-fuzz-check.sh` fails on any
   non-`REJECT` baseline line.
3. **Nightly randomized-seed fuzz cron** (the `$RANDOM` default already exists): unsound findings
   fail loudly / file issues; fresh rejects are report-only. Coverage stops being a function of
   16 frozen seeds and maintainer habit.
4. Small fixes: `genSlot` map-arm `allowNul` drift (`fuzzgen.vl:324`, one line, prevents future
   false MISMATCHes); bound the CI self-lint poll (`ci.yml:302-307`); triage the three unsound
   shapes this audit found at seeds 55501/90210/314159 into the baseline/fix queue.
5. Doc honesty pass: fix `AGENTS.md`'s deleted-pipeline section, the "~3s" refresh claims,
   ROADMAP's `grammar/` reference, and mark `match` shipped.

## Phase 1 — Generalize the fuzzer before the rewrite it must certify (1–2 weeks)

1. **Tree shapes**: `Slot.child` → `Slot.children[]`; union arms and struct fields recurse into
   `genSlot` (budgeted — cap total nodes, not just depth); multi-element array/map constructors;
   composite and multiple closure params; arity-3 unions. Expect an immediate finding burst —
   budget for it (report-only at first via the cron, pinned net unchanged).
2. **Value dimension**: 0, negatives, `i32::MIN/MAX`, full i64 range, non-half floats; empty/
   escaped/multibyte strings. (The negative-element global-cell bug was hand-found precisely
   because the generator never emits `-2`.)
3. **Oracle widening**: print decoy siblings and both union arms (multi-observation); derive
   INVALID-WASM from an independent validation step rather than wasmtime stderr grep.
4. Later, staged: a mutation/aliasing dimension (build → assign → re-read; wrapper-vs-backing
   identity), a control-flow dimension (loops, `match`, early return around the carrier), and a
   must-reject checker fuzzer (unsound-acceptance direction, currently dark).

## Phase 2 — Finish the rep rewrite as the primary workstream (the core; 4–8 weeks of waves)

Order (roadmap steps a/b retained, then extended):

1. **Fold the ~16 `fRet*` tables into stored `VKind`** (chartered) — de-risks the inferred-return
   fixpoint before totality changes its lattice.
2. **Move `$fnsig` producers/consumers onto interned keys** — kill the char-alphabet parsing
   (`annSigKey`, `sigKeyRetKind`, `calleeCloSigKey` digit scans); then delete
   `repLegacyCodeOfKind`.
3. **Make `RepDesc` recursive** (`Rep` tree as in Part II) + **the rep-keyed interner** for the
   remaining slot layers: ref-list (`rlSlotByName` — the chartered `B[]`-vs-`A[]` dedup), map
   values, variants. Struct layer is done and is the template. Memoize `repCanonKey`/
   `repSlotOfTy` while in there (generation-stamped, like `repTyScalarMask`).
4. **Drive `repOfTy` to totality over existing syntax**: burn R1 (typed-value maps in
   composition, ~106 shapes — the dominant family) through the recursive rep as the proof; then
   R4 (2-D arrays via `List(List(_))` — which dissolves rather than needing a special backing),
   R5/R6 (nullable-list-in-field, struct-through-list — compositional once the tree exists), R2
   (closure composite results — falls out of interned sig keys), R3b/R7 (value-union composite
   members — the largest genuine ABI-policy cluster). Every remaining `repUncovered()` becomes an
   explicit policy reject with a test.
5. **Delete the legacy ladder**: `vtKindOfType`'s name arms, the `nameIs*` predicates,
   `splitUnionAtoms` — deletion is the metric that the strangler actually strangled.

## Phase 3 — One type representation end-to-end (overlaps late Phase 2; 2–4 weeks)

1. **Typed-IR-only checker→emitter contract**: finish `nodeTyIx` coverage (synthesized/mono
   nodes included), then delete the eight `*RetName` string renderers and `canonEmitTypeNames`.
2. **Parser type AST**: parse annotations into nodes (names kept only for diagnostics), delete
   `nameToTy` and the six duplicate depth-aware splitters. This also un-mutates the AST
   (`canonEmitTypeNames` rewrote it in place) and fixes the quote-awareness class outright.
3. **Checker sentinel hygiene**: split `TY_ERR` from hole from absent; make
   `assignable(-1, _)` impossible; decode string-literal type texts (escape-resolved identity).

## Phase 4 — Structure, performance, DX (continuous, opportunistic)

- Land the designed emitter builder layer (separate lowering from byte emission in `wasmEmit.vl`);
  split `emit_classify.vl` along its real seams (classification / ABI codec / scratch kinds).
- **Inner loop**: profile the 37 s refresh — prime suspects are the per-code-point host string
  ABI (batch it: length-prefixed memory reads) and `repSlotOfTy`; target < 10 s before any
  incremental-compilation work.
- Testability: a driver entry that exposes check-only/emit-only over module boundaries so checker
  and emitter get direct tests; per-N-case wasm re-instantiation in the corpus runner; grow
  parser/lexer corpora (6/7 files is thin).
- Spans work (already designed) → `@error-at` column assertions + trap source maps.
- macOS/Windows CI legs (cheap: build + native suite); wire the release workflow.

## Phase 5 — Then the backlog, with two exceptions pulled forward

Your instinct (representation before features) is right, with the redefined milestone from
Part II. Two roadmap items should NOT wait, because deferral is accruing debt right now:
**numeric cast syntax** (currently inexpressible operations; small, self-contained) and the
**error-handling design doc** (std is shipping APIs against an undecided failure story — the
doc, not the implementation, is what's urgent). `vl test` lands naturally after, on std slice 4
as designed. Everything else (async, classes, playground, distribution) genuinely queues behind
rep totality.

---

# Part IV — Language features that would make the compiler itself cleaner

Ranked by measured in-repo pain. These are dogfooding accelerants: each removes a workaround
class inside `compiler/*.vl` — and several directly reduce the drift-prone-enumeration disease.

1. **Iterable, typed-value maps** (for-in over keys/entries; values beyond the mono set — much
   of this is exactly Phase 2 R1). Today `cUserTypes` "is a `Map` the compiler subset cannot
   iterate" (`typecheck.vl:8206`), forcing full-decl scans with bidirectional `assignable`; the
   ~60 parallel-array state groups across checker/CLI/emitter exist mostly because maps of
   structured values can't be trusted. Payoff: replaces the single largest accidental-complexity
   pattern in the compiler.
2. **Tagged-union ADTs with payload `match` (exhaustive, with binding).** The 27-member `VKind`
   string union, the field codes, `MfKind`/`BtKind`/`PushKind` are all hand-rolled enums
   dispatched by `if`-ladders; exhaustive `match` turns "add a kind, miss a consumer" from a
   fuzz finding into a compile error — the language-level fix for the drift disease. `match`
   phase 1 (litunions) is the right foundation; payload binding over struct variants is the
   compiler-cleaning increment.
3. **Self-referential type aliases.** Their absence forced index-linked arenas for both AST and
   `Ty` (`typecheck.vl:15-27`) and everything downstream of that (parallel field arrays, i32
   handles). Even if arenas stay for performance, recursive aliases let new compiler data
   structures be honest trees.
4. **Generic declarations surviving the module pipeline.** The driver skips any decl with `<` in
   its name, so no shared generic helpers across compiler files — one cause of hand-mirrored
   duplication (`subtractTy`/`isectSubtract`, then/else narrowing collectors).
5. **String interpolation + a non-quadratic string builder.** Diagnostics, canon keys, sig keys,
   and `tyToStr` are all `+`-concatenation; the O(n²) trap is documented as "the single biggest
   language perf papercut," and the compiler's own fix (i32[] accumulation) is a workaround the
   language should subsume.
6. **Else-branch `is` narrowing + re-widening on reassignment.** Both documented as recurring
   friction ("bit me and the agents repeatedly"); the pinned-narrow limitation produces the
   `s0/s1/s2` chains and blocks ~5 corpus files.
7. **Destructuring** (`const {a, b} = p`) — repetitive multi-field reads throughout.
8. **i64 in the compiler subset** — would delete most of `emit_bignum.vl` (647 lines of hi/lo
   arithmetic + hand IEEE-754 packing) once the compiler can trust its own i64 lowering
   (a nice self-hosting virtuous cycle: Phase 2 makes that trust justified).
9. **A retained `import` AST node** — the formatter re-scans tokens because imports produce no
   node; any future tool pays the same tax.
10. **`vl test` (chartered)** — the compiler's own unit tests (rep tables, interners, canon keys)
    currently have nowhere to live except the end-to-end corpus; in-language testing is what
    makes Phase 3's deleted-string-layer refactors safe at fine grain.

---

## What to keep doing (explicitly)

The exact bidirectional baseline discipline; graduation-with-frozen-regression; the fixpoint
ladder shipping the proven rung; the pass-dependency DAG with runtime verification; the
one-family-per-PR root-cause write-ups; design-doc-before-code; the thin-host principle; the
comment density. These are genuinely unusual strengths — the plan above is about pointing them
at layers instead of arms.

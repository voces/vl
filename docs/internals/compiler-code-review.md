# Compiler Code Review — Synthesized Priorities (2026-07-01, refreshed 2026-07-02)

> Independent six-audit review of `compiler/*.vl` run 2026-07-01 (P0/P1 findings verified live),
> synthesized against the 2026-06-27 review and cross-checked against `ROADMAP.md`. **Refreshed
> 2026-07-02 after three remediation waves (~50 merged PRs, #754–#800+):** completed items are
> compressed into the record table; the live to-do below is the remainder. IDs are `N1`-style;
> line numbers in surviving items have drifted — grep the identifiers.

## 1. Remaining to-do (prioritized)

### In flight (agents assigned, 2026-07-02)

- **N18 — split `wasmEmit.vl` (~29K lines) along its pass boundaries** into ~6 modules
  (rewrites · monomorphizer · shape collection · classifiers · lowering · section emission).
  Mechanical moves, byte-identical output per step, concat-build file lists updated.
- **Rep-matrix fuzzer expansion** (ROADMAP Next#2, the gate for N17): broaden the #667
  rep-composition fuzzer to floats/unions/closures/nullables/maps/nested shapes; big triaged
  sweeps. Confirmed bugs get pinned corpus repros; fixes dispatched separately.
- **P3 sweep** (first slice merged as #802: the `mTail` missing-restore fix in
  `checkMatchExprNode`, exact-repeat diagnostic dedupe, `??`-vs-`||`/`&&` unparenthesized-mixing
  parse error). Remaining slice: LSP `diagCode` surfacing, span-convention unification in
  `check_query.vl`, `nodePos` loud fallthrough, stale headers, `gImports == 4` workaround
  re-test, AGENTS.md stale `tests/run.ts` gate reference.
- **ci-native wall-clock optimization** (191s baseline: self-lint 63s, fixpoint 39s, native
  suites 27s, seed refresh 22s, host build 15s): stage-build dedupe between refresh/fixpoint,
  graph-check self-lint, artifact caching (seed by source hash, host binary, wasmtime
  AOT/compilation cache), redundancy audit with full-coverage constraint.

### Next (unblocked once the above land)

- **N17 — `repOf(type) → descriptor` unification** (ROADMAP Next#1, independently corroborated
  by both emitter audits). Gates per the roadmap: the fuzzer (in flight) + a mostly-closed
  type×position matrix. Strangler, site-by-site, each step fixpoint-gated. First consumer
  candidate: the i64/f32 print-import *substring* heuristic (`strContains(tyName, "i64")`) —
  byte-level output changes on a semantically irrelevant rename.
- **N22 — type annotations as a real AST (`TypeExpr` nodes).** The parser still flattens the
  type sublanguage into concat-built strings that `nameToTy` re-parses per use; five
  string-grammar implementations must agree. Also closes the D4 as-written-type-syntax fidelity
  gap. Sequenced after N17's descriptor stabilizes (avoid two simultaneous representation
  migrations).
- **N20 remainder** — `ExpCtx` explicit context shipped for 19 save/restore clusters (#792);
  remaining: the coercing-emitter wrappers, forced-reset sites (`collectLocals` tail,
  `emitObj`'s field loop), and the end state (consumers take ctx as a parameter; the globals
  die).
- **N30 remainder** — finish the `fb*` builder migration (~15 missing methods eliminate the
  remaining raw `wU8(<n>)`/`fbI32Bin(<n>)` sites in wasmEmit — old M5's tail); fold the
  per-rep classifier/scratch-frame clone triplets via a `VKind` parameter (old H2's tail);
  split `emitCoalesce` (~589 lines) per kind arm. Cleanest after N18's split lands.
- **N11 remainder — the bulk host↔wasm string channel.** The cheap fixes shipped (#761); the
  real fix is H-M2's linear memory + GC-string↔memory copy, which kills the
  one-code-point-per-call protocol everywhere. Justified by perf alone; also the H-M2 prereq.

### Needs a maintainer design decision

- **N5 — mutable-container variance** (`Cat[]` → `Animal[]` + write checks clean → invalid
  wasm; verified). ROADMAP A8 (Exact/Inexact) + A9 (Readable/Writable) are the designed fix;
  they gate the "fully statically sound" claim. Decision needed on defaults/surface before
  implementation.
- **N31 — formatter wrap architecture** (single measured-layout primitive instead of
  per-construct hand-threaded columns; `splitTopLevel`'s ad-hoc string lexer; the remaining
  wrapped-expression trailing-comment tear-off). Parked while `vl-fmt-wrap-indent` is in
  flight. New evidence for the pile: `vl fmt` needed two passes to converge on an edited
  `wasmEmit.vl` (non-idempotence repro), and `fmt --check` on wasmEmit.vl OOMs a ~3 GB
  null-collector heap.

### Known-open oddities (small, unowned)

- Two `@warning`-carrying corpus fixtures deliberately ignore an argument — fine, but the
  pattern suggests a `_`-param convention doc note.
- `vl check` heap exhaustion root cause (never-freeing null collector × whole-graph re-checks)
  is *masked* by the per-run source cache (#771), not cured — a sufficiently larger tree still
  traps. Real cure = per-module check reuse, blocked on H3 symbol-based resolution. Same class:
  deep import chains are quadratic before they trap (19s at 800 deep).
- Function names in lint stay name-keyed (hoisting); a local shadowing a function name
  attributes uses to the local. Documented divergence in lint.vl's header.

## 2. Record: what the review produced (waves 1–3, 2026-07-01 → 07-02)

All three P0s and every assigned P1/P2 shipped; ~50 PRs merged. Compressed record:

| Item | Outcome (PRs) |
|---|---|
| N1 union-member hole → `any` | Fixed (#755); corpus-pinned |
| N2 `vl fmt` corruption + no write gate | Fixed (#758) + round-trip gate & exit codes (#768) |
| N3 list reads bounds-checked cap-not-len | Fixed reads+writes (#767) |
| N4 unconstrained hole into concrete callee | Fixed at call-site constraint recording (#762) |
| N6 duplicate top-level functions accepted | Rejected now; in-tree dups deleted (#757) |
| N7 module-rename misbinding | Diagnosed at merge time (#756); real fix stays H3 |
| N8 comment flush gaps | Fixed (#769); tear-off remainder → N31 |
| N9 float-literal overflow | **Compile error** (maintainer decision on #774); gradual underflow exact; runtime stays IEEE; std `INF`/`NAN` constants recommended (B2) |
| N10 >10K-element literals | Chunked (#778) |
| N12 `vl check <dir>` O(files×closure) | Per-run source+token caches (#771) — also unmasked that master *trapped* on the full tree (heap exhaustion), see oddities |
| N13 checker perf | `tyEq` −14% check time (#777), `tokIxAtStart` (#779). **Interning/memo measured counterproductive** (+40%/+16%, 7% hit rate — in-place hole pinning invalidates; pass-0a placeholder fill-in makes naive interning collapse aliases). Closed by refutation; future attempts need alloc-free i32 keys + fine invalidation |
| N14 emitter walks | Kind-mask pre-scan (#770), capture-list cache (#772). **Full classifier memo built, byte-identical, net −4% — dropped**; invalidation-point inventory in the PR record; real fix is N17 |
| N15/N16/N21/N19 | LEB streaming (#760), formatter/lint scans (#775 + maps), Phase-G oracle deleted (#766), pass table with prereq assertions (#786) |
| N23/N25/N26 | Parser panic-mode recovery (#763), lexer batch (#754), checker batches (#764, #791) — incl. the *real* match hole: non-`_` ident patterns were phantom wildcards suppressing exhaustiveness |
| N24 (old H1) | Distinct `unsupported-lowering` diagnostic channel (#784); exactly four capability rejections inventoried (union-return box, nullable-struct return, `print(<value-union>)`, i32-keyed Map) — the B-emitmsg feed |
| N27 + follow-ups | Generic lint walker + anchors (#759), binding-keyed tracking (#765), **imports get AST nodes** (#785), **per-module lint + real unused-import rule** (#794/#799) — 926 findings in the compiler's own source cleaned (#794–#796, #802); `lint-self` now enforces |
| N28 | Strict args + reset (#773), positioned module diags + sibling aggregation + UTF-8 errors (#776), `--json` (#783), hygiene batch (#787) |
| N29 emitted-code quality | Shared string/map helpers, literal pooling, export hygiene (#788/#790/#793/#798): **binary 1,014 KB → ~760 KB (−25%), self-compile 13.3s → 10.6s, exports 2,010 → 191**; module-mode exports un-mangled (ABI improvement); stale re-export-alias leak fixed |
| Bugs *found* by the waves | Fixed: ref-list globals mis-typing (#782), returned-local return-inference miscompile (#797), master-red fixture (#800), `mTail` restore (#802). LSP `readString` stack blowout fixed (#789) |
| Old C/H/M/L review | All closed or absorbed except: M3's structural half (`TyHole`/`TyErr` split — small, unowned), M5/H2 tails (→ N30) |

**Corrections to the 2026-07-01 doc, learned by doing:** N13's quadratic-compare theory didn't
survive measurement (above). N27's "name-keying masks unused imports" was the wrong mechanism —
lint ran on the entry file only and imports had no AST node at all; both now fixed. N26's
numeric-pattern repro was already parse-rejected; the live hole was ident patterns. The
old-review's B16/B17 roadmap staleness was fixed in the roadmap directly (#781).

## 3. Process notes (for the next fleet)

Worktree fleets with file-ownership partitioning worked (~50 PRs, conflicts only where merges
crossed mid-flight); `git stash` is shared across worktrees — don't use it in agents. GitHub's
merge button on a *stacked* PR defaults to the stacked base — two "merges" landed into sibling
branches instead of master; check the base ref when merging stacks. Corpus fixtures that pin
diagnostic wording can go red when two independently-green PRs merge (wording change × new
fixture) — a merge-train re-gate or merge-queue would catch it.

When an item here is completed, move it to `CHANGELOG.md` per the roadmap's maintenance
convention and strike it from this file.

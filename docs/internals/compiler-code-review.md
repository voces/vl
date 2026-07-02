# Compiler Code Review — Synthesized Priorities (2026-07-01)

> Second independent review of `compiler/*.vl`, run 2026-07-01 as six parallel subsystem audits
> (front end · typechecker · emitter architecture · emitter correctness/perf · driver/CLI/host ·
> formatter/linter), each conducted **without reading the prior review**, then synthesized against
> the 2026-06-27 review (which this document replaces) and cross-checked against `ROADMAP.md`.
> Every P0 and the headline P1s were **verified live** against the current `vl` binary — repros
> are inline. Line numbers reflect 2026-07-01 and will drift; IDs are `N1`-style so commits can
> reference them without colliding with the old review's `C/H/M/L` IDs.

## 1. Scorecard: the 2026-06-27 review, four days later

The prior review triggered a real remediation sprint — ~36 of the 92 commits since it landed
(#686) carry its finding IDs. Status of each old item:

| Old ID | Finding | Status |
|---|---|---|
| C1 | Stringly-typed type identity across phases | **Emitter side largely done** — typed-IR `nodeTyIx` sidecar + classifier migration, name-classification fallbacks retired (#736–#752). **Remaining:** parser still string-encodes annotations; `nameToTy` re-parse in the checker; name-based emitter interfaces (`canonEmitName`, `inferRetTy`) → N23, N18 |
| C2 | Uncentralized integer kind codes | **Substantially done** — 22-member `VKind` string-literal union (`emit_state.vl:273`), enabled by purpose-built litunion language features (#688–#699). **Remaining:** the *other* enumerations still coexist (sig-key chars, mf codes, 19 `fRet*` arrays) → N18 |
| C3 | 1,000+-line dispatchers | **Done** — `checkNodeReal` 1,283→~109 lines, `emitExpr` 1,338→~63, `emitModule` 925→158, `emitStmt`/`emitCall`/`emitBinExprNode` split (#723–#733). New largest fns are per-kind ladders → N31 |
| H1 | Checker soundness entangled with emitter capability | **Open** — no tagged commits; still interleaved. Typed-IR handoff is the eventual fix → N25 |
| H2 | Per-type copy-paste ladders | **Partial** — #734/#735 landed; the per-rep clone triplets remain → N31 |
| H3 | Duplicated IEEE float encoders | **Done** — unified `ieeeBytes` (`emit_base.vl:137`) with thin f64/f32 wrappers. (New: the shared encoder lacks exponent clamping → N9) |
| M1 | Type equality by string rendering | **Partial** — 2 of 3 cited compare sites remain (`typecheck.vl:2247,6503`); no structural `tyEq`; 122 `tyToStr` call sites (was 114) → N14 |
| M2 | Linear-scan lookups on hot paths | **Partial** — `symOccHasTok` (#732), `parentLetOf`/`inferRetNameOf` (#696) fixed; many remain → N14–N17 |
| M3 | Overloaded `-1` sentinel | **Open** — and now *realized as a live soundness hole* (N1 is exactly this hazard firing) |
| M4 | Parallel-array module globals | **Open** (host-forced; unchanged) → N21 for the `pending*` subset |
| M5 | wasm opcodes as magic numbers | **Partial** — `emit_bytes.vl` named (#731); ~295 `wU8(<n>)` + ~193 `fbI32Bin(<n>)` raw sites remain in `wasmEmit.vl` → N31 |
| L1–L5 | minor | L3 (Phase-G assert oracle) **open and overdue** → N22. L5 superseded by the `VKind` union. L1/L2/L4 open, low |

The 2026-06-27 "highest-ROI program" (kind constants, one type-name grammar, split dispatchers,
decouple checker from emitter) is roughly half executed. What follows is the re-prioritized
remainder plus what the fresh audit found.

## 2. Prioritized to-do

Tags: `[ROADMAP: X]` = the roadmap already tracks this (item reinforces/re-prioritizes it);
`[NEW]` = not on the roadmap; `[VERIFIED]` = reproduced live against the current binary.

### P0 — soundness / data corruption. Fix first.

- **N1. A typo'd union member turns the whole annotation into `any`.** `[VERIFIED]` `[NEW; add to A12 corpus]`
  `nameToTy`'s union arm pushes an unresolved member without poisoning (`typecheck.vl:3242-3249` —
  unlike the array arm, which returns `-1`), and `assignable` returns `true` when either index is
  negative, so the `-1` member accepts every source.
  Repro: `let x: Bogus | i32 = "not an i32"` → **zero errors**; bare `let y: Bogus = 5` errors
  correctly. Fix: poison the union like the array arm. Add the case to the soundness corpus.
  This is old-M3 (`-1` sentinel overload) manifesting; a `TyHole`-vs-`TyErr` split remains the
  structural fix.

- **N2. `vl fmt` can corrupt a valid program, and `-w` writes it with no safety gate.** `[VERIFIED]` `[NEW]`
  A comment as the first line of a non-collapsible if-expression branch swallows the branch body:
  `const x = if c { // pick one` + `log(1)` + `1` … formats to
  `const x = if c { // pick one log(1) 1 } else { 2 }` — the `//` comments out the code *and* the
  closing brace; the output **does not parse**, and `fmt -w` would overwrite the file with it.
  Root cause: the verbatim-slice fallbacks are comment-unaware (`collapseWs(sliceNode(ix))`,
  `format.vl:1860`, `1390-1394` — `collapseWs` joins lines with a space, so any `//` in a slice
  eats the rest of the emitted line). Compounding: `cliFormatNow` (`cli_util.vl:253-263`) never
  re-parses the *output* before `CMD_WRITE_FILE`, and silently passes through unparseable *input*
  with exit 0 (so a CI `fmt --check` gate passes on syntactically invalid code).
  Fix in two layers: (a) make the slice fallbacks comment-aware; (b) add a prettier-style gate —
  re-parse the output (the formatter already links the parser), keep the original + report on
  failure, and give parse-failed inputs a diagnostic + distinct exit code. The gate converts any
  future printer bug from data loss into a diagnostic.

- **N3. List index reads bounds-check *capacity*, not `len` — silent garbage reads.** `[VERIFIED]` `[NEW]`
  `emitIndex` lowers `xs[i]` as backing-array `array.get` with no compare against the wrapper's
  `len` field (`wasmEmit.vl:9143-9172`), so after `.push` grows `cap`, reads in the
  `len <= i < cap` slack return `0` silently (ref lists: a misleading null-cast trap).
  Repro: `const xs: i32[] = []; xs.push(42); print(xs[3])` → prints `0`; `xs[9]` traps.
  The map path already emits the unsigned `i u< len` compare — this is an inconsistency, not a
  policy. Fix: emit the same compare on scalar/ref list reads (and writes).

### P1 — soundness & correctness

- **N4. An unconstrained inference hole passed to a concrete callee is never checked.** `[VERIFIED]` `[ROADMAP: A13/A12]`
  `assignableGo` returns `true` for any `TyVar` on either side (`typecheck.vl:4140-4141`) and call
  sites only re-validate *recorded* demands; a hole flowing as an argument records none.
  Repro: `function g(n: i32) { return n + 1 }; function f(x) { return g(x) }; f("hello")` →
  `vl check` clean, then **invalid wasm at run** (`expected i32, found (ref $type)`).
  The roadmap already declares the A13 permissive-hole xfails "fixable bugs, not parity
  constraints" — this repro shows the fix is due: record a constraint when a hole meets a concrete
  param type, or check holes at function-exit scope close.

- **N5. Mutable-container covariance is unsound — and now demonstrably load-bearing.** `[ROADMAP: A8/A9 — promote]`
  Arrays are covariant and width/depth subtyping applies to mutable fields
  (`typecheck.vl:4207-4229`); `Cat[]` passed as `Animal[]` plus a write checks clean and emits
  **invalid wasm** (verified by the typechecker audit). A8 (Exact/Inexact) and A9
  (Readable/Writable) are the designed fix and currently sit unstarted mid-roadmap; this repro
  argues they gate the "fully statically sound" claim and should be scheduled.

- **N6. Duplicate top-level `function` declarations are silently accepted; last wins.** `[VERIFIED]` `[NEW; contradicts B16's premise]`
  `function foo(..){..}` twice in one file → check clean, second body wins at run (dup `const`
  errors correctly). B16 states "same-scope redeclaration errors" as current behavior — functions
  evidently bypass it. Live instance in-tree: `mkIndex`/`mkArrayLit` are each defined twice in
  `ast.vl` (~578 and ~761) — identical today, a silent divergence hazard tomorrow. Fix the checker
  gap, then delete the dead copies.

- **N7. Module-merge rename can silently misbind.** `[ROADMAP: H3 post-parity module revisit]`
  In `modBuildRename` (`driver.vl:1598-1618`), a top-level declaration colliding with an import
  local is skipped from the rename map while the import mapping still applies — every reference
  rewrites to the *import's* target, no duplicate-binding diagnostic anywhere on the path.
  Stopgap: diagnose the collision at merge time. Real fix: the roadmap's symbol-based resolution
  replacing the rename walker (this finding is fresh evidence for not betting further on the
  walker).

- **N8. Formatter comment-placement family (beyond N2).** `[ROADMAP: D4-adjacent]`
  (a) `emitFunction` lacks the trailing interior-comment flush `emitBlockBody` has
  (`format.vl:1312` vs `1009-1019`) — a comment in the last statement of a function body is
  emitted *after the program's final `}`*; same gap in `blockExpr`/`functionExpr`.
  (b) A trailing comment on an interior line of a wrapped expression is torn off its anchor and
  dumped after the statement with a spurious blank line (`format.vl:760`).
  Idempotence is tested and holds; comment *placement* is the untested invariant — add
  comment-preservation round-trip tests per construct.

- **N9. `ieeeBytes` has no exponent clamp — out-of-range float literals encode silently-wrong values.** `[NEW]`
  `biased = bigE + bias` is packed unchecked (`emit_base.vl:233-258`): a ≥1.8e308 literal (a
  309-digit lexeme needs no exponent syntax) masks high bits and encodes an arbitrary finite
  value; sub-denormals pack garbage. Violates the emitter's own never-silently-wrong-bytes policy
  (`wasmEmit.vl:709-711`). Clamp to ±inf / fail loudly; same for f32 at ~3.4e38. (The rounding
  itself — guard/sticky, ties-to-even — is correct.)

- **N10. String/array literals >10,000 elements emit modules that fail validation.** `[ROADMAP: B7-adjacent]`
  `emitStr`/`emitArr` lower one `i32.const` per element + `array.new_fixed`, which V8/binaryen cap
  at 10,000 operands (`wasmEmit.vl:6923-6939`); nothing chunks or fails loudly first. Chunk via
  segments or fail with a source-located diagnostic until the B7 string-rep migration.

### P1 — systemic performance

- **N11. The host↔wasm boundary moves strings one code point per call, both directions.** `[ROADMAP: pulls H-M2 prereq forward]`
  `srcPush(c)`/`result_push`/`modSrcPush`/`rbyteAt(i)`/`read_cli_str` are all per-char/per-byte
  (`scripts/vl-host/src/main.rs:256-346`, `driver.vl:156`) — several **million** boundary calls to
  self-compile before any compilation happens. H-M2 already requires a linear-memory bulk-copy
  channel (`__store_string__` analog); building it now removes the dominant boundary cost and
  de-risks the WASI flip. Also: `stage_program` stages the entry source twice in module mode;
  diagnostic accessors are accidentally quadratic (`diagAt(i)` re-renders **all** diagnostics per
  character read, `driver.vl:826-851` — two-line memo fix, the `symTyBuf` idiom).

- **N12. `vl check <dir>` recompiles each file's whole import closure — O(files × closure).** `[NEW; feeds incremental-build design]`
  `cliBeginCheck` runs `modReset()` + the full fetch/parse/rename/check loop per file
  (`cli.vl:778-792`), so `ast.vl` is re-read, re-pushed per code point, re-parsed and re-checked
  once per dependent — effectively quadratic over `compiler/`. A per-run source/parse cache keyed
  on module key is the cheap first step; per-module *check* reuse needs the N7/H3 symbol-based
  merge (the in-place rename is what forecloses it — also the LSP's per-keystroke cost).
  Related: every module is tokenized twice (modScan + vcLoadToks), the entry file three times
  (+lint), once more after `--fix`.

- **N13. The checker has no assignability memo and no type interning.** `[NEW]`
  Every `assignable` re-traverses structurally with an O(depth) cycle-guard scan per node;
  `sameVariantTy` = two full traversals per pair; `subtractTy`/`joinTys` are O(k²)-pairs over the
  ~40-variant `Node` union on **every** `is`-narrowing in self-compile (`typecheck.vl:4119-4133`,
  `1411`, `1426`). Composite constructors (`mkNullableTy`/`mkArrayTy`/…) mint fresh arena entries
  per use site (`:710-768`), so the `src == dst` fast path never fires and memo keys don't exist.
  Fix order: hash-cons constructors → (src,dst) memo table → structural `tyEq` to replace the two
  remaining string-compare sites (old M1). The file's own #494 note (4× regression from
  `tyToStr`-per-`let`) is evidence this class is load-bearing.

- **N14. The emitter classifier web is unmemoized; function bodies are walked ~15× before lowering.** `[ROADMAP: interim step inside Next#1]`
  38 recursive `expr*` classifiers re-derive types per query; single sites fan out to up to 7 of
  them on the same subtree (`ifExprRefKind`, `emitPush`, `emitCoalesce`) — superlinear in
  expression depth. `emitFuncCode` runs 10 `fnHas*` scans + 5 collectors per function
  (`wasmEmit.vl:15714`). `emitCapturedRead` re-walks the whole lifted body per identifier read in
  a capturing closure — O(body²) (`:5601`). The arena index is a perfect memo key; a bitmask
  pre-scan replaces the `fnHas*` family. (`parentLetOf` — formerly ~10% of self-compile — proves
  the cost class and the fix pattern.) Full retirement of the web is N18.

- **N15. Hot-path allocation churn in byte emission.** `[NEW]`
  `wULEB`/`wSLEB` allocate a fresh GC array per operand and copy it (`emit_bytes.vl:191-199`) —
  one short-lived allocation per `local.get`/`call`/`br` across millions of operands. A direct
  7-bit shift loop into `curBuf` is byte-identical output, zero allocations.

- **N16. Formatter/linter superlinear residue (measured).** `[NEW]`
  `recoverIsType` scans `P.toks` from 0 per `is` expression, `fieldKeyText` likewise
  (`format.vl:1676`, `1761`): `fmt --check` on `typecheck.vl` = **4.9 s** vs 0.73 s on a file 3.6×
  smaller. Seat the scan with the existing binary-search `tokIndexAt`. Lint: `refNamesHas`/
  `writeNamesHas` are linear string scans per identifier (`lint.vl:526`) — tens of millions of
  compares on the CI self-lint; the map idiom already exists in `check_query.vl:384`.

### P1/P2 — architecture

- **N17. Emitter rep unification (`repOf` descriptor).** `[ROADMAP: Next#1 — independently corroborated, twice]`
  Both emitter audits, blind to the roadmap and to each other's conclusions, converged on the
  roadmap's own top item: **five** parallel kind enumerations (the `VKind` union, raw 0–21 codes,
  single-char sig-key codes — *different numbers again* in `sigKeyRetKind`, 19 parallel
  `fRet*`/`ret*Flag` families, side enums `MfKind`/`BtKind`/`PushKind`) with hand-written
  translator ladders, plus the 38-classifier shadow type system that re-derives what the checker
  already knows (imports nothing from `typecheck.vl`). Comment-enforced ordering traps ("must be
  intercepted BEFORE `letIsVariant`") are the fragility signature. The typed-IR sidecar (C1
  endgame) is the bridge; the staged plan (structural-tolerant resolvers → non-i32 fuzz tester →
  strangler `repOf`) is right. One audit adds: the i64/f32 print-import decision is a *substring
  match over type names* (`strContains(tyName, "i64")`, `wasmEmit.vl:26809-26820`) — byte-level
  output changes on a semantically irrelevant rename; make it the first `repOf` consumer.

- **N18. Split `wasmEmit.vl` (29.5K lines, 730 functions) along its existing pass boundaries.** `[NEW]`
  It is six subsystems communicating through `emit_state.vl` globals — AST rewrites,
  monomorphizer (~900 lines), shape/type collection, classifiers, expression/statement lowering,
  section emission — so the split is mechanical: ~6 modules. Do it before or with N17; both
  reviews found file scale itself impeding safe change. Also delete the stale "codegen spike"
  header (`:131`), false for ~23K lines.

- **N19. `emitProgram` pass-ordering is comment-enforced and partially duplicated.** `[NEW]`
  ~15 sequential passes, two run twice because monomorphization mints late annotations
  (`wasmEmit.vl:26683-26765`); ordering constraints live in comments with no mechanical check. A
  pass-manager-lite (ordered list + per-pass pre/post assertions) turns silent reorder bugs into
  loud ones.

- **N20. The 16 `pending*` implicit-parameter globals.** `[NEW]`
  Manual save/restore per site (`emit_state.vl:9`; e.g. `emitCoalesce` `:28220-28223`); a missed
  restore is a silent miscompile at a distant site. An explicit expected-type context struct
  passed as an argument is self-hostable.

- **N21. Delete the Phase-G dual-bookkeeping oracle.** `[NEW; old L3, overdue]`
  `mAssignTypeIndices` still carries the retired hand-laid offset formulas as an assert oracle
  ("for one release", landed 2026-06-08) and the dead half has since **grown** (value-box
  additions implemented in both halves, `wasmEmit.vl:16717-16732`). The byte-exact fixpoint is the
  real oracle now.

- **N22. Type annotations as a real AST (`TypeExpr` nodes), not synthetic strings.** `[ROADMAP: D4 fidelity gap — same root cause; old C1's remaining half]`
  The parser flattens the whole type sublanguage into concat-built strings that `nameToTy`
  re-parses on every use (`parser.vl:334`, `typecheck.vl:3225-3501`) — quadratic-ish construction,
  five string-grammar implementations that must agree (and historically haven't: `") -> "` vs
  `") => "`), and the D4 as-written-type-syntax loss for hover/formatter. One migration solves
  N1's hazard class, the D4 fidelity gap, and the last stringly-typed phase boundary. Sequence
  after N17's descriptor stabilizes the emitter side (avoid two simultaneous representation
  migrations).

- **N23. Parser error recovery: add synchronization points.** `[NEW]`
  `expect` on mismatch consumes whatever it finds — including structural closers — with no
  panic-mode sync to NEWLINE/`}` (`parser.vl:208`), so one error cascades. Related singletons,
  cheap to fix alongside: `skipImport` swallows all code up to the next string literal on a
  malformed import (`:1743`); `pendingGt` is never reset across declarations/runs (`:295`) — a
  banked phantom `>` corrupts a later unrelated annotation; postfix `++` on a non-Ident is
  silently left in the stream and re-parses as prefix (`:813`); messages leak token kind names
  ("expected RPAREN") instead of lexemes.

- **N24. Quarantine emitter-capability rejections from type-soundness verdicts.** `[NEW; old H1]`
  Still open: "cannot infer a union return type — annotate"-class errors are emitter-capability
  admissions gated on predicates like `valueUnionRetName(...) == ""`, and ~13 exported `node*`
  queries feed emitter metadata out of the checker. Route unsupported-lowering through a distinct
  diagnostic channel (also unlocks honest B-emitmsg wording); the typed-IR handoff progressively
  shrinks the metadata surface.

### P2 — grouped by subsystem

- **N25. Lexer/front-end correctness batch.** `[NEW]` Lone `\r` never bumps `gLine` (wrong lines
  file-wide, `lexer.vl:146`); unterminated string consumes to EOF and diagnoses *at EOF* instead
  of the opening quote (`:368` — terminate at first unescaped newline); `scanQuoted` builds
  values char-by-char — O(k²) (`:459` — accumulate spans); escape decoding is discarded at the
  `Tok` bridge (parser re-strips quotes by hand and an escaped string key would be wrong,
  `ast.vl:46` / `parser.vl:678-683`); `i32ToStr(INT_MIN)` returns `"-"` (`ast.vl:806`); unknown-char
  diagnostics name neither the char nor the right column (`lexer.vl:655`).

- **N26. Checker correctness batch.** `[NEW]` `bindGenWalk`/`substTyDeep` miss `TyMap` (and
  `TyNeg`) — a generic through `{[string]: T}` silently keeps the hole, which N4 then waves
  through (`typecheck.vl:4515-4644`); literal-type identity compares raw lexemes — `0x10` is not
  assignable to `16 | 32` (`:4184`); index-assign re-checks the receiver subtree → duplicated
  diagnostics (`:8483`); match patterns other than Ident/StrLit are silently ignored →
  misattributed "non-exhaustive" (`:9057`); generic-alias arity/bare-use errors carry no position
  (`:3155-3163`); the exhaustiveness error should name the missing variants (the `match` sibling
  does, `:6264` vs `:9119`); void identity compared by index in three gates despite `isVoidTy`'s
  own warning (`:1215` vs `:6263`).

- **N27. Lint infrastructure: one generic walker, then rules.** `[ROADMAP: B17 — do infra before backlog]`
  Five near-duplicate recursive walkers must be updated in lockstep and weren't: `MatchExpr` is
  missing from four of them, so unused-var/prefer-const/unreachable/constant-condition are
  **blind inside match arms** (verified) (`lint.vl:720` etc.). A generic child-iterator with
  per-rule callbacks makes the next node kind a one-place change. Also: `unusedFunctions` anchors
  at the closing `}` instead of the name (`:917` — `declNameTokOf` is two lines away); name-keyed
  reference tracking masks unused imports whenever *any* module uses the name (the in-tree
  duplicate/unused import blocks in `parser.vl`/`format.vl`/`lint.vl`/`cli.vl` survive self-lint
  because of it) — binding-keyed tracking or at least per-module name scoping fixes both.

- **N28. Driver/CLI robustness batch.** `[NEW]` Unknown flags and a second positional arg are
  silently dropped (`vl check a.vl b.vl` checks only `a.vl`, `cli.vl:419-453`); `cliArgReset`
  misses `cliExcludes` (a `const`, can never clear), `cliCmd`, fmt/fix flags, and `dgMod`
  (`:194-223`) — latent until any instance reuse; module-resolution diagnostics are positionless
  (`at: -1`) and deduped by message text, and the multi-module parse loop aborts at the first
  file with errors instead of aggregating siblings (`driver.vl:1436-1461`); `checkSrc` leaves
  stale `W.bytes`/`emitErr` readable through the ABI (`:313-337`); non-UTF-8 files surface as
  "cannot resolve import" (`main.rs:682-696`); no `--json` diagnostics output anywhere `[ROADMAP:
  add to C-cli polish]`.

- **N29. Emitted-code quality: shared helpers, string pooling, export hygiene.** `[ROADMAP: B7/size-adjacent]`
  Every map op inlines the full FNV hash + probe + resize machinery at each use site; string
  concat/eq/slice likewise (documented as policy, `emit_state.vl:408-410`) — hundreds of bytes per
  site. String literals allocate per evaluation (per loop iteration) with no constant pooling.
  Every function — lambdas and mono instances included — is unconditionally exported
  (`wasmEmit.vl:29439-29488`). The emitter already synthesizes module functions (start, `__log__`),
  so shared helpers are structurally available.

- **N30. Emitter mechanical batch.** `[NEW]` Finish the builder migration (~15 missing `fb*`
  methods eliminate the ~488 remaining raw-opcode sites — old M5); fold the per-rep clone
  triplets (`exprIsF64/I64/F32`, the six push-scratch families) via a `VKind` parameter — old H2;
  split `emitCoalesce` (589 lines) per kind arm; guard the `for … step` constant fold with
  `numLexFitsI32` (`:14884` — `step 4294967297` folds to step 1); `wName` masks non-ASCII export
  names to low bytes (`emit_bytes.vl:203` — guard until identifiers loosen); rename or alias
  `fbI32Bin` used for i64 opcodes.

- **N31. Formatter wrap architecture (active `vl-fmt-wrap-indent` risk).** `[ROADMAP: D4]`
  Wrapping is single-alternative greedy with `column`/`reserved` hand-derived per construct
  (`emitLet` `+3`, `emitReturn` `+7`, `functionHeader` `reserved`…), several sites passing
  `column = 0` — every new construct re-derives the bookkeeping, which is where column-drift bugs
  come from. Introduce one measured-layout primitive (fits(column, text) + a group abstraction)
  before adding more wrap cases. Also: `splitTopLevel` mis-lexes escapes/char literals while
  `trailingCommentAt` gets both right — two ad-hoc lexers for the same text (`format.vl:853`);
  `matchExprFmt`/`blockExpr`/`collapseWs` re-introduce the O(n²) accumulation the codebase
  documents fixes for elsewhere.

### P3 — noted, low

`??`/`||` share precedence 2 (silent left-assoc mixing; most languages hard-error) and `=` parses
in condition position (the planned B17 lint covers the literal case) · `modVisit`/`cliGlobAt`
recursion → opaque wasm trap on adversarial depth/globs · linear nominal tables
(`structIndexByName`, `rlSlotByName`) and per-query sig-key rescans · `nameNamesFunction` scans
the whole arena per field · `tokIxAtStart` linear scan per scope push in LSP mode ·
span-containment conventions disagree across `check_query.vl` (end-inclusive vs -exclusive) ·
`nodePos` silently returns −1 for unlisted node kinds · the `gImports > 0` bootstrap-checker
workaround needs a tracking issue (`wasmEmit.vl:26833`) · stale doc headers (`lexer.vl:475`
claims comments are dropped; they aren't) · `recordRedundantAnnot`'s token scan never breaks ·
duplicated import blocks (fall out of N27).

## 3. Roadmap cross-check

**Independently corroborated (keep/raise priority):**
- **Next#1 (emitter rep architecture)** — both emitter audits converged on it blind (N17). The
  staged plan is validated; N14's memoization is a cheap interim inside it.
- **Next#2 (non-i32 rep fuzz tester)** — the #667 VL-native rep-composition fuzzer + the #674
  construct-only variants partially deliver this; the roadmap entry should be updated to reflect
  what exists and what's missing (float/closure/nullable coverage breadth).
- **A8/A9 (variance)** — no longer a design nicety: N5 is a checks-clean → invalid-wasm repro.
- **H3 (symbol-based module resolution)** — N7's silent misbinding and N12's foreclosed
  incrementality are two new reasons the rename walker shouldn't carry more weight.
- **H-M2 (linear-memory string channel)** — N11 justifies pulling the bulk channel forward on
  perf grounds alone.
- **B17 (lint backlog)** — N27 argues the generic-walker + binding-keyed infrastructure comes
  before more rules; the suppression mechanism (`vl-ignore`) is prerequisite to opinionated ones.
- **B-emitmsg / B-debug** — N24's distinct unsupported-lowering channel is the enabling step.
- **B7 (strings)** — N10 (10K cap) and N29 (pooling) add two concrete sub-items.

**Roadmap staleness found:**
- B17 lists **unused-function** as REMAINING ("functions are excluded via the `kind` guard") —
  it shipped (`unusedFunctions`, `lint.vl:917`, verified firing; its anchor bug is N27).
- B16's "same-scope redeclaration errors" premise has a function-shaped hole (N6).
- Next#2's fuzzer is partially built (#667) but the item reads as unstarted.

**Material items absent from the roadmap** (candidates to add): N1/N3 soundness fixes and the
fmt-safety gate N2 (arguably "just bugs" — but P0 ones); the compiler-performance program
N12–N16 (no roadmap track owns compile-time today; F9's baseline would make it measurable);
N18 (file split); N22 (`TypeExpr` AST — only D4 gestures at it); N23 (parser recovery quality);
`--json` diagnostics (C-cli).

**Sequencing suggestion.** P0s are afternoon-sized except N2(a). Then: N4+N5 close the verified
soundness holes (with corpus entries) → N17/N18 proceed as planned with N14 as the first slice →
N22 after the descriptor lands → the perf batch (N11/N12/N13/N15/N16) is independent and
PR-sized per item → batches N25–N31 are good intern/idle-time units.

## 4. Strengths (confirmed by all six audits)

The 2026-06-27 assessment stands: this is a genuinely impressive self-hosted compiler, and four
days of review-driven commits made it measurably better. Independently re-confirmed: the arena
AST design; exception-free accumulate-and-recover error discipline; the acyclic emit support
layering and now-complete `BinaryWriter`/`FuncBuilder` migration (0 raw opcode pushes on the
bytes path, O(n) assembly, no back-patching); textbook LEB128 (including the hand-rolled 64-bit
pair SLEB) and exact single-rounding decimal→IEEE conversion; deliberate numeric edge-case
handling (`i32.MIN` negation, i64 auto-promotion, mod-2⁶⁴ parity); fail-loud discipline
(`emitFail` clears the buffer — no plausibly-valid partial modules); real soundness engineering
in the checker (definite assignment with fork/join + TDZ, demand-driven return-inference
fixpoint, flow narrowing with De Morgan, literal-union closed sets, lossless-only widening);
strict phase gating in the driver; the seven-verb host boundary that keeps all policy in wasm;
tested formatter idempotence; a model-conservative `check --fix`; CI dogfooding (`lint-self.sh`,
byte-exact fixpoint); and comment density that reads as a design record. The failure modes found
above are concentrated exactly where the prior review predicted: the not-yet-unified type
representation and the places lossy string bridges substitute for structure.

## 5. Method

Six subsystem audits ran in parallel (2026-07-01), each blind to the prior review; findings were
deduplicated, cross-checked between overlapping audits, and the P0/headline-P1 claims reproduced
against `scripts/vl-host/target/release/vl` with the current seed. Line numbers will drift;
grep the quoted identifiers. When an item here is completed, move it to `CHANGELOG.md` per the
roadmap's maintenance convention and strike it from this file.

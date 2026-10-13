# Architecture refactor plan

This plan brings the compiler and its tools in line with `docs/ARCHITECTURE.md`. That document
states the contracts; its §7 "Known deviations" table lists where the tree breaks them. The
fourteen LARGE items and the SMALL groups in `code-quality-2026-10.md` give each deviation its
measurement, its proposed shape and its first PR. This plan owns what neither of them says:
**the order, the dependencies, how a step is accepted, and where each item stands.** It does not
restate measurements; follow the links.

## When the program is done

- Every row of ARCHITECTURE.md §7 is gone, except rows that wait on an owner ruling and say so.
- Every item L1–L14 is closed, or retired with a reason recorded here.
- The ratchets that measure these deviations have reached their floors, and each is a gate:
  - render-parse (`render-parse-budget`);
  - `sentinel-index-unguarded`;
  - `kind-ladder-incomplete` and `kind-ladder-split`;
  - the emitter's never-cleared state (`emitter-state-audit.py`, to be ratcheted by L7).
- The repo's tooling follows the standing order: everything that can be written in VL is
  written in VL (Track T).

## Status, 2026-10-13

| item | state | where |
| --- | --- | --- |
| L1 per-call binding, banked once | **in progress as lane SC** | Design #3531 is merged, and the binding column landed in shadow (#3556). Step 0 (identity column) landed as #3542. Step 1 (#3607), the function-value flow table, runs in shadow (`fn_flow_shadow.vl`, off by default): graded against mono, it flags 60 of 69 silent review witnesses (the 9 others are D3923/D3972/D3973, outside its domain) and filed D4300–D4304. Step 2 (#3622; identity replaces name in write detection and the callback parameter test) closed D2114, D2479, D3910, D3911, D3924, D4011 and D4016. Step 3 is in progress: #3627 instances writes to a function-valued `let` or capture cell at each instance's type (closed D3941, D3953, D3954, D3957, D3958, D4013; filed D4305–D4308), and #3629 found a cell by identity but deleted nothing, since each retirement loses runs while the table is shadow-only. #3633 made the flow table decide for its first family: `fnFlowLamPin` pins a hole lambda that has a peer, and the peer pins (`monoPinLamFromPeer` and its helpers) are deleted. The other name lists stay name-keyed until a witness reaches them. Next: the remaining step 3 retirements listed in `fn-value-flow-design.md` §(f). |
| L2 rep from type | stage 1 **done**; stage 2 **partial** | The ratchet is `render-parse-budget` (#3536). #3562 moved the last `valueAtomKind` renders. B2's first family (a render compared to a primitive's name) moved to `tyEmitPrimOf` in `tyquery.vl`: 118 → 112 renders. The second (#3608) read `valueAtomKindOfTy` and `nulScalarListKindOfTy` off the type (`tyEmitElemPrimOf`, `tyEmitElemNulPrimOf`, `tyEmitNamesOf`): 112 → 111. `joinRowOfTy` (#3620) now decides every joined record off its type: 111 → 110. `mapTyValKindLowerable`, `fieldBoxSetConflict`, the discriminant's arm lookup and `armFieldDeferredRowOk` (#3631) followed: 110 → 106. `valueAtomKindOfTy` still renders a union of members that share a list or closure rep (D4320). Next: `armFieldUnionName`, `listUnionEmitName`, `memReadBoxNames` (each waits on union-registry-by-key step 5). |
| L3 legality in the checker | family 1 **done** | #3557 closed D4070 and D4071. |
| L4 one rollback for the quiet probes | A1 and A2 **done** | A1 (#3600) is the assertion and its measured list. A2 (#3605) adds `CheckMark` / `checkRollback` and records of columns, with each site's set unchanged and the census identical. The follow-up (#3609) widened each leaking site's set, one commit per site: over 15,288 programs no rc, diagnostic or emitted module moves, and the census leaves only `cstrProbeBefore`'s constraint rows, kept by design (D3062). `nestCstrSeen` now trusts a key only while its row stands; `tpIfOkAt` (a syntactic fact), `dJoinRelayed` (a per-type mark) and `tpIfJoinAt` (the last apart join seen at a node, as before A2) are kept across a rollback. |
| L5 one pin driver | C2 **done** | `compiler/check_pins.vl` (#3611) runs three phases — uncalled-export parameters (D3817), record width (#3516, folded in as a phase with its 8-round budget), literal bindings with record adoption — through one `pinRun` with a per-phase `pinBudget`. D3817 reads what `solveUnannotParams` observed in its walk instead of its own scoped AST walk. `vl check` text, emitted modules and the rollback census identical; the driver's re-check for generated walkers is unchanged. Next: D1 (callee-closed carves of `typecheck.vl`). |
| L7 `pending*` into `ExpCtx` | **in progress as C3** | `emitReturnValue`, `emitLetDeclStmt`, `emitAssign`, `emitDirectCall` (#3632) and `emitStructFieldValue` (#3634) each build their `ExpCtx` and restore the caller's on every exit: 25, 34, 35, 38 and 29 `pending*` writes to 0 (`wasmEmit.vl` 463 to 289 lines, `seedFieldListBuild` now seeds a ctx). Next: `emitVariantFieldValue` (28), then `emitArr` (27) and `emitCallRef` (16), then the memo module. The never-cleared count (211 of 1,151) is not ratcheted yet. |
| L8 tyquery.vl, split classify | first PR (A3) **done** | `compiler/tyquery.vl` holds the four exact type-step twins once; the checker does not import it yet. |
| L6 registries by key | step 5 **blocked** | Prerequisite (1) is met (`merge-diffvar` 0, D1492 closed by #3635). Still blocked on (2) 230 write-seam `differ` at `registerValueUnionNameAB` and (3) 2,226 `name-only` (tests/cases, 5,209 programs, 2026-10-13). |
| L9–L14 | not started | |
| SMALL S-c front-end tidy | **partial** | `typecheck.vl` imports `./ast` once (byte-identical seed). Not byte-identical, so not done: the second `Tok` (the lexer's has no `pos`), the operator-name table (a shared `isStrFuncName` shrinks the seed 299 bytes), `kindTag` (inlining grows it ~2.4 KB), `ErrExpr.errWhat`/`errAt` (a pos-only `ErrExpr` absorbs other pos-only literals at the `asObj` literal in `typecheck.vl` and fails to check). `await` skipped: a surface decision. |
| SMALL S-a, S-b, S-d … S-n | not started | |
| RepDesc rulings | **open** since 2026-09-06 | `open-rulings.md`: `one-literal-union-rep`, `nullable-rep-rule-stated-once` |

Update this table in the PR that moves an item.

## Rules every step follows

1. **One PR is one step.** A refactor step proves it changed nothing:
   - a byte-identical seed (`cmp` after `refresh-compiler.sh`);
   - or, where code moves, IDENTITY (compile(candidate, master source) == master fixpoint,
     which `cb-audit` checks) plus identical `vl check` text and emitted modules over
     `tests/cases` and the distilled corpus.
2. **A step that changes behaviour** must show:
   - no `runs → not-runs` in `regress.py`, and no new silent cell;
   - for a capability, a `matrix.py` position matrix in both faces, with a template that leaves
     a type parameter open.
3. **Cost is a gate, not a note.** A slower compiler is rejected however clean the code. Each
   step is checked against:
   - L2 self-compile fuel (`self-compile-time.sh`);
   - `plumb-shape-cost.py` fuel;
   - `vl_scaling_shape_test.ts`;
   - seed size.
4. **Shadow before switch.** Where a new producer replaces an old one (L1, L2 stage 3, L6), a
   shadow harness that is off by default runs first and prints every disagreement. A
   disagreement becomes an inventory row, not a merged behaviour change. The disagreement list
   is the step's deliverable.
5. **A step removes or narrows its §7 line in the same PR**, and updates the status table above.
6. **One writer per giant file at a time.** `typecheck.vl`, `emit_classify.vl`, `wasmEmit.vl`
   and `emit_mono.vl` each have one owning lane per wave (see Concurrency).
7. **Fresh builder per PR**, with a handoff note, and up to six concurrent agents (CLAUDE.md).
   Merges go through `cb-audit`.

## Dependency graph

```
L4 assert ──► L4 CheckMark ──┬──► L5 pinDriver ──┐
                             └────────────────────┴──► L9 typecheck carves
S-c (one ast import) ─────────────────────────────────► L9

L8 tyquery.vl ──► L2 stage 2 twins ──┐
                                     ├──► L2 stage 3 rep column ──► RepDesc resume
L1 (SC steps 0→4) ───────────────────┤        ▲
                                     │        └── rulings: literal-union rep, nullable rep
L6 registries by id ─────────────────┘   (removes L1's spelling hop)

L1 SC step 4 ──► L3 family 3 (mono fn-value rules into the checker)
L7 ExpCtx deliveries ──► per-instance compilation (vl test isolation ruling)

T1 host process ABI (done) ──► T3 instrument ports ──► Python retired
L11 budgets inside `vl lint` (needs no spawn) ─► T3 drops the ratchet scripts
owner: optimizer location ──► L10
```

## Waves

A wave is a set of steps whose prerequisites have all landed. Steps inside a wave run in any
order, subject to the one-writer rule.

### Wave A: enablers (no behaviour change)

| step | item | file owner | proof |
| --- | --- | --- | --- |
| A1 | L4 first PR: the table-length assertion after each of the seven quiet probes, behind a flag. This turns the UNDECIDED omissions into a measured list. | `typecheck.vl` | the fixpoint reproduces master's seed from master's source, and `vl check` text and emitted modules are identical over `tests/cases` and the corpus with the flag off |
| A2 | L4: one `CheckMark` / `checkRollback`; each constraint family becomes a record of columns with one `truncate` | `typecheck.vl` | `vl check` and module identity; fuel A/B |
| A3 | L8 first PR: `tyquery.vl` with the four exact type-step twins retired | `emit_classify.vl`, `emit_rep.vl` | byte-identical seed |
| A4 | L14 first step: a per-entry type-index assertion | `emit_collect.vl`, `emit_sections.vl` | seed, fixpoint, rep-fuzz |
| A5 | L13: the errno agreement test, then the import table | host `main.rs`, `std/fs.vl` | new test; host suites |
| A6 | SMALL groups, one PR each: S-c first (a precondition for L9), then S-a, S-b, S-h, S-d, S-e | per group | byte-identical seed |
| A7 | L12 first PR: one LSP feature moved into `lsp/src/features.ts` | `lsp/` | lsp suites |

### Wave B: one producer per fact

| step | item | owner | prerequisite |
| --- | --- | --- | --- |
| B1 | L1, executed as SC's migration (`fn-value-flow-design.md` §(f), steps 0–4). SC's checker-side store (§(h)) **is** L1's banked binding; there is no second bank. Mono's instance key becomes the type-id tuple, and a per-instance node-type column retires `monoArgTyName`. | lane SC (`emit_mono.vl`, the SC parts of `typecheck.vl`) | #3542 (step 0) |
| B2 | L2 stage 2: the type-taking twins land in `tyquery.vl` | `emit_classify.vl` | A3 |
| B3 | L6: the next registry follows the registry-by-key recipe (#2426, #2438, #2473); then equality collapses to three named notions | `emit_rep.vl`, `emit_collect.vl` | none |

### Wave C: each decision at the phase that owns it

| step | item | owner | prerequisite |
| --- | --- | --- | --- |
| C1 | L3, in order: (a) object-literal shape against a union variant; (b) probe `checkParams`' valtype ladder with a check-clean witness; (c) reword the built-in arity floors as internal invariants; (d) the mono function-value rules | checker; `emit_sections.vl` | (d) needs B1 step 4 |
| C2 | L5: one `pinDriver` in `check_pins.vl`; D3817 becomes a policy over `solveUnannotParams` | `typecheck.vl` | A2. Fold #3516's width-subtype rewrite in as a solver if it is still open. |
| C3 | L7: one delivery function per PR, `emitReturnValue` first; then the memo module; then ratchet the never-cleared count | `wasmEmit.vl` | none |

### Wave D: structure

| step | item | owner | prerequisite |
| --- | --- | --- | --- |
| D1 | L9: callee-closed carves of `typecheck.vl`. `check_pins.vl` (from C2) is the first; leaves follow. | `typecheck.vl` | A2, A6 (S-c), C2 |
| D2 | L8: split `emit_classify.vl` by banner region; split the 400-line functions at low-liveness seams | `emit_classify.vl` | a priced self-compile A/B before the first split |
| D3 | L2 stage 3: a per-node checked-rep column read by the `expr*` classifiers; then the RepDesc campaign resumes family by family under its LEFT-ONLY / RIGHT-ONLY oracle | `emit_classify.vl`, `emit_rep.vl` | B1 (per-instance types), B2, and the two rulings for the literal-union and nullable families. Other families can go first. |
| D4 | L14: the type section iterates the recorded allocation order | `emit_sections.vl` | A4 |

### Track T: tools and hosts, VL first

| step | item | prerequisite |
| --- | --- | --- |
| T1 | **Done.** The host process ABI: `std:process` (`runProgram`, `exit`) and `std:env` (`getEnv`) shipped with their host imports; see ROADMAP's "Host ABI for VL scripts". | — |
| T2 | L11 the VL way: the per-file budgets move into `vl lint` itself (a baseline-reading budget mode), so the ratchets need neither Python nor spawn. The twin Python censuses retire as each rule's budget moves. **Started:** `vl check --budget` holds and writes the interp ratchet (`--budget-why`, `--write-baseline`, `--exempt-codes`; `compiler/cli_budget.vl`; #3617, #3624) and `interp-budget.py` is retired; the other five ratchets are still Python. | none |
| T3 | **In progress.** `check-filed-witnesses.vl` and `distilled/regress.vl` (with `gradecensus.py`'s grading) are ported and run their gate rows; the Pythons stay, because `scripts/inventory/rows.py` imports the first and other census tools import `cellmap`, `index` and `gradecensus`. `plumb-shape-cost.vl` (#3610) is the third: it runs the `plumb-shape cost` row in `gate.sh` and ci-native, and `tests/vl_plumb_shape_port_test.ts` replays one recorded set of readings through the Python and diffs report, exit code and baseline file. Its CPU is serial by design, so it has no fan-out; it reads rusage through GNU `time`, sets a child's directory and environment through `env -C`, and hashes through `sha256sum`, three host gaps with no `dogfood:` row yet. Its control workload is `scripts/perf/plumb-shape-control.vl`, which times differently from the Python's, so the baseline's CPU fields need one `--write-baseline` with the VL tool on a quiet box before CPU is graded again; fuel and RSS are unaffected. Its Python stays as the test's reference. `survey-regrade.vl` runs the `survey measurements` row (#3615). `capability-probes.vl` (#3613) runs its gate rows; `matrix.py`, `goal-scoreboard.py` and the day-one sampler still import `capability-probes/run.py`, so that Python stays. Remaining Python in gate rows includes the ratchets and `profile-rank.py`. Port instruments in gate order, each kept beside its Python version until the outputs are byte-identical, then the Python deleted: `check-filed-witnesses.py`, `regress.py` + `gradecensus.py`, `plumb-shape-cost.py`, `capability-probes/run.py`, the survey scripts. Each gap found is filed as a `dogfood:` row. | T1 |
| T4 | L10: the `-O` optimizer | owner decision 3 below |
| T5 | L12: the remaining LSP features | A7 |

## Concurrency

Up to six agents run at once (CLAUDE.md); the owner lifted the CPU cap on 2026-10-12. Rule 6
still holds: one writer per giant file.

- **Lane 1: SC.** B1, then C1(d). It owns `emit_mono.vl` and its parts of `typecheck.vl`
  throughout.
- **The other lanes** each take one step at a time from the earliest wave with an open step,
  choosing a step whose file has no current writer. The intended order per file is:
  - A1 → A2 → C2 → D1 (one continuous claim on `typecheck.vl`, interleaved with SC by area);
  - A3 → B2 → D2 → D3 (`emit_classify.vl`);
  - C3 (`wasmEmit.vl`);
  - A4, A5, A6, A7, B3 and T2, which go to whichever file is free.
- T3 ports need no new std surface, since T1 shipped. A port that does need some goes through std-api review first.

## Owner decisions this plan needs

Each is posted for question time; work that does not depend on it continues.

1. **`one-literal-union-rep`**: should a literal union's type carry its rep? This blocks D3 for
   literal unions only.
2. **`nullable-rep-rule-stated-once`**: one niche-vs-box rule instead of eleven arms? This blocks
   D3 for the nullable family only.
3. **Where the `-O` optimizer lives (L10).** Recommendation: in VL, as a pass over the emitted
   module in the compiler. That is what the standing order asks. It also gives the Deno and
   playground hosts `-O`, which they cannot run today, and it removes about 6.5k lines of Rust
   that the host's own manifest says it does not have. If decided this way, skip L10's Rust-only
   first PR (`wasm_bytes`).
4. **September row 19**: a development build resolves the seed from the working directory but
   std from the executable's tree (`SeedOrigin::Cwd`). Recommendation: resolve both from the
   executable's tree.
5. **SC ruling (g)**: the multi-pin case (a binding called at two or more signatures), after the
   table lands. This decides B1's instance record for closures, not whether B1 happens.

## Ready to brief

These have no unmet prerequisite and touch disjoint files:

- **A1**: L4 assertion harness (`typecheck.vl`). Done (#3600).
- **A2**: L4 `CheckMark` / `checkRollback` (`typecheck.vl`), on A1. Done (#3605), with the leak fixes in #3609.
- **A5**: errno agreement test (host + `std/fs.vl`).
- **A6 / S-c**: one `./ast` import block in `typecheck.vl`. This conflicts with A1, so run it
  first; it is small.
- **C3 first PR**: `emitReturnValue` through `ExpCtx` (`wasmEmit.vl`).
- **B1**: continues in lane SC; steps 1 and 2 are done (#3607, #3622), step 3 next.
- **T3, first port — done**: `check-filed-witnesses.vl` prints the Python's report byte for byte on both inventories and now runs the `filed witnesses` gate row; the Python stays beside it (`scripts/inventory/rows.py` imports its row grammar). It found D4290 (a compiler trap) and one new `dogfood:` row (`runProgram` waits). Next: `regress.py` + `gradecensus.py`.

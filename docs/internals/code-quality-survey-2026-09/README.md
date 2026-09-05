# Code-quality survey, September 2026 — the consolidated ranking

Three read-only surveys, one per area, each finding backed by a line number and a number:
[front end and checker](front-end-and-checker.md), [the emitter](emitter.md),
[tooling, std and the host](tooling-std-host.md). Surveyed at `facb9f61`–`e05d2113`.
This page ranks across the three by value against size and risk, and names the proof each
change owes. Four findings were re-verified by hand before ranking (the checker's
named-argument resolver, the dead token fields, the gate table's time column, the
diagnostic column base); the rest stand on the surveys' own measurements.

## Tranche 1 — instruments and dead code (hours each, no behaviour change)

| # | finding | where | value | proof |
| --- | --- | --- | --- | --- |
| 1 | `gate.sh`'s TIME column is elapsed-to-report, not per gate; 19 of 21 rows read the same number | tooling §1 | every later scheduling decision reads this table | rows stop being identical — **landed #2564** |
| 2 | `emitter-state-audit.py` names `startFnDetectScratch`; D1595 moved the resets to `startFnDetectFrames` — 19 reported leaks, 2 real | emitter #9 | restores a live instrument | the script's own output — **landed #2564** |
| 3 | `vl run`/`build` print a 0-based diagnostic column, `check` 1-based; a test pins the disagreement | tooling #4 | one contract | `vl_invalid_module_position_test.ts` — **landed #2564** |
| 4 | `Tok.value`/`Tok.stop` are written per token and read nowhere; `scanQuoted` decodes a string it discards | front end #3 | 775,815 dead writes per parse; one of two escape decoders retired | `regress.py`, `--prove-fixpoint`, fixture byte identity — **landed #2566** |
| 5 | 14 emitter exports and 5 front-end exports have no reference anywhere; `unused-function` exempts exports | emitter #8, front end #9 | dead code plus a fourth ratchet that keeps it dead | byte-identical seed — **landed #2581** |
| 6 | named arguments through a closure-typed parameter resolve the flat top-level declaration | front end #4 | a live clause-2 defect (filed D1604) | its own row — **landed #2563** (D1604) |

## Tranche 2 — perf with a byte-identical proof (half a day to two days each)

| # | finding | where | value | proof |
| --- | --- | --- | --- | --- |
| 7 | `letListBuildKind` and `letListBuildSlot` run one scoped destination walk twice, back to back, at all three sites | emitter #1 | ~16% of a self-compile | byte-identical seed, corpus `cmp` — **partly landed #2567**; remaining: epoch-stamped memo (step 2) |
| 8 | `nodeChildren` allocates and walks 25 tag compares per node; 45.5% of nodes reach no arm | front end #1 | 11.75% of self time; DONE 2026-09-04 at self **8.16% → 3.51%** — the ALLOCATION was the cost, not the ladder, and `dsScopeWalk`'s reach is 32 distinct-key walks, not an unmemoised repeat (front end §5.1) | fixture byte identity, profile A/B — **partly landed #2570**; remaining: O(1) index (campaign) |
| 9 | `fnDetectScratch` runs 12 whole-body walks per function; `dupScanRun` repeats the set per shadowed name | emitter #2 | 21% inclusive | byte-identical seed, `regress.py` — **partly landed #2580**; remaining: ~2.5% memo, eqCoreKindOfBin |
| 10 | `nestedFnDeclaredInFrame` is the un-indexed twin of `nestedFnDeclaredIn`, which already has the child index | emitter #5 | O(children) per rung; one arena-scan ratchet entry retires | byte-identical seed — **landed #2583** |
| 11 | definite assignment keeps a name-keyed `string[]` rebuilt per write, with every module binding in it | front end #2 | the call-site `O(n^1.5)` the perf survey never attributed | the scaling-shape ladder — **landed #2584** |
| 12 | sixteen functions re-run the same seven-classifier ladder in the same order | emitter #4 | ~23% inclusive summed | byte-identical seed, corpus `cmp` — **partly landed #2583**; remaining: 14 sites refuted, not merged |
| 13 | `lint()` walks the arena seven times and re-splits the source four ways, on every keystroke | tooling #5 | editor latency; DONE 2026-09-05 — one walk is **−5.2% to −6.7%** of a whole `vl check`, the shared line index a further −0.9% to −2.7% at the noise floor, and the walk's own tie-break is now an explicit rank (tooling §5.1) | byte-identical `lint-self.sh`, plus 18,236 diagnostics identical in order over 3,219 files — **landed #2588, #2595, #2601** |

## Tranche 3 — structure (days; each a campaign with its own gate)

| # | finding | where | value | proof |
| --- | --- | --- | --- | --- |
| 14 | the cell-seed ladder is written four times; `ExpCtx` is the intended shape and is private to one file | emitter #3 | 311 `pending*` write sites converge on one resolver; DONE 2026-09-05 — all four ladders call `expCtxForCell`, the const cell's per-cell reset is an `ExpCtx` snapshot restore, and `ExpCtx` carries all seventeen seeds (emitter §6.1.1) | byte-identical seed, `regress.py` — **landed #2589, #2596** |
| 15 | `checkFuncDeclNode` (1,288 lines) and `checkCallNode` (996) split at seams with ≤ 12 and 2 live locals | front end #6, #7 | the two largest functions halve; 31 untested diagnostics get a named home | byte-identical seed — **landed #2591** |
| 16 | `tyToEmitNameGo` / `tyToNominalNameGo` are 83% identical and must agree character for character | front end #5 | one drift surface; DONE 2026-09-05 as `tyToNameGo(ix, ctx, nominal)`, one atom bank, and `nameKidCtx` for the one divergence the survey did not name (§2.1) | byte-identical seed — **landed #2585** |
| 17 | five ratchet scripts share 41 verbatim lines; `const ROOT` in 59 test files, 35 of 54 spawners pin no `VL_STD` | tooling #6, #7 | one core; a bare `deno test` from a worktree grades the right std | the gate — **landed #2582, #2587** |
| 18 | `moduleSurface` omits re-exports; 86 of 86 consumer files pay a second import | tooling #3 | three LSP features at once | `lsp_auto_import_test.ts` — **landed #2579** |
| 19 | the seed anchors on the CWD, std on the EXE's tree; one `vl --version` names two checkouts | tooling #2 | the trap documented twice and filed by the consumer three times | an owner ruling, then `vl_std_cmd_test.ts` — **ruling pending (owner)** |
| 20 | 100 single-call delegation wrappers exist because VL has no default parameter values | emitter §6.5 | a language question, not a refactor | an owner ruling — **ruling pending (owner)** |

## What each survey would do first

Front end: 6, 4, 8. Emitter: 7, 2, 10. Tooling: 1, 18, 3. The tranche-1 rows are scheduled;
tranche 2 starts with 7 and 8, which have byte-identical proofs and the largest measured share.
Rows 19 and 20 are rulings, not work.

## Status at 2026-09-05

| row | status | PR(s) |
| --- | --- | --- |
| 1 | landed | #2564 |
| 2 | landed | #2564 |
| 3 | landed | #2564 |
| 4 | landed | #2566 |
| 5 | landed | #2581 |
| 6 | landed | #2563 |
| 7 | partly landed | #2567 |
| 8 | partly landed | #2570 |
| 9 | partly landed | #2580 |
| 10 | landed | #2583 |
| 11 | landed | #2584 |
| 12 | partly landed | #2583 |
| 13 | landed | #2588, #2595, #2601 |
| 14 | landed | #2589, #2596 |
| 15 | landed | #2591 |
| 16 | landed | #2585 |
| 17 | landed | #2582, #2587 |
| 18 | landed | #2579 |
| 19 | ruling pending | (owner) |
| 20 | ruling pending | (owner) |

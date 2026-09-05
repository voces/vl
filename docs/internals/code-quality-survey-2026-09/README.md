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
| 1 | `gate.sh`'s TIME column is elapsed-to-report, not per gate; 19 of 21 rows read the same number | tooling §1 | every later scheduling decision reads this table | rows stop being identical |
| 2 | `emitter-state-audit.py` names `startFnDetectScratch`; D1595 moved the resets to `startFnDetectFrames` — 19 reported leaks, 2 real | emitter #9 | restores a live instrument | the script's own output |
| 3 | `vl run`/`build` print a 0-based diagnostic column, `check` 1-based; a test pins the disagreement | tooling #4 | one contract | `vl_invalid_module_position_test.ts` |
| 4 | `Tok.value`/`Tok.stop` are written per token and read nowhere; `scanQuoted` decodes a string it discards | front end #3 | 775,815 dead writes per parse; one of two escape decoders retired | `regress.py`, `--prove-fixpoint`, fixture byte identity |
| 5 | 14 emitter exports and 5 front-end exports have no reference anywhere; `unused-function` exempts exports | emitter #8, front end #9 | dead code plus a fourth ratchet that keeps it dead | byte-identical seed |
| 6 | named arguments through a closure-typed parameter resolve the flat top-level declaration | front end #4 | a live clause-2 defect (filed D1604) | its own row |

## Tranche 2 — perf with a byte-identical proof (half a day to two days each)

| # | finding | where | value | proof |
| --- | --- | --- | --- | --- |
| 7 | `letListBuildKind` and `letListBuildSlot` run one scoped destination walk twice, back to back, at all three sites | emitter #1 | ~16% of a self-compile | byte-identical seed, corpus `cmp` |
| 8 | `nodeChildren` allocates and walks 25 tag compares per node; 45.5% of nodes reach no arm | front end #1 | 11.75% of self time; 94.6% of the reach is one unmemoised caller, `dsScopeWalk` | fixture byte identity, profile A/B |
| 9 | `fnDetectScratch` runs 12 whole-body walks per function; `dupScanRun` repeats the set per shadowed name | emitter #2 | 21% inclusive | byte-identical seed, `regress.py` |
| 10 | `nestedFnDeclaredInFrame` is the un-indexed twin of `nestedFnDeclaredIn`, which already has the child index | emitter #5 | O(children) per rung; one arena-scan ratchet entry retires | byte-identical seed |
| 11 | definite assignment keeps a name-keyed `string[]` rebuilt per write, with every module binding in it | front end #2 | the call-site `O(n^1.5)` the perf survey never attributed | the scaling-shape ladder |
| 12 | sixteen functions re-run the same seven-classifier ladder in the same order | emitter #4 | ~23% inclusive summed | byte-identical seed, corpus `cmp` |
| 13 | `lint()` walks the arena seven times and re-splits the source four ways, on every keystroke | tooling #5 | editor latency | byte-identical `lint-self.sh` |

## Tranche 3 — structure (days; each a campaign with its own gate)

| # | finding | where | value | proof |
| --- | --- | --- | --- | --- |
| 14 | the cell-seed ladder is written four times; `ExpCtx` is the intended shape and is private to one file | emitter #3 | 311 `pending*` write sites converge on one resolver | byte-identical seed, `regress.py` |
| 15 | `checkFuncDeclNode` (1,288 lines) and `checkCallNode` (996) split at seams with ≤ 12 and 2 live locals | front end #6, #7 | the two largest functions halve; 31 untested diagnostics get a named home | byte-identical seed |
| 16 | `tyToEmitNameGo` / `tyToNominalNameGo` are 83% identical and must agree character for character | front end #5 | one drift surface | byte-identical seed |
| 17 | five ratchet scripts share 41 verbatim lines; `const ROOT` in 59 test files, 35 of 54 spawners pin no `VL_STD` | tooling #6, #7 | one core; a bare `deno test` from a worktree grades the right std | the gate |
| 18 | `moduleSurface` omits re-exports; 86 of 86 consumer files pay a second import | tooling #3 | three LSP features at once | `lsp_auto_import_test.ts` |
| 19 | the seed anchors on the CWD, std on the EXE's tree; one `vl --version` names two checkouts | tooling #2 | the trap documented twice and filed by the consumer three times | an owner ruling, then `vl_std_cmd_test.ts` |
| 20 | 100 single-call delegation wrappers exist because VL has no default parameter values | emitter §6.5 | a language question, not a refactor | an owner ruling |

## What each survey would do first

Front end: 6, 4, 8. Emitter: 7, 2, 10. Tooling: 1, 18, 3. The tranche-1 rows are scheduled;
tranche 2 starts with 7 and 8, which have byte-identical proofs and the largest measured share.
Rows 19 and 20 are rulings, not work.

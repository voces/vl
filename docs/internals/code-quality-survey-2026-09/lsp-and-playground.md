# Code-quality survey — `lsp/` and `playground/`, September 2026

A read-only survey of the editor layer — the VS Code language server (`lsp/src/`) and the
browser playground (`playground/src/`) — in the shape of the compiler survey beside it
(`README.md`). Surveyed at `aadacc574`. Every finding carries a line number, a measured or
measurable cost, and a **proof path** a future PR can land safely behind. The top five were
re-verified by hand (a `diff` or a `grep` for zero references) before ranking; the rest stand
on the same method.

**Scope note — category 2 (un-indexed twins of an indexed walk) has NO finding here, and that
is structural, not an oversight.** The lsp/playground TS is a thin adapter over the seed's
wasm queries; the arena walks that category names live in `compiler/*.vl` and were surveyed in
`front-end-and-checker.md`/`emitter.md`. What this layer has instead is (1) two hosts that must
agree character-for-character, (3) walks repeated per keystroke or per request, (4) dead
exports nothing flags, and (5) one behaviour re-implemented across the three hosts. The rows
are grouped by those.

## Tranche 1 — dead code nothing flags (hours each, no behaviour change)

TS has no `unused-function` ratchet — a dead export in `lsp/src` or `playground/src` is caught
by nothing (`deno check` and the esbuild bundle both keep unreferenced exports). These are the
cheapest wins and the ones most likely to grow.

| # | finding | where | cost | proof |
| --- | --- | --- | --- | --- |
| 1 | **6 `WASM_LEX_*` constants are exported and referenced by NO code** — only a comment in `typeFeatures.ts:192` names them; the lexical classes are encoded by literal elsewhere. **Hand-verified: 0 code references repo-wide.** | `wasmChecker.ts:178-183` | 6 dead exports; a fourth ratchet target if a TS `unused-export` check is ever built | delete them; `deno check --config lsp/deno.json lsp/src/*.ts` + `deno task build` (lsp) stay green |
| 2 | ~~`clearLastSession` is exported and never imported~~ **RETRACTED — it is LIVE.** The pre-landing tree-wide grep (`grep -rn clearLastSession`, not scoped to `src/`+`tests/` as this survey's first pass was) found `playground/verify.ts:530,571` call it. `verify.ts` is the end-to-end bundled-path verifier, outside the `src/` tree the first grep walked. The lesson: a dead-export claim must grep the WHOLE tree, `verify.ts` and scripts included, not just `src/` and `tests/`. | `playground/src/projects.ts:71` | none — not dead | n/a |
| 3 | **`runtime.ts`'s host-import object carries THREE dead sinks** — `__log__`, `__log_string__`, and an `imports.memory` — that `runWasm.ts` already MEASURED out: its own comment records "0 of 1,149 building modules import a memory, 0 import `__log__` or `__log_string__`." The browser copy never got that trim. | `playground/src/runtime.ts:15` (`runWasmBytes`) | ~15 dead lines that also shape finding 6's shared factory | delete the three sinks; `playground_lsp_wasm_test.ts` (run path) + `playground_trap_frames_test.ts` identical |
| 4 | **`SUB_GAPS` is now an empty array** — its three rows were promoted to `subBehaviours` (row 32). The type + two tests remain as the documented standing home for the next label-hidden gap. Keep OR delete is a judgment call; flagged so it is a decision, not drift. | `playground_lsp_parity_test.ts` (§4) | 0 today; a live instrument the day the next gap appears | n/a — documentation decision, not a code change |

## Tranche 2 — two hosts that must agree character-for-character (hours each, test-identity proof)

`server.ts` (VS Code LSP) and `lspAdapter.ts` (playground) both consume the pure helpers in
`typeFeatures.ts`, but each also carries private copies of small text and scan helpers. These
are the `tyToEmitNameGo`/`tyToNominalNameGo` shape the compiler survey named (row 16), on the
editor side: a drift surface where a fix to one host silently skips the other.

| # | finding | where | cost | proof |
| --- | --- | --- | --- | --- |
| 5 | **`wordEndingBefore` and `removeCharAt` are BYTE-IDENTICAL in both hosts.** **Hand-verified: `diff` reports the 9-line and 8-line bodies match line-for-line.** The adapter's own comments say "Mirrors `server.ts`'s …" — a mirror maintained by hand. | `server.ts:1290,1304` = `lspAdapter.ts:606,+` | 17 duplicated lines; two `.`-completion receiver parsers that must never disagree | move both to a shared `lsp/src/completionText.ts` (pure, Monaco-free, both already import from `typeFeatures.ts`); `lsp_member_completion_wasm_test.ts` + `playground_completion_test.ts` identical |
| 6 | **`stdExportsForCompletion` (server) and `stdExportsForPlayground` (adapter) are ~90% identical** — `moduleSurface` + one `scopeAt` + map the export list, per std module, cached by source. **Hand-verified: `diff` after normalising the checker/reader variable names shows the ONLY logic divergence is the source read** — the server tries `workspaceReader(key)` first (dogfooding a workspace `std/`), the browser reads `STD_SOURCES[key]` only. | `server.ts:1200` (33L) / `lspAdapter.ts:494` (30L) | ~30 duplicated lines carrying the auto-import surface; the newer copy (mine) already drifted in comment wording | a shared `stdExportSurfaces(checker, keys, readSrc)` taking the source read as a parameter; `lsp_auto_import_test.ts` + `playground_import_actions_test.ts` identical |
| 7 | **The `std:`-key predicate and reader wrap are re-implemented in ~9 places** — `key.startsWith("std:")` appears in `moduleGraph.ts` (×2), `rename.ts`, `typeFeatures.ts` (×2), `server.ts`, `wasmCheckerBrowser.ts`, and TWO test setups (`playground_import_actions_test.ts:41`, `casesWasmOracle.ts:284`). The browser `wrapReader` and the test copy are byte-identical. | 9 sites across `lsp/`, `playground/`, `tests/` | the "is this a std module" rule has nine authors | one `isStdKey(key)` + `wrapStdReader(read, sources)` in a shared module; `lint-self.sh` + the wasm suites |

## Tranche 3 — one behaviour re-implemented across the three hosts (half-day, test-identity)

The native (Rust), Deno-test (`runWasm.ts`) and browser (`runtime.ts`) hosts each provide the
VL host-import ABI to run emitted wasm. `vlSrcSection.ts` was unified across the JS two in row
22; the import object itself was not.

| # | finding | where | cost | proof |
| --- | --- | --- | --- | --- |
| 8 | **The JS host-import registry is duplicated** — the seven `__print_*__`/`__print_char__`/`__print_str_flush__` sinks plus `extern.nowMillis` appear in both `runtime.ts` (browser) and `runWasm.ts` (Deno test host), each ~10-13 lines, semantically identical (`__print_i32__: (v) => logs.push(String(v))`, …). The Rust host is the third copy, necessarily separate. | `runtime.ts:15` / `runWasm.ts` | ~13 duplicated lines that carry the print/log contract; drift here mis-renders output in one host only. Compounds finding 3 (the browser copy carries the dead sinks the Deno copy dropped) | a shared `vlHostImports(logs): WebAssembly.Imports` factory (the `vlSrcSection.ts` pattern), both JS hosts import it; `runWasm`-backed suites + `playground_lsp_wasm_test.ts` (run path) identical |

## Tranche 4 — walks repeated per keystroke or per request (measure, then cache)

The editor-latency category the compiler survey's row 13 named (`lint()` walked the arena
seven times per keystroke). The playground adapter has the same shape at the request boundary.

| # | finding | where | cost | proof |
| --- | --- | --- | --- | --- |
| 9 | **The playground re-checks the whole program on every code-action request — TWICE.** `codeActions` calls `await diagnostics(text)` (a full `check` + `lint` walk); `main.ts:426` then calls `organizeImports`, which calls `diagnostics(text)` AGAIN — two whole-program walks per lightbulb. The **server does not**: it caches diagnostics in `diagnosticsByUri` on `onDidChangeContent` (`server.ts:231,421`) and the code-action handler reads the cache. | `lspAdapter.ts:401,437`; `main.ts:383,426` | 2× whole-program `check`+`lint` per code-action request, redundant with the diagnostics the editor already holds | thread the editor's cached diagnostics into `codeActions`/`organizeImports` (the server's own shape); `playground_import_actions_test.ts` identical, request count measured before/after with a checker call-counter |
| 10 | **`semanticTokens` runs three seed queries per keystroke** — `tokensAt` + `memberTokensAt` + `lexicalTokensAt` (`lspAdapter.ts:145` area). These are three token LAYERS, so the outputs are not redundant; the open question is whether each re-lexes the same buffer or shares a prepared state in the seed. **Measure before ranking as work** — if the seed re-lexes three times per keystroke this is real editor latency, if it shares a prepare it is fine. | `lspAdapter.ts` `semanticTokens` | 3 seed calls per keystroke; unknown re-lex cost | add a lex counter to the seed's prepare, count per `semanticTokens` call on a 200-line buffer; a combined query if it re-lexes |

## What to do first

**Tranche 1 (rows 1 and 3 — row 2 retracted) is an afternoon and reds nothing** — delete the
dead constants and the dead sinks, and the layer stops carrying code no test protects. **Then
row 5** (the
byte-identical text helpers) and **row 8** (the host-import factory), both pure extractions
with an exact test-identity proof and no behaviour change. Row 6 (the std-export twin) and row
7 (the `std:` predicate) are the same shape one size up. Row 9 (the double re-check) is the
only one that changes a hot path, so it wants the call-counter measurement first; row 10 is a
measurement before it is work.

**One meta-finding:** every tranche-2/3 row is a case of the playground adapter mirroring
`server.ts` by hand because the shared home (`typeFeatures.ts`) took the pure LOGIC but not the
small text/host helpers around it. The durable fix is a second shared module — call it
`lsp/src/editorText.ts` — that both hosts import, so the mirror is the compiler's job and not a
reviewer's. Rows 5, 6, 7 and 8 all land there.

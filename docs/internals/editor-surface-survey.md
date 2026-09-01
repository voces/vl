# Editor surface survey — what an LSP / VS Code extension can expose, and where VL stands

*2026-08-31. Ground truth: `lsp/src/server.ts` (handlers + `onInitialize` capabilities),
`lsp/src/extension.ts`, `lsp/package.json`, `lsp/src/wasmChecker.ts` (the `WasmChecker`
surface every feasibility note below is graded against), `std/test.vl`, `compiler/cli.vl`
(the `vl test` brain), `scripts/vl-host/src/main.rs` (the runner mechanism). The prompt for
this file was two asks: run-individual-tests-by-clicking-the-test-name, and generally
richer self-discovery.*

Statuses: **have** (shipped, works today) · **partial** (a real slice ships, a named
remainder doesn't) · **missing** (could ship, hasn't) · **n/a** (makes no sense for VL).

---

## 1. What ships today

The server is **wasm-only** (kill-TS complete): every feature is driven by the self-hosted
compiler seed through `WasmChecker`; no checker loaded → empty results plus one loud
warning. Implemented, with current depth:

| Feature | Depth today |
|---|---|
| Diagnostics (push) | Error tier (`check`, module-aware — imports resolved against open buffers + disk + std) merged with the Stage-3 lint tier (`lint`, single-file), per keystroke; plus a debounced project-wide **unused-export** hint pass (save / 3 s idle, ≤500 files). ABI-mismatched seed reports itself as a diagnostic rather than staying silent. |
| Hover | Four rungs: binding type (`hoverTypeAt`, incl. imported names) → member access (`memberTypeAt`) → user `type` alias (`typeAliasAt`) → builtin. Rendered as a fenced `vital` block. **No `///` doc prose** (needs a native export — server comment says so explicitly). Verbosity stepper (D8) blocked on LSP 3.18. |
| Completion | In-scope bindings (`scopeAt`) + builtins + keywords + 10 snippets + member completion after `.` (`memberCompletionsAt`, with a trailing-dot repair trick) + **std auto-import** items that rewrite the `import` statement via the seed's own formatter. Trigger char `.`. No `completionItem/resolve` — items are fully materialized eagerly. |
| Go-to-definition | Local (`definitionAt`) + cross-file to the exporting sibling (`importedNameSources`), incl. jumps **into std** via the read-only `vl-std:` scheme. |
| Find references | Single-file (`referencesAt`) with cross-module fallback: per-candidate compiles over open buffers + a capped disk crawl (`referencesInEntry` × `crossFileReferences`). |
| Formatting (document) | Whole-document via the seed's `formatSrc`, one full-range edit. No range / on-type (formatter is whole-doc by design). |
| Code actions | Quick fixes for exactly four lint codes: `unused-variable` (remove / `_`-prefix), `unused-function` (`_`-prefix), `unused-import` (remove specifier or line), `prefer-const` (`let`→`const`). Plus a line-overlap cache so fixes appear when the cursor is off the exact range. |
| Inlay hints | Inferred types on unannotated `let`/`const` and function returns (`inlayHintsAt`), range-filtered. |
| Semantic tokens | Full-document only: identifiers by binding kind (`tokensAt`) + member property/method (`memberTokensAt`) + lexical keywords/operators/literals/comments (`lexicalTokensAt`). No delta, no range — fine at measured latencies. |
| Run (VS Code command) | `vital.runFile` (Ctrl+F5, editor title/context menu): `vl run` in a reused integrated terminal, dirty-buffer temp mirroring, binary probe with actionable error. |
| Static contributions | TextMate grammar; language-configuration with comments/brackets/auto-closing/surrounding pairs (**no** indentation or on-enter rules); `vl-std:` content provider + resource label formatter; two settings (`vital.compilerWasm`, `vital.compilerPath`); one client per outermost workspace folder. |

Two defects found while surveying, worth fixing regardless of any new feature:

1. **`vital.compilerPath` never reaches the server.** `extension.ts` sends only
   `compilerWasm` in `initializationOptions`, but `server.ts` reads
   `opts.compilerPath || "vl"` for the `` `vl seed` `` rung of the seed ladder — so the
   setting steers the Run command while the seed-ladder rung silently always uses `vl`
   from `PATH`.
2. **`client.registerProposedFeatures()` is called *after* `client.start()`**
   (`extension.ts` L91–92). Registration must precede the initialize handshake to have any
   effect; as written the call is dead.

Minor: `package.json` pins `engines.vscode: ^1.58.0`, older than several client features in
use (label details, inlay hints); and the completion path's `DocRefResolver` plumbing (D7
doc-xref links) is never handed a resolver in the wasm-only server — dormant.

---

## 2. The `WasmChecker` surface (what the seed can already answer)

Every method degrades to "no result" on a missing/old seed; `speaksAbi` gates a
string-encoding mismatch. This is the ground feasibility is judged on.

| Method | Returns | Notes |
|---|---|---|
| `check(src, key, read)` | `VLDiagnostic[]` | Error tier, module-aware (import fetch loop). |
| `lint(src)` | `VLDiagnostic[]` | Sync, single-file, stable codes + severities. |
| `compile(src, key, read)` | `{ bytes?, diagnostics }` | Full codegen — the same path as `vl build`. Powers the playground's Run. |
| `definitionAt(…, line, ch)` | `WasmRange?` | Declaring span of the binding under the cursor. |
| `referencesAt(…, includeDecl)` | `WasmRange[]` | All occurrences, single-file. |
| `referencesInEntry(candidate, key, read, target)` | `WasmOccurrence[]` (`range` + `isDecl`) | Cross-file refs, one candidate compile per file. |
| `hoverTypeAt` / `memberTypeAt` / `typeAliasAt` | `string?` | Rendered type of binding / member access / `type` alias. Strings only — no decl *location* for a type. |
| `tokensAt` | `WasmToken[]` | Identifier spans + `bindKind` (var/param/fn) + `isDecl`. Value bindings only — `type` names are not in this slice. |
| `memberTokensAt` | `WasmMemberToken[]` | Property vs method spans. |
| `lexicalTokensAt(src)` | `WasmLexicalToken[]` | Sync. Keyword/operator/number/boolean/**comment** spans. Strings deliberately not emitted. |
| `builtinCompletions()` | `WasmBuiltin[]` | Fixed builtin surface (types + functions + rendered types). |
| `inlayHintsAt` | `WasmInlayCandidate[]` | Inferred type + name-end position per unannotated decl. |
| `scopeAt(…, line, ch)` | `WasmScopeBinding[]` | Every user binding in scope + kind + rendered type. |
| `memberCompletionsAt` | `WasmMemberCompletion[]` | Receiver's fields/methods + rendered types. |
| `importedNameSources` | `Record<local, WasmImportedSource>` | Exporting module key + decl-name span per imported name. |
| `moduleSurface(src, key)` | `{ exports[], imports[] }` | Sync. Export name + decl span + `export`-keyword span; resolved import keys. |
| `formatSrc(src)` | `string?` | Sync, whole-document canonical reprint. |

What the surface **cannot** answer (drives §6): decl→**type-decl location**, `///` doc text,
parameter lists as structured data (only rendered type strings), declaration *body* extents
(name spans only), caller/callee edges, and anything about a running program.

---

## 3. The full surface

### 3a. LSP 3.17 protocol features

| Feature | Status | What it gives a VL user | Feasibility (vs the checker surface) |
|---|---|---|---|
| Hover | **partial** | Types everywhere | Doc prose needs a native export; verbosity stepper blocked on LSP 3.18. |
| Completion | **have** | Scope/member/std-auto-import | — |
| Completion resolve | missing | Lazier, richer items | Marginal — items are cheap; only worth it if doc text arrives (see §6). |
| Signature help | **missing** | Param names/types while typing a call — a top gap for a typed language | *Partial* fit: `scopeAt`/`hoverTypeAt` render the callee's fn type as a string; host must re-parse it and track the active arg. Clean version wants one native export (§6). |
| Go to definition | **have** | Incl. cross-file + std | — |
| Go to type definition | **missing** | Jump from a value to its `type Foo = …` decl | `typeAliasAt` returns the rendered *body*, not a location → needs a native export. |
| Go to implementation | n/a | — | VL has no interfaces/traits to implement. |
| Go to declaration | n/a | — | No decl/def split in VL. |
| Find references | **have** | Cross-file, capped crawl | — |
| Document highlights | **have** | All same-file occurrences light up under the cursor | Shipped (D9.1): `referencesAt` verbatim + a `definitionAt` pairing to mark the decl as the Write occurrence. |
| Document symbols | **missing** | Outline view, breadcrumbs, Ctrl+Shift+O | Flat list served by `tokensAt` (decl-flagged, kinds) + `moduleSurface`; `type` decls need a small host-side scan (not in the token slice); *nesting* needs body extents → native export. Flat is still a big discoverability win. |
| Workspace symbols | **missing** | Ctrl+T "open any exported symbol by name" | Served by `moduleSurface` over `enumerateWorkspaceFiles` — the unused-export pass already runs exactly this crawl; add a name index. |
| Code actions | **partial** | 4 lint quick-fixes | More fixes = more lint codes; machinery is done. No refactoring-tier actions (extract fn etc. — needs AST edits the surface doesn't expose). |
| Code lens | **missing** | Inline "run test" / "N references" / "run file" | Reference counts for exports are **already computed** (`lastUseMap`); test lenses = the discovery scan from §4. |
| Document links | **missing** | Ctrl+click an import specifier's path | `moduleSurface.imports` has keys but no spans; a host-side scan of `import … from "…"` lines suffices — no native work. |
| Document colors | n/a | — | No color literals in VL. |
| Formatting (document) | **have** | `vl fmt` on save | — |
| Formatting (range) | **missing** | Format a selection | Formatter is whole-doc by design; low value given doc-format is instant. Skip. |
| Formatting (on-type) | n/a | — | Same reason; the auto-indent gap belongs to `language-configuration.json`, not LSP. |
| Rename (+prepare) | **missing** | Rename a binding project-wide, safely | **Almost fully served**: single-file = `referencesAt` spans → `WorkspaceEdit`; cross-file = the existing `crossFileReferences` machinery; `prepareRename` = `definitionAt` hit-test. The highest-value missing feature per line of code after tests. |
| Folding ranges | **missing** | Collapse functions/blocks/comment runs | Syntactic: brace scan + `lexicalTokensAt` comment spans, host-side. (VS Code's indentation folding covers some of this already.) |
| Selection ranges | **missing** | Expand-selection by syntax | Needs nested AST spans — the surface has none. Host-side bracket heuristic possible; low priority. |
| Call hierarchy | **missing** | Incoming/outgoing calls of a fn | Incoming ≈ references of the fn filtered to call sites (host heuristic over `referencesAt`); outgoing needs callee edges → native export. Defer. |
| Type hierarchy | n/a | — | Structural typing, no nominal sub/supertype tree. |
| Semantic tokens | **have** (full) | — | Delta/range variants unneeded at measured latency. |
| Linked editing | n/a | — | No paired tags/constructs to co-edit. |
| Monikers | n/a | — | No cross-repo index ecosystem to key into. |
| Inlay hints | **have** | Inferred types | Param-name hints at call sites would additionally need param names as data (same export as signature help). |
| Inline values | n/a (until DAP) | Variable values shown while debugging | Meaningless without a debugger. |
| Diagnostics: pull model | missing | Client-scheduled diagnostics | Push works fine at VL's check latency; migrate only if a client demands it. |
| Notebooks | n/a | — | No notebook story for VL. |
| Workspace file operations (willRename etc.) | **missing** | Rename/move a `.vl` file → importers' `import` paths rewritten | Importer set = the existing crawl + `moduleSurface.imports`; edit = path string rewrite. Moderate cost, real payoff once projects grow. |
| Watched files | **missing** | Use-map freshness without a save | Client capability + re-run of the existing pass; trivial. |
| Workspace folders | **have** | Multi-root | One client per outermost folder. |
| Window features (messages, progress) | **partial** | No-seed warning ships | Progress reporting on the workspace crawl: cosmetic, cheap. |
| Execute command | missing | Server-side commands | No current need; commands live in the extension. |

### 3b. VS Code-specific APIs beyond LSP

| Feature | Status | What it gives a VL user | Feasibility |
|---|---|---|---|
| **Testing API (TestController)** | **missing** | Test Explorer tree, **gutter run icons on `it(...)` lines**, per-test pass/fail states + failure message at the test's location, run-all/-file/-one | **The named ask — assessed in depth in §4.** CLI side is done: `vl test <file> -t <substring>` exists and works today. Extension-side only. |
| Debug adapter (DAP) | missing | Breakpoints, stepping, inline values | Large native work: the emitter produces no DWARF/source map for live debugging, and a debug host doesn't exist. Genuinely big; see §6. |
| Task provider | missing | `vl test` / `vl build` / `vl check` as VS Code tasks (problem matchers, keybindable) | Small, extension-only. A problem matcher over `vl check` output also gives Problems-pane diagnostics for CLI runs. |
| Terminal links | n/a | — | VS Code already auto-links `path:line:col` in terminals. |
| Tree views | n/a | — | Test Explorer covers the one tree worth having; a module-graph tree is speculation. |
| Webviews | n/a | — | The browser playground already exists outside VS Code; no in-editor webview earns its keep. |
| Status bar | **missing** | Which seed the LSP loaded (path + rung) at a glance | `loadWasmChecker` already knows its origin; surface it via a custom LSP notification + status bar item. The seed-ladder staleness class of bugs (documented at length in `server.ts`) becomes visible instead of a debugging session. |
| Custom editors | n/a | — | No non-text VL artifacts to edit. |
| Notebook controllers | n/a | — | As above. |
| Walkthroughs | missing | Onboarding checklist (install `vl`, open a file, run a test) | Pure manifest work; worth one afternoon when the extension is published, not before. |
| Snippet contributions | n/a | — | Snippets already ship via LSP completion (10 of them); a static contribution would duplicate. |
| Language configuration | **partial** | Auto-indent on `{`/Enter | Present: comments, brackets, auto-closing, surrounding pairs. Missing: `indentationRules` / `onEnterRules` — a 10-line JSON edit. |
| File decorations | n/a | — | Nothing file-level to badge. |
| Quick diff / SCM | n/a | — | Git's problem, already solved. |
| Chat / LM APIs | n/a | — | Out of scope for a language extension today. |

**Counts** (this survey's rows, not the protocol spec's): LSP layer — 9 have, 3 partial,
15 missing, 9 n/a. VS Code layer — 1 partial, 4 missing-worth-doing (Testing API, status
bar, task provider, language-config rules) + 1 missing-later (walkthrough), 1 missing-large
(DAP), 9 n/a.

---

## 4. Priority 1, in depth: per-test click-to-run (Testing API)

**The CLI needs no change.** Verified against `compiler/cli.vl` + `scripts/vl-host`:

- `vl test <path>` accepts a **single file** (a non-directory path short-circuits the walk:
  `cliFiles = [cliFile]`) or a directory (walk with a `*.test.vl` predicate).
- `-t <substring>` / `-t=<substring>` filters the plan by **substring over the
  scope-qualified name** (`cliContains(cliTestName[i], cliTestFilter)`), where the name is
  the `describe`-path joined with `" > "` (built in `std/test.vl`'s `vltRegister`).
- Report format is stable and parseable: a header line per file, then
  `␣␣ok␣␣␣ <name>` / `␣␣FAIL <name>` / `␣␣skip <name>`, failure message + captured output
  indented 7 spaces beneath a FAIL, a summary line, exit 1 iff any test failed. ANSI color
  wraps these when enabled — strip escapes before parsing.

**Test-name discovery from source.** The registration calls are `describe("…", () => {…})`,
`it("…", …)`, `itSkip("…", …)` with **string-literal** first arguments. The existing
checker surface can locate the *calls* (`tokensAt` tracks `it`/`describe` as imported
function bindings) but no export surfaces the *string argument* — `lexicalTokensAt`
deliberately omits strings. So discovery is a small host-side scan either way, and a scan
is sufficient: match `^\s*(describe|it|itSkip)\s*\(\s*"([^"]*)"` per line, track brace
depth to maintain the `describe` scope stack, and join with `" > "` — exactly mirroring
`vltRegister`. Known honest limits: a dynamically-built name (concat, variable) is
invisible to the scan but still runs under "run file" (the CLI discovers by *instantiating*
the module — two-phase collection); the extension must not copy that trick per keystroke,
since registration runs arbitrary top-level code (the server already refuses to run code
implicitly, for the right reason). Static scan for the tree; instantiation-accurate results
come back from the runner's own report.

**TestController vs CodeLens:**

| | TestController | CodeLens ("Run test" above each `it`) |
|---|---|---|
| Gutter run icon on the test line | yes, free | no (a lens is a text line, not a gutter icon) |
| Results UI | pass/fail/skip state per test, failure message rendered *at the test site*, Test Explorer tree, re-run-failed, history | none — results live in the terminal only |
| Discovery | same scan, feeding `TestItem`s (also drives the tree) | same scan, feeding lenses |
| Run wiring | `TestRunProfile` → spawn `vl test <file> -t "<full name>"`, parse report, map lines back to `TestItem`s by exact name | lens command → send the same CLI line to the terminal |
| Cost | ~200–300 extension lines | ~60 lines |
| LSP server involvement | none | none (or a server-side lens; unnecessary) |

**Recommendation: TestController.** The ask is literally its feature set (click the name →
run → see the result where the test is), the gutter icon does not exist in the CodeLens
model at all, and the runner's deterministic report + exit code make result mapping
mechanical. Sketch: (1) `**/*.test.vl` glob watcher + open-document scan populate a
`TestController` tree (file → describe → it); (2) one run profile spawns
`vl test <file> -t "<full scope-qualified name>"` per clicked item (file/describe items
drop or shorten the `-t`); (3) parse `ok/FAIL/skip` lines, match by exact name, set
`passed`/`failed(message, location)`/`skipped`; substring over-matches (a name containing
another) simply return extra result lines, which map to their own items — never wrong,
occasionally generous. Optional hardening later, not a blocker: a `--json` reporter in
`cli.vl` to retire the line parsing.

---

## 5. The rest of the shortlist

2. **Rename symbol (+prepare).** What: `textDocument/rename` returning a `WorkspaceEdit`.
   Why VL: refactoring today is find-references + hand-editing, in a language whose own
   compiler is ~30k lines of VL — the dogfooding cost is real. Sketch: `prepareRename` =
   `wordAt` + `definitionAt` hit-test; single-file rename = `referencesAt` spans → edits;
   cross-file = the existing `crossFileReferences` crawl (its occurrences include import
   specifiers, which is exactly what must be rewritten). Served by: `referencesAt`,
   `referencesInEntry`, `importedNameSources`. Risk: shadowing — lean on the checker's
   binding identity (it already distinguishes same-named bindings), never on text matching.

3. **Document symbols + workspace symbols.** What: outline view / breadcrumbs /
   Ctrl+Shift+O, and Ctrl+T over every export in the project. Why VL: this *is* the
   "richer self-discovery" ask — a new reader of a `.vl` file today has no map at all.
   Sketch: flat `DocumentSymbol[]` from `tokensAt` (decl-flagged, kind var/fn) + a
   host-side scan for `type` decls (not in the token slice); workspace symbols from
   `moduleSurface().exports` over the existing `enumerateWorkspaceFiles` crawl, cached
   beside the use-map the unused-export pass already maintains. Served by: `tokensAt`,
   `moduleSurface`. Honest limit: flat, not nested (no body extents), so breadcrumbs show
   the file's symbols but not "which function am I in" — the nested upgrade is a §6 export.

4. **Document highlights.** What: same-symbol occurrences light up on cursor rest. Why:
   the cheapest genuine polish item in the whole table — it makes the editor feel like it
   understands the code. Sketch: one handler, `referencesAt` verbatim, mapped to
   `DocumentHighlight[]`. Served by: `referencesAt` alone. Ship in the same PR as rename.

5. **Signature help.** What: param names/types + active-parameter highlight inside a call.
   Why VL: types are the language's pitch, and today they vanish exactly at the moment of
   calling a function; with UFCS (`expect(x).toEqual(…)`) knowing the `self`-shifted
   signature matters even more. Sketch (two grades): *bridge* — take the callee's rendered
   fn type from `scopeAt`/`hoverTypeAt`/`memberCompletionsAt` and re-parse
   `(a: i32, b: string) -> T` host-side, tracking the active comma; *clean* — one native
   export (§6) returning the param table structurally. The bridge works today; the string
   re-parse is the acknowledged debt.

6. **Code lens: export reference counts + run lenses.** What: "`N refs`" above each
   `export`, "Run" on runnable files, "Run tests" above a `*.test.vl` (complements, not
   replaces, §4). Why VL: the reference counts are *already computed and cached*
   (`lastUseMap`, per export, cross + local, refreshed on save) — the data currently
   surfaces only as 0-reference hints. Sketch: `codeLensProvider` reading `lastUseMap` +
   `moduleSurface().exports` spans. Served by: `moduleSurface`, the existing use-map pass.

7. **Status-bar seed indicator.** What: a status item showing which seed rung loaded
   (`bundled` / `workspace build/` / `` `vl seed` `` / override) and the ABI verdict, red
   when none. Why VL: the seed ladder is this extension's number-one operational hazard —
   `server.ts` documents an entire class of silent-staleness incidents, and the repo's
   memory records four stale-artifact traps. Today the answer lives in the output channel;
   a glance beats a debugging session. Sketch: custom notification from `loadWasmChecker`'s
   origin callback → `window.createStatusBarItem`. No checker work at all.

8. **Folding ranges + language-config indentation rules.** What: collapse
   functions/blocks/`//`-comment runs; correct auto-indent on Enter after `{`. Why: basic
   editor ergonomics currently delegated to VS Code's indent heuristics. Sketch: folding
   from a host-side brace scan + `lexicalTokensAt` comment spans; `indentationRules` /
   `onEnterRules` is a 10-line `language-configuration.json` edit. Served by:
   `lexicalTokensAt` (comments); the rest is syntactic.

9. **Doc-comment-aware hover and completion.** What: `///` prose above the type block in
   hover and completion docs — the D7 linkify plumbing already sits dormant in
   `typeFeatures.ts` waiting for exactly this. Why VL: std is version-locked and
   header-documented by policy; none of that carefully-written documentation is visible in
   the editor today. Sketch: needs one native export (§6) carrying the decl's doc text;
   the host side is already written (`docMarkdown`, `DocRefResolver`).

---

## 6. Cheap wins — the checker already fully serves these; wiring only

Honestly cheap (no native export, no new analysis):

- **Document highlights** — `referencesAt` verbatim.
- **Rename, single-file** — `referencesAt` spans → `WorkspaceEdit`. (Cross-file rename
  reuses the existing crawl; slightly more than "wiring" but no new surface.)
- **Workspace symbols** — `moduleSurface` + the existing crawl/caps.
- **Flat document symbols** — `tokensAt` decls (+ a small host regex for `type` decls —
  noted because that part is a scan, not the checker).
- **Export reference-count code lens** — `lastUseMap` is already computed on every save.
- **Testing API** — the CLI contract is complete (`vl test <file> -t <name>`); wholly
  extension-side (discovery scan + spawn + report parse).
- **Status-bar seed indicator** — origin already known at load time.
- **Document links on imports** — host-side line scan; `moduleSurface` confirms the key.
- **Watched files** — re-trigger the existing unused-export pass.
- **Task provider / problem matcher, walkthrough, indentation rules** — manifest/JSON work.
- **The two §1 defects** — `compilerPath` into `initializationOptions`;
  `registerProposedFeatures()` before `start()`.

Cheap but *bridge-grade* (works via rendered-string re-parsing, flagged as debt):
**signature help** off `scopeAt`/`memberCompletionsAt` type strings.

---

## 7. Needs native work — new seed exports, one line each

Each is a new `compiler/*.vl` driver export family (the `*Len`/`*At` idiom), gated like
every existing capability (`typeof exp.x === "function"` probe, degrade on old seeds):

- **Doc text per binding** — `docLen(line,col)` / `docByte(j)`: the `///` block above the
  decl under the cursor (plus per scope/member/builtin completion index). Unblocks hover
  prose, completion docs, and the dormant D7 linkifier.
- **Go-to-type-definition** — `typeDeclAt(line,col)` → decl-name span of the `type` alias
  behind the binding's (possibly inferred) type, in its declaring module.
- **Signature table** — `sigAt(line,col)` → param count; `sigParamName*/Type*(i)`,
  `sigRet*`: the callee's params as data, not a rendered string. Unblocks clean signature
  help + param-name inlay hints at call sites.
- **Declaration body extents** — `symBodyEndLine/Col(occ)` for decl occurrences: turns the
  flat outline into a nested one and fixes breadcrumbs ("which function am I in").
- **Call edges** — `callCount()` / `callFrom*/To*(i)`: caller→callee pairs for call
  hierarchy (outgoing calls; incoming is already approximable via references).
- **DAP (large, separate decision)** — not an export but an emitter feature:
  per-instruction source mapping (or DWARF) in the byte emitter plus a debug-capable host
  loop in `scripts/vl-host`. Order-of-magnitude bigger than everything else on this page
  combined; do not let it ride in on a smaller item.

---

*Populations named per repo policy: the §3 counts describe this survey's table rows, not
the protocol spec's feature count. The `vl test` facts were read from `compiler/cli.vl`,
`scripts/vl-host/src/main.rs` and `std/test.vl` on 2026-08-31; `-t` filtering was verified
live the same day. In-repo `*.test.vl` files today are 8 fixtures under `tests/fixtures/`
— the Testing API's beneficiaries are downstream VL projects (e.g. webcraft), not the
compiler repo's own suite.*

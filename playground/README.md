# VL Playground

A self-contained, client-side web playground for VL (ROADMAP Track E). Type VL
source in a **Monaco editor** with live in-browser LSP features (diagnostics,
semantic-token syntax colouring, hover, inlay hints, go-to-definition), click
**Run**, and see captured `log`/`print` output and (optionally) the `.wat` text —
all in the browser, with no server-side compile and no language-server process.

The whole compiler **and language server** run in the page: VL is pure
TypeScript + binaryen (an Emscripten single-file wasm build), so the same
`compile` / `runWasm` pipeline the CLI uses (`compiler/compile.ts`) AND the same
pure LSP feature-helpers the Node LSP uses (`lsp/src/typeFeatures.ts`) are
bundled to one ESM module and executed client-side. `src/lspAdapter.ts` is the
bridge — it imports ONLY the pure helpers (never the Node-bound
`lsp/src/server.ts`) and `src/main.ts` maps its results onto Monaco's provider
APIs.

## Editor / LSP features (client-side)

| Feature | Monaco surface | Backed by |
| --- | --- | --- |
| Diagnostics (incl. B17 unused-var lint, greyed via the `unnecessary` tag) | `setModelMarkers` (debounced on edit) | `checkOnly` |
| Semantic-token syntax colouring | `DocumentSemanticTokensProvider` | `semanticTokensData` + `SEMANTIC_TOKEN_LEGEND` |
| Hover (type at cursor, incl. members) | `HoverProvider` | symbol table + `resolveMemberAt` + `stringifyType` |
| Inlay hints (inferred types) | `InlayHintsProvider` | `deriveInlayHints` |
| Go-to-definition | `DefinitionProvider` | `SymbolTable.definitionAt` |

A small Monarch grammar provides a synchronous fallback for strings/comments/
numbers; the semantic-token provider does the accurate identifier/member
colouring. Autocomplete (D3) is intentionally skipped (not implemented in core).

## Run it locally

```sh
deno task playground
```

This builds the browser bundle and starts a static server, then open the printed
URL (default <http://localhost:8000/>). The first build downloads esbuild and the
Deno esbuild loader; subsequent builds are ~1s.

Open `index.html` over HTTP (not `file://`) — module scripts and the bundle's
MIME type require it, which is what the bundled server provides.

Sub-tasks:

| Task | What it does |
| --- | --- |
| `deno task playground:build` | Bundle `playground/src/main.ts` -> `playground/dist/playground.{js,css}` |
| `deno task playground` | Build, then serve `playground/` (pass `--port N` after the script to change the port) |
| `deno task playground:verify` | Headless check that the browser bundle compiles + runs (see below) |

The built bundle lands in `playground/dist/` (git-ignored).

## How it's built

`build.ts` bundles with **esbuild + `esbuild-deno-loader`** so resolution matches
Deno (the root `deno.json` import map + the `.ts` sloppy-import graph), targeting
`platform: browser`, `format: esm`, `conditions: ["browser"]`.

**Monaco** (`npm:monaco-editor`) is bundled through the same pipeline. Its ESM
imports `.css` (widget styles) and a `.ttf` (the codicon icon font); esbuild
emits the CSS into a sibling `dist/playground.css` (loaded by `index.html`) and a
`{ ".ttf": "dataurl" }` loader inlines the font, so there's no extra asset to
serve. Monaco's optional language workers (TS/JSON/CSS/HTML) are **not** used —
only a `vital` language is registered, with our own providers — so
`MonacoEnvironment.getWorker` returns a tiny inline no-op worker and the editor
plus every VL provider run on the **main thread**. (A worker-isolated provider
setup, like the real VS Code extension's, is a deferred follow-up — see ROADMAP
E3; it isn't needed for correctness here.)

Two small esbuild plugins handle the binaryen integration:

- **`binaryen-esm`** — the Deno loader resolves the bare `binaryen` import to the
  package's `index.d.ts` (types only), which esbuild can't bundle. The plugin
  redirects it to the real ESM `index.js`.
- **`node-builtins-external`** — binaryen's Emscripten glue has a Node-only branch
  (`if (isNode) await import("node:module")`) that never executes in a browser.
  Marking `node:*` external keeps it a runtime dynamic `import()` the dead branch
  never reaches.

### binaryen in the browser (the key risk) — it works

binaryen@130 is an ESM module that self-initializes its inlined wasm with a
**top-level await**: importing it resolves only once the wasm is instantiated.
That is exactly the property ROADMAP F8 relies on for the ESM LSP server, and it
lets binaryen run in the page unmodified — no patch, no out-of-band `.wasm`
asset. `format: esm` is required (TLA is illegal in CJS/IIFE output).

If binaryen ever fails to instantiate in a given browser, the UI shows a clear
"Compiler failed to load (binaryen could not instantiate…)" status instead of a
silent hang.

## Verifying

`deno task playground:verify` is a headless proof that the **browser bundle**
works. It re-bundles the DOM-free modules (`src/playground.ts` and the pure
`src/lspAdapter.ts`) with the identical esbuild settings, imports the artifacts,
and asserts:

- a clean program compiles, runs, and produces the expected `log` output;
- WAT is emitted on request;
- a broken program yields an error diagnostic with a source position;
- the LSP adapter produces: the B17 unused-var lint (tagged `unnecessary`), a
  well-formed semantic-token stream, a correct hover (`x: i32`), inlay hints, and
  go-to-definition;
- the **full** page bundle (`src/main.ts` + Monaco) builds — emitting both the JS
  and the sibling CSS — with every LSP provider wired (the headline Monaco
  integration risk). Monaco needs the DOM so it's built, not evaluated, here.

Note: under Deno the bundle is imported from a temp file (not a `data:` URL)
because binaryen's glue detects `globalThis.process` and takes its Node branch;
in a real browser `process` is undefined and that branch is skipped. Either way
the same bundled binaryen + compiler codegen is what runs.

### Manual in-browser check

1. `deno task playground` and open the URL.
2. The status line shows "Loading compiler…" then "Ready." (binaryen
   instantiated client-side); the Monaco editor renders with the print sample.
3. You should see **syntax colours** (keywords, strings, numbers, and
   semantically-distinct variable/function/type/member colours from the semantic
   tokens) and faint **inlay hints** (`: i32`) after unannotated declarations.
4. **Hover** an identifier — a tooltip shows its `name: type` (e.g. `x: i32`).
   **Ctrl/Cmd-click** (or F12) a use to jump to its declaration.
5. Pick the **error** sample: a **red squiggle** appears under the mismatch and
   the Diagnostics pane lists `error [3:14] Type error: …`. Add an unused
   variable like `let _x = 1` — it greys out (the `unnecessary` lint tag).
6. Click **Run** (or Ctrl/Cmd+Enter): the Output pane shows the program's
   `log`/`print` lines (the **print** sample shows `42`, `30`, `3.5`, …).
7. Toggle **Show WAT** and Run a clean sample to see the emitted module text.

## Layout

```
playground/
  index.html        single-page UI (Monaco editor host, Run, output panes)
  src/
    main.ts         Monaco + LSP-provider wiring to the DOM (the bundle entry)
    lspAdapter.ts   pure browser "language server": wraps the pure LSP helpers
    playground.ts   DOM-free wrapper over compiler/compile.ts (compile -> run -> WAT)
    samples.ts      seed programs (from tests/cases/**)
  build.ts          esbuild bundler (-> dist/playground.js + dist/playground.css)
  serve.ts          tiny static file server
  verify.ts         headless bundle test
  dist/             build output (git-ignored)
```

## Limitations / future work

- **Monaco runs on the main thread** — its built-in language workers are off (we
  register only `vital` with our own providers) and `MonacoEnvironment.getWorker`
  is a no-op inline worker. A worker-isolated LSP, like the VS Code extension's,
  is a deferred follow-up (ROADMAP E3); it isn't needed for correctness here.
- **Autocomplete (D3) is skipped** — not implemented in the compiler core.
- **No Web Worker sandbox for user wasm yet** (ROADMAP E3): user wasm runs on the
  main thread with a fresh `Memory` and a `log`-only import surface, but without
  worker isolation or enforced limits. Fine for trusted local use; harden before
  any public deployment.
- **No shareable links** (ROADMAP E4).
- **Bundle size** is large (~22 MB JS: binaryen's inlined wasm + Monaco, plus a
  ~265 KB CSS). It's cached after first load; future optimizations could load
  binaryen's wasm out-of-band and tree-shake/lazy-load Monaco features.
- `samples.ts` embeds copies of `tests/cases/**` programs; if those change, the
  copies don't auto-update.

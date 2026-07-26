# VL Playground

A self-contained, client-side web playground for VL (ROADMAP Track E). Type VL
source in a **Monaco editor** with live in-browser LSP features (diagnostics,
semantic-token syntax colouring, hover, inlay hints, go-to-definition), click
**Run**, and see captured `log`/`print` output and (optionally) the `.wat` text —
all in the browser, with no server-side compile and no language-server process.

The whole compiler **and language server** run in the page, on the **self-hosted
compiler seed** (`build/vl-compiler.wasm`, the same one the Node LSP and `vl
check`/`vl build` run): `src/wasmCheckerBrowser.ts` fetches the seed (written next
to the bundle by `build.ts` under a content-hashed name) and drives it through the
environment-agnostic
`createWasmChecker` core (`lsp/src/wasmChecker.ts`), exactly as the Node LSP does.
The **Run** path compiles VL → wasm on the seed too (`createWasmChecker.compile`
→ the driver's `compileSrc`) and executes the bytes with the pure `runWasm`
(a `WebAssembly.instantiate` over the VL host-import ABI — `compiler/compile.ts`,
no front end). `src/lspAdapter.ts` is the editor-feature bridge: it drives the
checker + the LSP-neutral assembly helpers (`lsp/src/typeFeatures.ts`'s `*FromWasm`
family) and `src/main.ts` maps its results onto Monaco's provider APIs. It never
imports the Node-bound `lsp/src/server.ts`.

Two TS-compiler bits remain (their migration to the seed is the last step):
**diagnostics** still use the codegen-free TS `checkOnly`, and the **WAT** pane is
rendered by **binaryen** (`wasmToWat`, lazily loaded) disassembling the seed's
emitted bytes — binaryen no longer compiles VL.

## Editor / LSP features (client-side)

| Feature | Monaco surface | Backed by |
| --- | --- | --- |
| Diagnostics (incl. B17 unused-var lint, greyed via the `unnecessary` tag) | `setModelMarkers` (debounced on edit) | `checkOnly` (TS) |
| Semantic-token syntax colouring | `DocumentSemanticTokensProvider` | wasm `tokensAt`/`memberTokensAt`/`lexicalTokensAt` → `semanticTokensDataFromWasm` |
| Hover (type at cursor, incl. members + type aliases) | `HoverProvider` | wasm `hoverTypeAt`/`memberTypeAt`/`typeAliasAt` + builtins |
| Inlay hints (inferred types) | `InlayHintsProvider` | wasm `inlayHintsAt` → `inlayHintsFromWasm` |
| Go-to-definition | `DefinitionProvider` | wasm `definitionAt` |
| Completion (identifiers + members + keywords/snippets) | `CompletionItemProvider` (`.`-triggered) | wasm `scopeAt`/`builtinCompletions`/`memberCompletionsAt` |
| Format (whole document) | the **Format** button | wasm `formatSrc` (`format.vl`) |

A small Monarch grammar provides a synchronous fallback for strings/comments/
numbers; the semantic-token provider does the accurate identifier/member
colouring. The LSP features degrade to empty (and format to a no-op) until the
seed loads, and stay disabled if the seed can't be fetched (an old browser
without WasmGC, or a build that didn't ship the seed) — Run still works.

## Run it locally

```sh
deno task playground
```

This builds the browser bundle and starts a static server, then open the printed
URL (default <http://localhost:8000/>). The first build downloads esbuild and the
Deno esbuild loader; subsequent builds are ~1s.

Open the page over HTTP (not `file://`) — module scripts and the bundle's MIME
type require it, which is what the bundled server provides. Note the served page
is the **built** `dist/index.html`, not the `index.html` template; opening the
template directly shows unsubstituted `{{JS}}`/`{{CSS}}` placeholders.

Sub-tasks:

| Task | What it does |
| --- | --- |
| `deno task playground:build` | Bundle `playground/src/main.ts` -> `playground/dist/playground-<hash>.{js,css}` + the resolved `dist/index.html` |
| `deno task playground` | Build, then serve `playground/dist/` (pass `--port N` after the script to change the port) |
| `deno task playground:verify` | Headless check that the browser bundle compiles + runs (see below) |

The build lands in `playground/dist/` (git-ignored), which is **self-contained**:
the resolved `index.html`, the content-hashed entry pair, the code-split chunks
and the hashed compiler seed. That directory is exactly what gets served locally
and what the Pages workflow uploads, so local and deployed layouts match.

## Cache busting

Shipping a change used to not reach a returning visitor: `index.html` referenced
`dist/playground.js`, `dist/playground.css` and the page fetched
`dist/vl-compiler.wasm` — three **stable** URLs a browser is free to keep serving
from cache. (The code-split `chunk-*.js` were already content-hashed; only the
entries and the seed were not. The seed is the sharp edge: it is rebuilt on every
compiler merge.)

Every cacheable asset now carries a **content hash** in its filename, and the one
un-hashed file — `index.html`, which points at them — is served `no-cache`:

| File | Cached |
| --- | --- |
| `index.html` | `no-cache, must-revalidate` — it is the pointer; it must be re-read |
| `playground-<hash>.{js,css}`, `chunk-*.js`, `vl-compiler-<hash>.wasm` | `public, max-age=31536000, immutable` |

A content hash rather than a `?v=<timestamp>` query on purpose: a timestamp
changes every URL on every build, throwing away the cache even when nothing the
browser holds actually changed. A hash changes **exactly** when the bytes change —
so a rebuild with no source change emits byte-identical names and keeps the
visitor's cache warm, while any real change renames what they must re-fetch.

`serve.ts` sends those headers locally. The deployed site is **GitHub Pages**
(`.github/workflows/pages.yml`), which sends its own `Cache-Control` and offers
no way to configure it — so renaming the file is not merely the nicer lever
there, it is the only one.

Two guards keep this from silently rotting, both exercised by `playground:verify`:
`index.html` is a **template** whose `{{JS}}`/`{{CSS}}` placeholders `build.ts`
substitutes (it fails the build if one is missing, i.e. if someone pastes a
literal name back), and the seed's hashed name is pinned into the bundle by a
**generated module** (`src/generated/seedName.ts`, git-ignored) so a missed
resolution is a build error rather than a visitor's 404.

## How it's built

`build.ts` bundles with **esbuild + `esbuild-deno-loader`** so resolution matches
Deno (the root `deno.json` import map + the `.ts` sloppy-import graph), targeting
`platform: browser`, `format: esm`, `conditions: ["browser"]`.

**Code-splitting** is on (`splitting: true`, `outdir`): the entry is
`playground-<hash>.js` (~2 MB) and everything reached only through a dynamic
`import()` lands in a `chunk-*.js` fetched on demand — most importantly
**binaryen** (~13 MB), which the WAT renderer (`wasmToWat`) pulls lazily, so it
never weighs on the initial load. The built `index.html` loads only
`playground-<hash>.js` + `playground-<hash>.css`; the chunks sit beside them and
are fetched by their relative URLs. `entryNames: "[name]-[hash]"` supplies the
entry hashes, and `build.ts` reads the emitted names back out of esbuild's
**metafile** rather than reconstructing them — esbuild owns the hash, so asking
it is the only way to be sure the names in `index.html` are the names on disk.
(An entry embeds the specifier of every chunk it imports, so a change anywhere in
the graph renames a chunk and therefore renames the entry too.)

**Monaco** (`npm:monaco-editor`) is bundled through the same pipeline. Its ESM
imports `.css` (widget styles) and a `.ttf` (the codicon icon font); esbuild
emits the CSS into a sibling `dist/playground-<hash>.css` (loaded by the built
`index.html`) and a
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

### binaryen in the browser (WAT only) — it works

binaryen@130 is an ESM module that self-initializes its inlined wasm with a
**top-level await**: importing it resolves only once the wasm is instantiated.
`format: esm` is required (TLA is illegal in CJS/IIFE output). It is reached ONLY
via the lazy `import("binaryen")` / `import("./toWasm.ts")` behind `wasmToWat`, so
code-splitting puts it in its own `chunk-*.js` fetched when the WAT pane is first
shown — not on page load, and never on the Run path (which compiles + executes on
the seed). It is the WAT pane's only remaining dependency on the TS compiler tree.

If the **seed** fails to load, the UI shows a clear "Compiler failed to load…"
status instead of a silent hang, and the editor features + Run stay disabled.

## Verifying

`deno task playground:verify` is a headless proof that the **browser bundle**
works. It re-bundles the DOM-free modules (`src/playground.ts` and the pure
`src/lspAdapter.ts`) with the identical esbuild settings, imports the artifacts,
and asserts:

- a clean program compiles (seed codegen), runs (the pure `runWasm` host ABI),
  and produces the expected `log` output;
- WAT is emitted on request (binaryen disassembling the seed's bytes);
- a broken program yields an error diagnostic with a source position;
- the LSP adapter produces: the B17 unused-var lint (tagged `unnecessary`), a
  well-formed semantic-token stream, a correct hover (`x: i32`), inlay hints,
  go-to-definition, completion, and format;
- the **full** page bundle (`src/main.ts` + Monaco) builds — emitting both the JS
  and the sibling CSS — with every LSP provider wired (the headline Monaco
  integration risk). Monaco needs the DOM so it's built, not evaluated, here;
- **cache busting** holds: the template still has its placeholders and no literal
  entry name, rendering both substitutes and *throws* on a missing placeholder,
  the cache classifier splits hashed/un-hashed both ways, and — when `dist/` has
  been built — every local reference in `dist/index.html` is content-hashed and
  present, with the seed's filename matching the hash of the seed actually built
  and the bundle fetching that exact name.

The Run-path and LSP checks drive the on-disk seed (the headless analogue of the
page's fetch); they self-skip if it isn't built. Note: under Deno the bundle is
imported from a temp file (not a `data:` URL) because binaryen's glue (lazily
loaded for WAT) detects `globalThis.process` and takes its Node branch; in a real
browser `process` is undefined and that branch is skipped.

### Manual in-browser check

1. `deno task playground` and open the URL.
2. The status line shows "Loading compiler…" then "Ready." (the self-hosted seed
   fetched + instantiated); the Monaco editor renders with the print sample.
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
  index.html        single-page UI (Monaco host, Run, output panes) — the TEMPLATE;
                    {{JS}}/{{CSS}} are resolved into dist/index.html by build.ts
  src/
    main.ts         Monaco + LSP-provider wiring to the DOM (the bundle entry)
    lspAdapter.ts   pure browser "language server": wraps the pure LSP helpers
    playground.ts   DOM-free Run path: seed compile (compileSrc) -> runWasm -> WAT
    samples.ts      seed programs (from tests/cases/**)
    generated/      seedName.ts — the seed's hashed name (written by build.ts,
                    git-ignored; imported by wasmCheckerBrowser.ts)
  assets.ts         content hashing, cache-control policy, index.html templating
                    (shared by build.ts / serve.ts / verify.ts)
  build.ts          esbuild bundler (-> the self-contained dist/ below)
  serve.ts          tiny static file server (web root = dist/), sends the headers
  verify.ts         headless bundle test (incl. the cache-busting guards)
  dist/             build output, self-contained + deployable (git-ignored):
                    index.html, playground-<hash>.{js,css}, chunk-*.js,
                    vl-compiler-<hash>.wasm
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

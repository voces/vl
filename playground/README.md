# VL Playground

A self-contained, client-side web playground for VL (ROADMAP Track E). Type VL
source, click **Run**, and see diagnostics, captured `log`/`print` output, and
(optionally) the `.wat` text — all in the browser, with no server-side compile.

The whole compiler runs in the page: VL is pure TypeScript + binaryen (an
Emscripten single-file wasm build), so the same `compile` / `runWasm` pipeline
the CLI uses (`compiler/compile.ts`) is bundled to one ESM module and executed
client-side.

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
| `deno task playground:build` | Bundle `playground/src/main.ts` -> `playground/dist/playground.js` |
| `deno task playground` | Build, then serve `playground/` (pass `--port N` after the script to change the port) |
| `deno task playground:verify` | Headless check that the browser bundle compiles + runs (see below) |

The built bundle lands in `playground/dist/` (git-ignored).

## How it's built

`build.ts` bundles with **esbuild + `esbuild-deno-loader`** so resolution matches
Deno (the root `deno.json` import map + the `.ts` sloppy-import graph), targeting
`platform: browser`, `format: esm`, `conditions: ["browser"]`.

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
works. It re-bundles the DOM-free core (`src/playground.ts`) with the identical
esbuild settings, imports the artifact, and asserts:

- a clean program compiles, runs, and produces the expected `log` output;
- WAT is emitted on request;
- a broken program yields an error diagnostic with a source position.

Note: under Deno the bundle is imported from a temp file (not a `data:` URL)
because binaryen's glue detects `globalThis.process` and takes its Node branch;
in a real browser `process` is undefined and that branch is skipped. Either way
the same bundled binaryen + compiler codegen is what runs.

### Manual in-browser check

1. `deno task playground` and open the URL.
2. The status line shows "Loading compiler…" then "Ready." (binaryen
   instantiated client-side).
3. Pick the **print** sample, click **Run** (or Ctrl/Cmd+Enter): the Output pane
   shows `42`, `30`, `3.5`, … and Diagnostics shows "No diagnostics."
4. Pick the **error** sample and Run: Diagnostics shows a red `error [3:14] Type
   error: …` and the Output pane stays empty.
5. Toggle **Show WAT** and Run a clean sample to see the emitted module text.

## Layout

```
playground/
  index.html        single-page UI (textarea editor, Run, output panes)
  src/
    main.ts         DOM wiring (the bundle entry)
    playground.ts   DOM-free wrapper over compiler/compile.ts (compile -> run -> WAT)
    samples.ts      seed programs (from tests/cases/**)
  build.ts          esbuild bundler (-> dist/playground.js)
  serve.ts          tiny static file server
  verify.ts         headless bundle test
  dist/             build output (git-ignored)
```

## Limitations / future work

- **Editor is a `<textarea>`** (v1). A real editor (Monaco/CodeMirror, ROADMAP
  E2) is a follow-up.
- **No Web Worker sandbox yet** (ROADMAP E3): user wasm runs on the main thread
  with a fresh `Memory` and a `log`-only import surface, but without worker
  isolation or enforced limits. Fine for trusted local use; harden before any
  public deployment.
- **No shareable links** (ROADMAP E4).
- **Bundle size** is ~13 MB (binaryen's inlined wasm). It's cached after first
  load; a future optimization could load binaryen's wasm out-of-band.
- `samples.ts` embeds copies of `tests/cases/**` programs; if those change, the
  copies don't auto-update.

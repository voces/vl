# Vital VSCode extension (LSP)

The `vital-vscode` extension. It bundles a VSCode language client
([`src/extension.ts`](./src/extension.ts)) and a Language Server
([`src/server.ts`](./src/server.ts)) and provides diagnostics, type-aware hover
and completion, go-to-definition, find references, inlay hints, formatting,
quick-fixes, semantic highlighting, and a **Run Current File** command for `.vl`
files, plus **per-test click-to-run** (VS Code's Testing API — gutter run icons
and a Test Explorer tree) for `*.test.vl` files.

The server type-checks via the TypeScript compiler core by default, or via the
self-hosted compiler wasm seed — selectable with the `vital.checker` setting
(`ts` | `wasm` | `both`).

## How it's wired

- `main` in [`package.json`](./package.json) → `dist/extension.js` (the client).
- The client spawns the server bundle at `dist/server.mjs` over IPC.
- Both bundles are produced by esbuild (the `build` task in
  [`deno.json`](./deno.json)). `dist/` is git-ignored, so you must build before
  the extension will load.
- The npm deps the bundles need (`vscode-languageclient`,
  `vscode-languageserver`, `vscode-languageserver-textdocument`) are
  **devDependencies of the *root* [`package.json`](../package.json)**, not of
  this folder. esbuild resolves them from the root `node_modules/`, so the root
  install must run before the build.
- `.vl` program execution (the **Run Current File** command) shells out to the
  native `vl` binary (`vl run`), resolved from the `vital.compilerPath` setting
  (relative paths are against the project root) or `vl` on the PATH; that path is
  optional and only used by the run command, not by diagnostics.
- The **Testing API** integration (`tests.createTestController`) uses the same
  binary and cwd resolution, spawning `vl test <file> [-t <describe > it path>]`
  per clicked item. Test discovery is a host-side source scan
  ([`src/testDiscovery.ts`](./src/testDiscovery.ts)) — a test's name is a string
  literal, which the checker's token surface deliberately omits, and the runner
  itself discovers by *instantiating* the module, which an editor must not do
  per keystroke. That module is pure (no `vscode`) and unit-tested by
  [`tests/lsp_test_discovery_test.ts`](../tests/lsp_test_discovery_test.ts).
- A **failure anchors at the MATCHER that failed**, not at the `it` line. The
  runner reports the position — each `std:test` matcher (`toEqual`, `toBeTrue`,
  `toBeFalse`) carries a `caller: CallerLoc = __callsite__` default, so a
  failure prints a second line
  reading `  at <file>:<line>:<col>` — and `testDiscovery.ts` parses it into a
  `FailureLocation`, then resolves it against the run's cwd (`failureAnchor`)
  for `TestMessage.location`. Three cases fall out of that rather than being
  special-cased: a body with SEVERAL assertions anchors at the one that failed,
  a failure inside a HELPER anchors in the helper's own file, and a chain broken
  over lines (`expect(x)` ⏎ `  .toEqual(y)`) anchors on the matcher's LINE
  rather than the setup's. Failures that carry
  no location by construction — `fail(msg)`, a raw trap, a `<compile>` error —
  keep the `it`-line fallback. Graded end to end against the real runner's output
  by [`tests/vl_test_runner_test.ts`](../tests/vl_test_runner_test.ts).
- **Folding** ([`src/folding.ts`](./src/folding.ts)) and test discovery share ONE host-side
  tokenizer, [`src/vlLex.ts`](./src/vlLex.ts) — VL's real lexical grammar (`//` and `///`
  line comments, no block comment; `"…"`/`'…'` with the lexer's escape set). That lexical
  half reads no seed, which is why folding is the only server capability that still works
  when the compiler wasm fails to load. With a seed loaded it is joined by one region per
  declaration and block from `declExtentsAt`, each starting at the construct's HEADER line
  rather than at the line its brace happens to open on — the difference a wrapped signature
  makes, and what a sticky header has to name.
- **Outline and sticky scroll.** `textDocument/documentSymbol` is a NESTED tree built from
  the same extents: a symbol's `range` is the whole declaration and its `selectionRange` the
  name, so a declaration inside another is its child. Symbols are declarations only —
  functions, types, module-level `const`/`let`, and a lambda that no binding already names;
  a control-flow block is not one, exactly as TypeScript's outline does not list `if` bodies.
  A seed without the extent export falls back to the older flat, name-span outline rather
  than to nothing.

  VS Code's sticky scroll picks its source with `editor.stickyScroll.defaultModel`:

  | setting | what sticks in a `.vl` file |
  | --- | --- |
  | `outlineModel` (default) | functions, types and module-level bindings — the declaration you are inside, and nested declarations under it |
  | `foldingProviderModel` | the above **plus** every braced block: `if` / `else` / `for` / `while` / `match` and its arms, lambda bodies, and multi-line comment and import runs |
  | `indentationModel` | whitespace only; no VL knowledge |

  Turn it on with `"editor.stickyScroll.enabled": true`; pick
  `foldingProviderModel` to keep a loop or a `match` arm pinned while scrolling
  a long body.
- **Editor ergonomics that are not LSP at all** live in
  [`language-configuration.json`](./language-configuration.json) — brackets, auto-closing
  and surrounding pairs, `indentationRules`, and the `onEnterRules` that continue a `//` or
  `///` comment block (and stop on an empty one). There is deliberately no block-comment
  rule: VL's lexer has no block comment, so the pair would auto-close into a syntax error.
  Both are asserted by [`tests/lsp_folding_test.ts`](../tests/lsp_folding_test.ts).

## Build & install (run from the repo root)

Prerequisites: **deno**, and the node version pinned in
[`.node-version`](./.node-version) managed via `nodenv` (the build's `npx
esbuild` runs under that node). If it isn't installed:

```sh
nodenv install "$(cat lsp/.node-version)"   # e.g. 24.11.1
```

1. **Install root npm deps** (provides `vscode-languageclient` / `-server` for
   the bundle to resolve):

   ```sh
   deno task install        # = npm ci, at the repo root
   ```

2. **Build the extension** (bundles client + server into `lsp/dist/`):

   ```sh
   deno task lsp:build      # = (cd lsp && deno task build)
   ```

   Produces `lsp/dist/extension.js` and `lsp/dist/server.mjs`. Use
   `deno task lsp:dev` to rebuild the server on change while developing.

3. **Register it with VSCode** by symlinking this folder into the per-user
   extensions directory. The link name should be `<publisher>.<name>-<version>`
   from [`package.json`](./package.json):

   ```sh
   ln -sfn "$PWD/lsp" ~/.vscode/extensions/verit.vital-vscode-0.0.1
   ```

   Reload/restart VSCode. Confirm it's registered:

   ```sh
   "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
     --list-extensions | grep vital      # → verit.vital-vscode
   ```

   Open any `.vl` file — the language server activates on `onLanguage:vital`.
   The **vital** output channel (Output panel) shows server logs.

### Updating after code changes

Re-run the build; the symlink points at the live folder, so VSCode picks up the
new `dist/` on the next window reload:

```sh
deno task lsp:build      # then reload the VSCode window
```

### Uninstall

```sh
rm ~/.vscode/extensions/verit.vital-vscode-0.0.1
```

## Alternative: Extension Development Host (no symlink)

To run the extension in a sandboxed dev window without installing it, press
**F5** in VSCode. The launch config at [`.vscode/launch.json`](./.vscode/launch.json)
(and the repo-root [`../.vscode/launch.json`](../.vscode/launch.json)) starts an
Extension Development Host with `--extensionDevelopmentPath` pointed at this
folder. You still need steps 1–2 above (the dev host loads `dist/`).

## Settings

| Setting | Default | Description |
|---|---|---|
| `vital.checker` | `ts` | Which compiler produces diagnostics: `ts` (TS core), `wasm` (self-hosted seed, experimental), `both` (publish TS, log divergence). Requires a window reload. |
| `vital.compilerWasm` | `""` | Path to the self-hosted compiler wasm. Empty → `<workspace>/build/vl-compiler.wasm`. |

# Vital VSCode extension (LSP)

The `vital-vscode` extension. It bundles a VSCode language client
([`src/extension.ts`](./src/extension.ts)) and a Language Server
([`src/server.ts`](./src/server.ts)) and provides diagnostics, type-aware hover
and completion, go-to-definition, find references, inlay hints, formatting,
quick-fixes, semantic highlighting, and a **Run Current File** command for `.vl`
files.

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

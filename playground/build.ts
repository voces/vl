#!/usr/bin/env -S deno run -A
// Bundles the playground for the browser with esbuild + the Deno loader.
//
// Why this combination (ROADMAP E1):
//   * esbuild-deno-loader resolves the same way Deno does — it reads the root
//     deno.json import map and follows the `.ts` / sloppy-import graph
//     (compile.ts -> toWasm.ts -> binaryen) without a separate package.json or
//     tsconfig. `deno bundle` was removed in Deno 2, and a hand-written import
//     map + ESM CDN for binaryen would re-fetch a 13 MB+ wasm-inlined module per
//     load; bundling it once is cleaner.
//   * a tiny `binaryenPlugin` (below) intercepts the bare `binaryen` import. The
//     Deno loader resolves it via the package's `typings` field to `index.d.ts`
//     (a types-only, "external" module esbuild can't bundle); we instead point it
//     straight at the real ESM `index.js`. That plugin is registered before the
//     Deno loader so it wins.
//   * platform "browser" + format "esm": binaryen@130 self-initializes with a
//     *top-level await* (it instantiates its inlined wasm at module-eval time).
//     TLA is only legal in an ESM output, which is exactly why ROADMAP F8 could
//     drop the old binaryen patch for the ESM LSP server — the same property lets
//     it run unmodified in the page. A "node" platform or an IIFE/CJS format
//     would break that.
//   * conditions ["browser"]: pick binaryen's browser export over its node one.
//
// Output: playground/dist/playground.js (one self-contained ESM module loaded by
// index.html). Run via `deno task playground:build` (or `deno task playground`,
// which also serves).

import * as esbuild from "esbuild";
import { denoPlugins } from "esbuild-deno-loader";

const HERE = new URL(".", import.meta.url);
const ROOT = new URL("../", HERE);

// Locate binaryen's real ESM entry (`index.js`) under the materialized npm tree.
// `import.meta.resolve` honors the deno.json import map (binaryen -> npm:...),
// so this finds the package without hard-coding the `.deno/binaryen@130.0.0`
// path. We then swap the `index.d.ts` the loader would pick for `index.js`.
const binaryenEntry = (): string => {
  const resolved = import.meta.resolve("binaryen");
  const path = new URL(resolved).pathname;
  return path.replace(/index\.d\.ts$/, "index.js");
};

// Intercept the bare `binaryen` specifier before the Deno loader sees it and
// load the real JS module. Without this, the Deno loader resolves `binaryen` to
// its types entry and esbuild reports "Could not resolve binaryen".
const binaryenPlugin: esbuild.Plugin = {
  name: "binaryen-esm",
  setup(build) {
    const entry = binaryenEntry();
    build.onResolve({ filter: /^binaryen$/ }, () => ({ path: entry }));
  },
};

// binaryen's Emscripten glue has a NODE-only branch guarded at runtime by an
// environment check (`if (isNode) { await import("node:module") ... }`). In a
// browser that branch never executes, but esbuild still tries to resolve the
// `node:module` specifier at bundle time and fails. Mark every `node:` builtin
// external so it stays a runtime `import()` that the dead branch never reaches.
const nodeBuiltinsExternalPlugin: esbuild.Plugin = {
  name: "node-builtins-external",
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

const build = async (): Promise<void> => {
  const result = await esbuild.build({
    plugins: [
      binaryenPlugin,
      nodeBuiltinsExternalPlugin,
      ...denoPlugins({
        // Point the loader at the shared root deno.json so the .ts sloppy-import
        // graph resolves exactly as Deno does.
        configPath: new URL("deno.json", ROOT).pathname,
        nodeModulesDir: "manual",
      }),
    ],
    // esbuild's cwd anchors the native loader's `deno info` at the repo root, so
    // node_modules and the import map are found.
    absWorkingDir: ROOT.pathname,
    // The object form names the entry output `playground.js` (+ `playground.css`)
    // under `outdir`, which `splitting` requires (it can't target a single
    // `outfile`). index.html loads `./dist/playground.js`; the split chunk(s) sit
    // beside it and are fetched lazily by their relative URLs.
    entryPoints: { playground: new URL("src/main.ts", HERE).pathname },
    outdir: new URL("dist", HERE).pathname,
    bundle: true,
    format: "esm",
    platform: "browser",
    conditions: ["browser"],
    target: "es2022",
    // Code-split so binaryen — reached ONLY via dynamic `import("binaryen")` /
    // `import("./toWasm.ts")` (the WAT renderer `wasmToWat`; codegen is on the
    // seed now) — lands in its own chunk fetched on demand when the WAT pane is
    // shown, instead of being inlined into the ~13 MB-heavier initial bundle.
    splitting: true,
    chunkNames: "chunk-[hash]",
    // Monaco's ESM imports `.css` (its widget styles) and a `.ttf` (the codicon
    // icon font). esbuild bundles the CSS into a sibling `dist/playground.css`
    // (loaded by index.html); inline the font as a data: URL so there's no extra
    // asset to serve. Without these loaders esbuild errors on the imports.
    loader: { ".ttf": "dataurl" },
    sourcemap: true,
    // Quiet, but surface real problems.
    logLevel: "info",
  });
  for (const w of result.warnings) {
    console.warn(`warn: ${w.text}`);
  }
  console.error("built playground/dist/playground.js");
};

// Copy the self-hosted compiler seed next to the bundle so the page can fetch it
// (`wasmCheckerBrowser.ts` resolves `vl-compiler.wasm` relative to the loaded
// module). The seed backs the playground's LSP features (hover/completion/
// semantic tokens/inlay/definition/format) — the same one the Node LSP and
// `vl check` run. A missing seed isn't fatal here (the page degrades those
// features to empty), but warn loudly: build it with `./scripts/refresh-compiler.sh`.
const copySeed = async (): Promise<void> => {
  const seed = new URL("build/vl-compiler.wasm", ROOT);
  const dest = new URL("dist/vl-compiler.wasm", HERE);
  try {
    await Deno.copyFile(seed, dest);
    console.error("copied build/vl-compiler.wasm → playground/dist/");
  } catch (err) {
    console.warn(
      `warn: could not copy the compiler seed (${
        err instanceof Error ? err.message : String(err)
      }) — the playground's LSP features will be disabled. ` +
        "Build the seed with ./scripts/refresh-compiler.sh",
    );
  }
};

await build();
await copySeed();
esbuild.stop();

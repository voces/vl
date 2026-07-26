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
// Output: playground/dist/ — a SELF-CONTAINED, deployable directory holding the
// resolved `index.html`, the content-hashed entry points, the code-split chunks
// and the hashed compiler seed. Run via `deno task playground:build` (or
// `deno task playground`, which also serves).
//
// Cache busting (see assets.ts for the full rationale): every asset the browser
// caches carries a content hash in its filename, and the one un-hashed file —
// `index.html`, which points at them — is served no-cache. Shipping a change
// therefore reaches a returning visitor without a hard reload, while a rebuild
// that changes nothing emits byte-identical names and keeps their cache warm.

import * as esbuild from "esbuild";
import { denoPlugins } from "esbuild-deno-loader";
import {
  cleanDist,
  hashedSeed,
  renderIndexHtml,
  SEED_FALLBACK,
  TEMPLATE,
  writeSeedModule,
} from "./assets.ts";

const HERE = new URL(".", import.meta.url);
const ROOT = new URL("../", HERE);
const DIST = new URL("dist/", HERE);

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

const build = async (): Promise<{ js: string; css: string }> => {
  const result = await esbuild.build({
    metafile: true,
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
    // The object form names the entry output `playground-<hash>.js` (+ the
    // sibling `playground-<hash>.css`) under `outdir`, which `splitting`
    // requires (it can't target a single `outfile`). The resolved `index.html`
    // written below loads those exact names; the split chunk(s) sit beside them
    // and are fetched lazily by their relative URLs.
    entryPoints: { playground: new URL("src/main.ts", HERE).pathname },
    outdir: DIST.pathname,
    // Content-hash the ENTRY points, as the chunks already were. These are the
    // two URLs index.html hard-referenced under stable names, so they were the
    // two a browser could serve from cache indefinitely after a ship. esbuild's
    // entry hash covers the chunk specifiers the entry imports, so a change
    // anywhere in the graph propagates out to this name.
    entryNames: "[name]-[hash]",
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
  // Read the emitted entry names out of the metafile rather than reconstructing
  // them: esbuild owns the hash, so asking it is the only way to be sure the
  // names in index.html are the names on disk. The JS entry is the single output
  // whose `entryPoint` is our `main.ts`; `cssBundle` names its style sibling.
  const outputs = Object.entries(result.metafile.outputs);
  const entry = outputs.find(([, o]) => o.entryPoint?.endsWith("playground/src/main.ts"));
  if (!entry) throw new Error("esbuild emitted no entry output for src/main.ts");
  const [jsPath, jsMeta] = entry;
  if (!jsMeta.cssBundle) {
    throw new Error("esbuild emitted no CSS bundle for the entry (Monaco styles missing)");
  }
  const base = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
  return { js: base(jsPath), css: base(jsMeta.cssBundle) };
};

// Write the compiler seed into dist under its CONTENT-HASHED name, and return
// that name for the generated module the bundle imports. The seed backs the
// playground's LSP features (hover/completion/semantic tokens/inlay/definition/
// format) — the same one the Node LSP and `vl check` run — and it is rebuilt on
// every compiler merge, which made its old stable name the most frequently
// stale URL on the deployed site. A missing seed isn't fatal (the page degrades
// those features to empty), but warn loudly: build it with
// `./scripts/refresh-compiler.sh`.
const emitSeed = async (): Promise<string> => {
  const seed = await hashedSeed(new URL("build/vl-compiler.wasm", ROOT));
  if (!seed) {
    console.warn(
      "warn: could not read build/vl-compiler.wasm — the playground's LSP " +
        "features will be disabled. Build the seed with ./scripts/refresh-compiler.sh",
    );
    return SEED_FALLBACK;
  }
  await Deno.writeFile(new URL(seed.name, DIST), seed.bytes);
  console.error(`seed: build/vl-compiler.wasm → playground/dist/${seed.name}`);
  return seed.name;
};

// Resolve the hand-maintained template against the names esbuild just emitted.
// This is the ONE un-hashed file the browser fetches, so it is also the only one
// that must not be cached (serve.ts sends it no-cache; see assets.ts).
const writeIndexHtml = async (assets: { js: string; css: string }): Promise<void> => {
  const html = renderIndexHtml(await Deno.readTextFile(TEMPLATE), assets);
  await Deno.writeTextFile(new URL("index.html", DIST), html);
  console.error(`page: playground/dist/index.html → ${assets.js} + ${assets.css}`);
};

// Order matters: dist is emptied first so it stays a snapshot of THIS build
// (hashed names would otherwise accumulate forever), and the seed is hashed
// before bundling because esbuild inlines its name via the generated module.
await cleanDist(DIST);
await writeSeedModule(await emitSeed());
await writeIndexHtml(await build());
esbuild.stop();

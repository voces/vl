#!/usr/bin/env -S deno run -A
// Headless verification that the BROWSER bundle actually works — most importantly
// that binaryen instantiates client-side (the ROADMAP E key risk).
//
// Strategy: bundle the DOM-free core (`src/playground.ts`) with the exact same
// esbuild settings as the real build (platform: browser, format: esm,
// conditions: browser, node: builtins external), then import that bundle and run
// it. The bundle is the browser artifact — no Deno/std imports, only the inlined
// binaryen wasm + the compiler — so if its TLA-driven binaryen init and codegen
// run here, they run in a page too. We assert: clean program -> diagnostics +
// captured `log`; broken program -> an error diagnostic with a position; WAT is
// emitted on request.
//
// Run via `deno task playground:verify`. Exits non-zero on any failure.

import * as esbuild from "esbuild";
import { denoPlugins } from "esbuild-deno-loader";

const HERE = new URL(".", import.meta.url);
const ROOT = new URL("../", HERE);

const binaryenEntry = (): string =>
  new URL(import.meta.resolve("binaryen")).pathname.replace(
    /index\.d\.ts$/,
    "index.js",
  );

// Bundle a single DOM-free browser entry with the real build's settings and
// return its JS text (no `write`). Used for the modules we can evaluate headless
// (the compiler core and the pure LSP adapter); the full DOM bundle (main.ts +
// Monaco) is only *built*, not evaluated (see `verifyFullBundleBuilds`).
const bundleCore = async (entry: string): Promise<string> => {
  const out = await esbuild.build({
    plugins: [
      {
        name: "binaryen-esm",
        setup(build) {
          const e = binaryenEntry();
          build.onResolve({ filter: /^binaryen$/ }, () => ({ path: e }));
        },
      },
      {
        name: "node-builtins-external",
        setup(build) {
          build.onResolve(
            { filter: /^node:/ },
            (a) => ({ path: a.path, external: true }),
          );
        },
      },
      ...denoPlugins({
        configPath: new URL("deno.json", ROOT).pathname,
        nodeModulesDir: "manual",
      }),
    ],
    absWorkingDir: ROOT.pathname,
    entryPoints: [new URL(entry, HERE).pathname],
    bundle: true,
    format: "esm",
    platform: "browser",
    conditions: ["browser"],
    target: "es2022",
    write: false,
  });
  return out.outputFiles[0].text;
};

// Build the FULL playground bundle the page loads (main.ts → Monaco + the
// compiler + the LSP adapter). We don't evaluate it (Monaco needs the DOM), but
// building it confirms Monaco bundles through the deno-loader pipeline with the
// CSS/`.ttf` loaders — the headline E/Monaco integration risk. Asserts the JS +
// the sibling CSS (Monaco's styles) are both emitted.
const verifyFullBundleBuilds = async (): Promise<void> => {
  const out = await esbuild.build({
    plugins: [
      {
        name: "binaryen-esm",
        setup(build) {
          const e = binaryenEntry();
          build.onResolve({ filter: /^binaryen$/ }, () => ({ path: e }));
        },
      },
      {
        name: "node-builtins-external",
        setup(build) {
          build.onResolve(
            { filter: /^node:/ },
            (a) => ({ path: a.path, external: true }),
          );
        },
      },
      ...denoPlugins({
        configPath: new URL("deno.json", ROOT).pathname,
        nodeModulesDir: "manual",
      }),
    ],
    absWorkingDir: ROOT.pathname,
    entryPoints: [new URL("src/main.ts", HERE).pathname],
    bundle: true,
    format: "esm",
    platform: "browser",
    conditions: ["browser"],
    target: "es2022",
    loader: { ".ttf": "dataurl" },
    // An `outdir` (vs an `outfile`) is needed so esbuild has an output path for
    // the CSS asset Monaco's imports produce; `write: false` keeps it in memory.
    outdir: new URL("dist", HERE).pathname,
    write: false,
  });
  const js = out.outputFiles.find((f) => f.path.endsWith(".js"));
  const css = out.outputFiles.find((f) => f.path.endsWith(".css"));
  if (!js || js.text.length === 0) fail("full bundle emitted no JS");
  if (!css || css.text.length === 0) {
    fail("full bundle emitted no CSS (Monaco styles missing)");
  }
  // The page must register the `vital` language + the LSP providers.
  for (const needle of [
    "registerHoverProvider",
    "registerDocumentSemanticTokensProvider",
    "setModelMarkers",
    "registerInlayHintsProvider",
    "registerDefinitionProvider",
  ]) {
    if (!js!.text.includes(needle)) {
      fail(`full bundle is missing the \`${needle}\` wiring`);
    }
  }
  console.error(
    `OK: full bundle builds (js ${(js!.text.length / 1e6).toFixed(1)}MB, ` +
      `css ${(css!.text.length / 1e3).toFixed(0)}KB) with all LSP providers wired`,
  );
};

const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  esbuild.stop();
  Deno.exit(1);
};

const main = async (): Promise<void> => {
  console.error("bundling DOM-free core (browser settings)…");
  const code = await bundleCore("src/playground.ts");

  // Import the freshly built browser bundle. Evaluating it runs binaryen's
  // top-level await — the same instantiation a page performs on load. Write it to
  // a real temp file rather than a data: URL so `import.meta.url` is a file URL:
  // under Deno, binaryen's Emscripten glue detects `globalThis.process` and takes
  // its node branch (`createRequire(import.meta.url)`), which rejects data: URLs.
  // In a browser `process` is undefined and that branch is skipped — so this is a
  // Deno-host detail, not a browser concern; either way the SAME bundled binaryen
  // + compiler codegen is what runs here.
  const tmp = await Deno.makeTempFile({ suffix: ".mjs" });
  await Deno.writeTextFile(tmp, code);
  const mod = await import(
    new URL(`file://${tmp}`).href
  ) as typeof import("./src/playground.ts");
  console.error("bundle evaluated (binaryen instantiated)");

  // 1. A clean program compiles, runs, and logs.
  const ok = await mod.runProgram(
    `print(42)\nlet s = 0\nwhile s < 10 { s = s + 1 }\nprint(s)`,
    { wat: true },
  );
  if (ok.diagnostics.some((d) => d.severity === "error")) {
    fail(`clean program produced errors: ${JSON.stringify(ok.diagnostics)}`);
  }
  if (!ok.compiled) fail("clean program did not compile to wasm");
  if (ok.logs.join(",") !== "42,10") {
    fail(`unexpected log output: ${JSON.stringify(ok.logs)}`);
  }
  if (!ok.wat || !ok.wat.includes("(module")) {
    fail(`WAT was not emitted: ${ok.wat?.slice(0, 80)}`);
  }
  console.error(
    `OK: clean run -> logs ${JSON.stringify(ok.logs)}, WAT emitted`,
  );

  // 2. A broken program yields an error diagnostic with a real position.
  const bad = await mod.runProgram(`let n: i32 = "nope"`);
  const err = bad.diagnostics.find((d) => d.severity === "error");
  if (!err) fail("broken program produced no error diagnostic");
  if (bad.compiled) fail("broken program should not have compiled");
  console.error(
    `OK: broken run -> error at ${err!.range.start.line + 1}:${
      err!.range.start.character + 1
    } "${err!.message}"`,
  );

  // 3. The browser-side LSP adapter (pure, DOM-free) — bundle + evaluate it the
  // same way, then exercise the providers the page wires onto Monaco. This is the
  // "language server" running client-side: diagnostics, semantic tokens, hover.
  console.error("\nbundling the browser LSP adapter (DOM-free)…");
  const lspCode = await bundleCore("src/lspAdapter.ts");
  const lspTmp = await Deno.makeTempFile({ suffix: ".mjs" });
  await Deno.writeTextFile(lspTmp, lspCode);
  const lsp = await import(
    new URL(`file://${lspTmp}`).href
  ) as typeof import("./src/lspAdapter.ts");

  const src = `let x = 41\nlet _unused = 1\nprint(x + 1)\n`;

  // Diagnostics: the unused `_unused` binding is a B17 lint hint tagged
  // `unnecessary` (the greyed-out lint the editor surfaces).
  const diags = lsp.diagnostics(src);
  const unused = diags.find((d) => d.tags?.includes("unnecessary"));
  if (!unused) {
    fail(`no \`unnecessary\`-tagged lint produced: ${JSON.stringify(diags)}`);
  }
  console.error(`OK: diagnostics -> B17 lint "${unused!.message}" (unnecessary)`);

  // Semantic tokens: a non-empty, well-formed (multiple-of-5) delta stream.
  const tokens = lsp.semanticTokens(src);
  if (tokens.length === 0 || tokens.length % 5 !== 0) {
    fail(`malformed semantic-token data (len ${tokens.length})`);
  }
  console.error(`OK: semantic tokens -> ${tokens.length / 5} tokens`);

  // Hover: the type of `x` (line 0, on the `x`) is `i32`.
  const hov = lsp.hover(src, { line: 0, character: 4 });
  if (!hov || !hov.contents.includes("x: i32")) {
    fail(`hover did not resolve x: i32 (got ${JSON.stringify(hov)})`);
  }
  console.error(`OK: hover -> "${hov!.contents}"`);

  // Stretch: inlay hints (inferred `: i32` for the unannotated `x`) and
  // go-to-definition (a use of `x` jumps to its declaration on line 0).
  const hints = lsp.inlayHints(src, {
    start: { line: 0, character: 0 },
    end: { line: 10, character: 0 },
  });
  if (!hints.some((h) => h.label.includes("i32"))) {
    fail(`no inlay hint with an inferred type: ${JSON.stringify(hints)}`);
  }
  const def = lsp.definition(src, { line: 2, character: 6 }); // the `x` in print
  if (!def || def.start.line !== 0) {
    fail(`go-to-definition did not jump to the decl: ${JSON.stringify(def)}`);
  }
  console.error(
    `OK: inlay hints -> ${hints.length}, definition -> line ${def!.start.line + 1}`,
  );

  // 4. The full page bundle (main.ts + Monaco) builds with the LSP wiring.
  console.error("\nbuilding the full page bundle (Monaco + providers)…");
  await verifyFullBundleBuilds();

  console.error(
    "\nALL CHECKS PASSED — binaryen + the client-side LSP run via the bundle.",
  );
  esbuild.stop();
};

await main();

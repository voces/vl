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
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";

const HERE = new URL(".", import.meta.url);
const ROOT = new URL("../", HERE);

// The self-hosted seed the playground's LSP features run on. Built by
// `./scripts/refresh-compiler.sh`; absent on a fresh clone, in which case the
// seed-backed feature checks self-skip (the same convention as the wasm test
// suites), and the page would likewise disable those features.
const SEED = new URL("build/vl-compiler.wasm", ROOT).pathname;

// Build a checker over the on-disk seed (the headless analogue of
// `wasmCheckerBrowser.ts`'s fetch), or undefined when the seed isn't built.
const loadSeedChecker = () => {
  let bytes: Uint8Array;
  try {
    bytes = Deno.readFileSync(SEED);
  } catch {
    return undefined;
  }
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(bytes as BufferSource),
    {},
  );
  const exports = instance.exports as unknown as Exports;
  return createWasmChecker(() => exports);
};

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
          build.onResolve({ filter: /^binaryen$/ }, () => Promise.resolve({ path: e }));
        },
      },
      {
        name: "node-builtins-external",
        setup(build) {
          build.onResolve(
            { filter: /^node:/ },
            (a) => Promise.resolve({ path: a.path, external: true }),
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
          build.onResolve({ filter: /^binaryen$/ }, () => Promise.resolve({ path: e }));
        },
      },
      {
        name: "node-builtins-external",
        setup(build) {
          build.onResolve(
            { filter: /^node:/ },
            (a) => Promise.resolve({ path: a.path, external: true }),
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
    "registerCodeActionProvider",
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

  // Import the freshly built browser bundle. Write it to a real temp file rather
  // than a data: URL so `import.meta.url` is a file URL: under Deno, binaryen's
  // Emscripten glue (lazily imported by `wasmToWat`) detects `globalThis.process`
  // and takes its node branch (`createRequire(import.meta.url)`), which rejects
  // data: URLs. In a browser `process` is undefined and that branch is skipped —
  // a Deno-host detail, not a browser concern; either way the SAME bundled
  // binaryen renders the WAT below.
  const tmp = await Deno.makeTempFile({ suffix: ".mjs" });
  await Deno.writeTextFile(tmp, code);
  const mod = await import(
    new URL(`file://${tmp}`).href
  ) as typeof import("./src/playground.ts");
  console.error("bundle evaluated");

  // The Run path compiles on the self-hosted seed (the headless analogue of the
  // page's fetch — build it from the on-disk seed). Absent → skip the run checks.
  const runChecker = loadSeedChecker();
  if (runChecker === undefined) {
    console.error(
      "SKIP: compiler seed not built (./scripts/refresh-compiler.sh) — " +
        "Run-path checks skipped",
    );
  } else {
    // 1. A clean program compiles (seed codegen), runs (the pure `runWasm` host
    // ABI), and logs; WAT is rendered by binaryen (lazily loaded in the bundle).
    const ok = await mod.runProgram(
      `print(42)\nlet s = 0\nwhile s < 10 { s = s + 1 }\nprint(s)`,
      runChecker,
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
    const bad = await mod.runProgram(`let n: i32 = "nope"`, runChecker);
    const err = bad.diagnostics.find((d) => d.severity === "error");
    if (!err) fail("broken program produced no error diagnostic");
    if (bad.compiled) fail("broken program should not have compiled");
    console.error(
      `OK: broken run -> error at ${err!.range.start.line + 1}:${
        err!.range.start.character + 1
      } "${err!.message}"`,
    );
  }

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

  // Every LSP feature now runs on the wasm checker the page injects via `initLsp`
  // — diagnostics included (seed `check` + `lint`). Headless we build the checker
  // from the on-disk seed; absent, the whole block self-skips.
  const checker = loadSeedChecker();
  if (checker === undefined) {
    console.error(
      "SKIP: compiler seed not built (./scripts/refresh-compiler.sh) — " +
        "LSP feature checks skipped",
    );
  } else {
    lsp.initLsp(checker);

    // Diagnostics: the unused `_unused` binding is a lint hint tagged
    // `unnecessary` (the greyed-out lint the editor surfaces).
    const diags = await lsp.diagnostics(src);
    const unused = diags.find((d) => d.tags?.includes("unnecessary"));
    if (!unused) {
      fail(`no \`unnecessary\`-tagged lint produced: ${JSON.stringify(diags)}`);
    }
    console.error(`OK: diagnostics -> lint "${unused!.message}" (unnecessary)`);

    // Semantic tokens: a non-empty, well-formed (multiple-of-5) delta stream.
    const tokens = await lsp.semanticTokens(src);
    if (tokens.length === 0 || tokens.length % 5 !== 0) {
      fail(`malformed semantic-token data (len ${tokens.length})`);
    }
    console.error(`OK: semantic tokens -> ${tokens.length / 5} tokens`);

    // Hover: the type of `x` (line 0, on the `x`) is `i32`.
    const hov = await lsp.hover(src, { line: 0, character: 4 });
    if (!hov || !hov.contents.includes("x: i32")) {
      fail(`hover did not resolve x: i32 (got ${JSON.stringify(hov)})`);
    }
    console.error(`OK: hover -> "${hov!.contents}"`);

    // Stretch: inlay hints (inferred `: i32` for the unannotated `x`) and
    // go-to-definition (a use of `x` jumps to its declaration on line 0).
    const hints = await lsp.inlayHints(src, {
      start: { line: 0, character: 0 },
      end: { line: 10, character: 0 },
    });
    if (!hints.some((h) => h.label.includes("i32"))) {
      fail(`no inlay hint with an inferred type: ${JSON.stringify(hints)}`);
    }
    const def = await lsp.definition(src, { line: 2, character: 6 }); // the `x` in print
    if (!def || def.start.line !== 0) {
      fail(`go-to-definition did not jump to the decl: ${JSON.stringify(def)}`);
    }
    console.error(
      `OK: inlay hints -> ${hints.length}, definition -> line ${def!.start.line + 1}`,
    );

    // Completion (D3): scope-aware identifiers at a non-member position, and
    // structural member completion after a `.` receiver — the two halves the Monaco
    // `CompletionItemProvider` (`.`-triggered) wires.
    const idItems = await lsp.completion(src, { line: 2, character: 9 }); // inside print(x + |)
    if (!idItems.some((c) => c.label === "x")) {
      fail(`identifier completion missing in-scope \`x\`: ${JSON.stringify(idItems.map((c) => c.label))}`);
    }
    const memberSrc = `let p = { x: 1, y: 2 }\nprint(p.)\n`;
    const memberItems = await lsp.completion(memberSrc, { line: 1, character: 8 }, ".");
    const memberLabels = memberItems.map((c) => c.label).sort();
    if (memberLabels.join(",") !== "x,y") {
      fail(`member completion after \`p.\` did not list x,y: ${JSON.stringify(memberLabels)}`);
    }
    console.error(
      `OK: completion -> ${idItems.length} identifiers, members after \`.\` -> [${memberLabels.join(", ")}]`,
    );

    // Format (D4): the self-hosted formatter reprints a messily-spaced program.
    const formatted = lsp.format(`let   x=1\nprint( x )\n`);
    if (formatted === undefined || !formatted.includes("let x = 1")) {
      fail(`format did not reprint via the seed: ${JSON.stringify(formatted)}`);
    }
    console.error(`OK: format -> reprinted via the self-hosted formatter`);

    // Quick-fixes (code actions / B17): the unused `x` binding on line 0 offers the
    // `_`-prefix (preferred) + remove-binding fixes; an unused import offers a
    // remove-import fix. Mirrors the editor's "Auto Fix" lightbulb.
    const unusedSrc = `let x = 1\nprint(1)\n`;
    const varFixes = await lsp.codeActions(unusedSrc, {
      start: { line: 0, character: 4 },
      end: { line: 0, character: 4 },
    });
    const preferred = varFixes.find((f) => f.isPreferred);
    if (!preferred || !preferred.title.includes("_")) {
      fail(`unused-variable did not offer the preferred \`_\`-prefix fix: ${JSON.stringify(varFixes)}`);
    }
    if (!varFixes.some((f) => f.title.toLowerCase().includes("remove"))) {
      fail(`unused-variable did not offer a remove-binding fix: ${JSON.stringify(varFixes)}`);
    }
    // `unused-import` is fed explicitly (as an editor marker would carry it) to
    // prove the remove-import dispatch is wired, mirroring `server.ts`.
    const importSrc = `import { add } from "./mathx"\nprint(1)\n`;
    const importRange = {
      start: { line: 0, character: 9 },
      end: { line: 0, character: 12 },
    };
    const importFixes = await lsp.codeActions(importSrc, importRange, [{
      message: "Unused import `add` (remove it)",
      severity: "warning",
      source: "vital",
      code: "unused-import",
      range: importRange,
    }]);
    if (!importFixes.some((f) => f.title.toLowerCase().includes("import"))) {
      fail(`unused-import did not offer a remove-import fix: ${JSON.stringify(importFixes)}`);
    }

    // A never-reassigned `let` offers the `let`→`const` fix (also fed as a marker).
    const constSrc = `let y = 1\nprint(y)\n`;
    const constRange = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 3 },
    };
    const constFixes = await lsp.codeActions(constSrc, constRange, [{
      message: "`let y` is never reassigned; prefer `const`",
      severity: "info",
      source: "vital",
      code: "prefer-const",
      range: constRange,
    }]);
    if (!constFixes.some((f) => f.title.toLowerCase().includes("const"))) {
      fail(`prefer-const did not offer a let→const fix: ${JSON.stringify(constFixes)}`);
    }
    console.error(
      `OK: quick-fixes -> var [${varFixes.map((f) => f.title).join(", ")}], ` +
        `import [${importFixes.map((f) => f.title).join(", ")}], ` +
        `const [${constFixes.map((f) => f.title).join(", ")}]`,
    );
  }

  // 4. The shareable-link encode/decode round-trip (E4).
  // `share.ts` uses only built-in browser APIs (CompressionStream / btoa / atob)
  // that Deno also exposes natively — no bundling needed; import it directly.
  console.error("\nchecking shareable-link round-trip…");
  const share = await import("./src/share.ts");
  const testSrc = `print(42)\nlet x = 1\nprint(x)\n`;
  const hash = await share.encodeSource(testSrc);
  if (!hash.startsWith("#v1:") && !hash.startsWith("#v0:")) {
    fail(`encodeSource produced unexpected prefix: ${hash.slice(0, 20)}`);
  }
  const decoded = await share.decodeHash(hash);
  if (decoded !== testSrc) {
    fail(
      `round-trip mismatch:\n  want: ${JSON.stringify(testSrc)}\n  got:  ${JSON.stringify(decoded)}`,
    );
  }
  // Malformed hash must return null, not throw.
  const bad1 = await share.decodeHash("#v1:!!!not_base64!!!!");
  if (bad1 !== null) fail(`malformed hash decoded to non-null: ${bad1}`);
  const bad2 = await share.decodeHash("");
  if (bad2 !== null) fail(`empty hash decoded to non-null: ${bad2}`);
  console.error(
    `OK: share round-trip -> hash length ${hash.length}, decoded matches source`,
  );

  // 5. Last-session persistence ("remember what we did last"). `projects.ts`
  // touches only `localStorage` (which Deno exposes), so import it directly — no
  // bundling — like `share.ts`. There is ONE remembered session, not a list.
  console.error("\nchecking last-session persistence…");
  const proj = await import("./src/projects.ts");
  // Start clean so prior runs don't skew the assertions.
  proj.clearLastSession();
  if (proj.loadLastSession() !== null) fail("loadLastSession should be null when empty");

  // Round-trip: saving the LIVE (modified) buffers and reloading restores them
  // into the same sample context — a refresh/return keeps your edits.
  proj.saveLastSession({
    sampleIndex: 1,
    files: [{ name: "main.vl", source: "print(1) // my modified edit\n" }],
  });
  const restored = proj.loadLastSession();
  if (!restored) fail("loadLastSession did not restore the saved session");
  if (restored!.sampleIndex !== 1) fail("loadLastSession lost the sample index");
  if (restored!.files[0].source !== "print(1) // my modified edit\n") {
    fail("loadLastSession did not restore the live (modified) buffer");
  }

  // Switching to another sample loads it FRESH and OVERWRITES the last session —
  // the previous edits are gone forever. There is no list: a second save replaces
  // the first.
  proj.saveLastSession({
    sampleIndex: 2,
    files: [{ name: "main.vl", source: "print(2) // a fresh, different sample\n" }],
  });
  const afterSwitch = proj.loadLastSession();
  if (!afterSwitch || afterSwitch.sampleIndex !== 2) {
    fail("switching samples did not overwrite the last session's index");
  }
  if (afterSwitch!.files[0].source !== "print(2) // a fresh, different sample\n") {
    fail("switching samples did not replace the buffers with the fresh sample");
  }
  if (afterSwitch!.files[0].source.includes("my modified edit")) {
    fail("switching samples should discard the previous edits, but they survived");
  }

  // A malformed record decodes to null (defensive), not a throw.
  try {
    localStorage.setItem("vl-last-session", "{not json");
  } catch { /* storage may be unavailable; that's fine */ }
  if (proj.loadLastSession() !== null) fail("malformed session did not decode to null");

  // Clean up so a verify run leaves no residue.
  proj.clearLastSession();
  console.error(
    "OK: last-session -> save/restore round-trip + sample-switch overwrite (edits discarded)",
  );

  // 6. The full page bundle (main.ts + Monaco) builds with the LSP wiring.
  console.error("\nbuilding the full page bundle (Monaco + providers)…");
  await verifyFullBundleBuilds();

  console.error(
    "\nALL CHECKS PASSED — binaryen + the client-side LSP run via the bundle.",
  );
  esbuild.stop();
};

await main();

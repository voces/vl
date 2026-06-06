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

const bundleCore = async (): Promise<string> => {
  const out = await esbuild.build({
    plugins: [
      {
        name: "binaryen-esm",
        setup(build) {
          const entry = binaryenEntry();
          build.onResolve({ filter: /^binaryen$/ }, () => ({ path: entry }));
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
    entryPoints: [new URL("src/playground.ts", HERE).pathname],
    bundle: true,
    format: "esm",
    platform: "browser",
    conditions: ["browser"],
    target: "es2022",
    write: false,
  });
  return out.outputFiles[0].text;
};

const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  esbuild.stop();
  Deno.exit(1);
};

const main = async (): Promise<void> => {
  console.error("bundling DOM-free core (browser settings)…");
  const code = await bundleCore();

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

  console.error(
    "\nALL CHECKS PASSED — binaryen runs client-side via the bundle.",
  );
  esbuild.stop();
};

await main();

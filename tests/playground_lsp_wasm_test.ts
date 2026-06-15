// The browser playground's LSP adapter (`playground/src/lspAdapter.ts`) drives
// the SAME self-hosted seed the Node LSP runs, through the env-agnostic
// `createWasmChecker` core. `playground/verify.ts` proves the full bundled path
// end-to-end, but it isn't part of `deno task test`; these tests pin the adapter
// in CI by injecting a seed-backed checker (the headless analogue of the
// browser's fetch) and exercising each seed-backed feature. They load the real
// seed (`build/vl-compiler.wasm`) — absent (fresh clone, no `refresh-compiler.sh`
// yet) they self-ignore, the same convention as the other wasm suites.

import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import * as lsp from "../playground/src/lspAdapter.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;

// Build a checker over the on-disk seed and wire it into the adapter (what the
// page does via `wasmCheckerBrowser.ts` + `initLsp`). Idempotent across tests —
// `initLsp` just replaces the module-level checker each call.
const initFromSeed = (): void => {
  const bytes = Deno.readFileSync(SEED);
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(bytes as BufferSource),
    {},
  );
  lsp.initLsp(createWasmChecker(() => instance.exports as unknown as Exports));
};

Deno.test({ name: "playground-lsp: hover resolves a binding type off the seed", ignore }, async () => {
  initFromSeed();
  const result = await lsp.hover("let x = 41\nprint(x + 1)\n", { line: 0, character: 4 });
  if (!result || !result.contents.includes("x: i32")) {
    throw new Error(`expected "x: i32", got ${JSON.stringify(result)}`);
  }
});

Deno.test({ name: "playground-lsp: semantic tokens are a well-formed delta stream", ignore }, async () => {
  initFromSeed();
  const data = await lsp.semanticTokens("let x = 1\nprint(x)\n");
  if (data.length === 0 || data.length % 5 !== 0) {
    throw new Error(`malformed semantic-token data (len ${data.length})`);
  }
});

Deno.test({ name: "playground-lsp: inlay hint surfaces the inferred type", ignore }, async () => {
  initFromSeed();
  const hints = await lsp.inlayHints("let x = 41\nprint(x)\n", {
    start: { line: 0, character: 0 },
    end: { line: 10, character: 0 },
  });
  if (!hints.some((h) => h.label.includes("i32"))) {
    throw new Error(`no inferred-type inlay hint: ${JSON.stringify(hints)}`);
  }
});

Deno.test({ name: "playground-lsp: go-to-definition jumps to the declaration", ignore }, async () => {
  initFromSeed();
  // the `x` use on line 1 (`print(x)`) → its decl on line 0.
  const def = await lsp.definition("let x = 41\nprint(x)\n", { line: 1, character: 6 });
  if (!def || def.start.line !== 0) {
    throw new Error(`expected a jump to line 0, got ${JSON.stringify(def)}`);
  }
});

Deno.test({ name: "playground-lsp: identifier completion lists an in-scope binding", ignore }, async () => {
  initFromSeed();
  const items = await lsp.completion("let x = 1\nprint(x)\n", { line: 1, character: 7 });
  if (!items.some((c) => c.label === "x")) {
    throw new Error(`missing in-scope \`x\`: ${JSON.stringify(items.map((c) => c.label))}`);
  }
});

Deno.test({ name: "playground-lsp: member completion lists a struct's fields after `.`", ignore }, async () => {
  initFromSeed();
  const items = await lsp.completion("let p = { x: 1, y: 2 }\nprint(p.)\n", { line: 1, character: 8 }, ".");
  assertEquals(items.map((c) => c.label).sort(), ["x", "y"]);
});

Deno.test({ name: "playground-lsp: format reprints via the self-hosted formatter", ignore }, () => {
  initFromSeed();
  const formatted = lsp.format("let   x=1\nprint( x )\n");
  if (formatted === undefined || !formatted.includes("let x = 1")) {
    throw new Error(`format did not reprint via the seed: ${JSON.stringify(formatted)}`);
  }
});

Deno.test("playground-lsp: features degrade to empty before a seed is wired", async () => {
  lsp.initLsp(undefined);
  assertEquals(await lsp.semanticTokens("let x = 1\n"), []);
  assertEquals(await lsp.hover("let x = 1\n", { line: 0, character: 4 }), null);
  assertEquals(await lsp.definition("let x = 1\n", { line: 0, character: 4 }), null);
  assertEquals(await lsp.completion("let x = 1\n", { line: 0, character: 4 }), []);
  assertEquals(
    await lsp.inlayHints("let x = 1\n", {
      start: { line: 0, character: 0 },
      end: { line: 1, character: 0 },
    }),
    [],
  );
  assertEquals(lsp.format("let x=1\n"), undefined);
});

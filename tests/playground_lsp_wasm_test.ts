// The browser playground's LSP adapter (`playground/src/lspAdapter.ts`) drives
// the SAME self-hosted seed the Node LSP runs, through the env-agnostic
// `createWasmChecker` core. `playground/verify.ts` proves the full bundled path
// end-to-end, but it isn't part of `deno task test`; these tests pin the adapter
// in CI by injecting a seed-backed checker (the headless analogue of the
// browser's fetch) and exercising each seed-backed feature. They load the real
// seed (`build/vl-compiler.wasm`) — absent (fresh clone, no `refresh-compiler.sh`
// yet) they self-ignore, the same convention as the other wasm suites.

import { createWasmChecker, type Exports, type WasmChecker } from "../lsp/src/wasmChecker.ts";
import * as lsp from "../playground/src/lspAdapter.ts";
import { runProgram } from "../playground/src/playground.ts";

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

// A bare seed-backed checker (no LSP wiring) — for the Run-path tests, which call
// `checker.compile` / `runProgram(…, checker)` directly.
const seedChecker = (): WasmChecker => {
  const bytes = Deno.readFileSync(SEED);
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(bytes as BufferSource),
    {},
  );
  return createWasmChecker(() => instance.exports as unknown as Exports);
};

const noSiblings = () => undefined;

Deno.test({ name: "playground-run: compile emits wasm bytes for a clean program", ignore }, async () => {
  const { bytes, diagnostics } = await seedChecker().compile("print(1 + 2)\n", "main.vl", noSiblings);
  if (diagnostics.length !== 0) {
    throw new Error(`expected no diagnostics, got: ${diagnostics.map((d) => d.message).join("; ")}`);
  }
  if (bytes === undefined || bytes.length === 0) throw new Error("expected non-empty wasm bytes");
  // A real wasm module starts with the `\0asm` magic.
  assertEquals([...bytes.slice(0, 4)], [0x00, 0x61, 0x73, 0x6d], "wasm magic");
});

Deno.test({ name: "playground-run: compile yields no bytes + a diagnostic on a type error", ignore }, async () => {
  const { bytes, diagnostics } = await seedChecker().compile('const x: i32 = "no"\n', "main.vl", noSiblings);
  if (bytes !== undefined) throw new Error("expected no bytes for a type error");
  if (diagnostics.length === 0) throw new Error("expected a diagnostic");
});

Deno.test({ name: "playground-run: an EMIT-stage failure yields a POSITIONED error diagnostic", ignore }, async () => {
  // The squiggle pass (`check`) runs parse+type only; an emit-stage failure
  // surfaces solely under codegen (`compile`). Before the span fix it was
  // positionless (line 0), so the playground counted "1 error" yet the
  // Diagnostics pane — which the Run verdict points at — rendered nothing. Now the
  // diagnostic anchors at the failing function's declaration (`useIt`, line 4 →
  // LSP 0-based line 3), so the pane has a real location to show.
  const src = "function makeIt(): (i32) => {f: i64[] | null} {\n" +
    "  return (q0) => ({ f: [1, 2] })\n" +
    "}\n" +
    "function useIt() {\n" +
    "  const v: (i32) => {f: i64[] | null} = makeIt()\n" +
    "  const s = v(1)\n" +
    "  print(0)\n" +
    "}\n" +
    "useIt()\n";
  const { bytes, diagnostics } = await seedChecker().compile(src, "main.vl", noSiblings);
  if (bytes !== undefined) throw new Error("expected no bytes for an emit-stage failure");
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length !== 1) {
    throw new Error(`expected 1 emit error, got: ${JSON.stringify(diagnostics)}`);
  }
  // Positioned (not the old positionless line-0/col-0 span) — anchored at `useIt`.
  assertEquals(errors[0].range.start.line, 3, "emit error anchors at useIt's line");
  if (errors[0].range.start.character <= 0) {
    throw new Error(`expected a non-zero column, got ${errors[0].range.start.character}`);
  }
});

Deno.test({ name: "playground-run: runProgram compiles + runs + captures print output", ignore }, async () => {
  const result = await runProgram("print(42)\nlet s = 0\nwhile s < 10 { s = s + 1 }\nprint(s)\n", seedChecker());
  if (result.diagnostics.some((d) => d.severity === "error")) {
    throw new Error(`unexpected errors: ${JSON.stringify(result.diagnostics)}`);
  }
  if (!result.compiled) throw new Error("expected a compiled module");
  assertEquals(result.logs, ["42", "10"], "captured print output");
});

Deno.test({ name: "playground-lsp: cross-file hover resolves imported names + dependent locals", ignore }, async () => {
  // The regression: a single-file LSP can't see `./mathx`, so `add`/`square`
  // (imported) come back untyped and `r` (whose type depends on them) collapses —
  // only `print` (a static builtin) worked. With the project files wired as the
  // workspace reader, the importer's graph resolves like it does in VS Code.
  const main = `import { add, square } from "./mathx"\nlet r = add(square(3), 4)\nprint(r)\n`;
  const mathx =
    `export function add(a: i32, b: i32): i32 {\n  return a + b\n}\nexport function square(n: i32): i32 {\n  return n * n\n}\n`;
  lsp.setWorkspace(() => ({ "main.vl": main, "mathx.vl": mathx }));
  try {
    initFromSeed();
    // `add` use on line 1 (`let r = add(...)`), 'add' at col 8 → its function type.
    const addHover = await lsp.hover(main, { line: 1, character: 8 }, "main.vl");
    if (!addHover || !addHover.contents.includes("add: (i32, i32) -> i32")) {
      throw new Error(`add hover (cross-file): ${JSON.stringify(addHover)}`);
    }
    // `r` decl on line 1, col 4 → i32 — inferred only when add/square resolve.
    const rHover = await lsp.hover(main, { line: 1, character: 4 }, "main.vl");
    if (!rHover || !rHover.contents.includes("r: i32")) {
      throw new Error(`r hover (depends on cross-file): ${JSON.stringify(rHover)}`);
    }
  } finally {
    lsp.setWorkspace(() => ({})); // reset so the other tests run single-file
  }
});

Deno.test({ name: "playground-lsp: go-to-definition jumps cross-file to an imported name's source", ignore }, async () => {
  // The regression: definitionAt returns the imported name's canonical decl span
  // (in the DEPENDENCY) with no module, so the host landed on the current file's
  // import line. The cross-file `importedNameSources` jump must win for imports.
  const main = `import { add, square } from "./mathx"\nlet r = add(square(3), 4)\nprint(r)\n`;
  const mathx =
    `export function add(a: i32, b: i32): i32 {\n  return a + b\n}\nexport function square(n: i32): i32 {\n  return n * n\n}\n`;
  lsp.setWorkspace(() => ({ "main.vl": main, "mathx.vl": mathx }));
  try {
    initFromSeed();
    // `add` use on line 1, col 8 → mathx.vl, the `add` decl (line 0, col 16).
    const addDef = await lsp.definition(main, { line: 1, character: 8 }, "main.vl");
    assertEquals(addDef?.file, "mathx.vl", "cross-file target");
    assertEquals(addDef?.start, { line: 0, character: 16 }, "add decl position in mathx");
    // A local use stays in-file (no `file`): `r` use on line 2 → its decl line 1.
    const rDef = await lsp.definition(main, { line: 2, character: 6 }, "main.vl");
    if (rDef?.file !== undefined) throw new Error(`local def should not be cross-file: ${JSON.stringify(rDef)}`);
    assertEquals(rDef?.start, { line: 1, character: 4 }, "r decl position");
  } finally {
    lsp.setWorkspace(() => ({}));
  }
});

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

// Playground completion parity: the browser `lspAdapter.completion` export is the
// Monaco-free bridge `main.ts`'s `registerCompletionItemProvider` consumes. It
// mirrors `server.ts`'s `onCompletion` (D3): member completion after a `.`
// receiver, scope-aware identifier completion otherwise (plus keyword + snippet
// items). As of the playground wasm migration it drives the SAME self-hosted
// seed the Node LSP runs (injected via `initLsp`, the headless analogue of the
// browser's fetch) — so these drive the pure adapter export directly (it imports
// no Monaco) against the real seed, and self-ignore when the seed isn't built
// (`./scripts/refresh-compiler.sh`), the same convention as the wasm suites.
//
// Position convention: the adapter takes LSP 0-based line / 0-based character
// (the wire form `server.ts` speaks); `main.ts` bridges Monaco's 1-based coords.
//
// Run with:
//   deno test -A --no-check tests/playground_completion_test.ts
// (also included in `deno task test`).

import { type CompletionItem, completion, initLsp } from "../playground/src/lspAdapter.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";

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

// Wire a seed-backed checker into the adapter (the page does this via
// `wasmCheckerBrowser.ts` + `initLsp`). Called at the top of each test; `initLsp`
// just replaces the module-level checker.
const init = (): void => {
  const bytes = Deno.readFileSync(SEED);
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(bytes as BufferSource),
    {},
  );
  initLsp(createWasmChecker(() => instance.exports as unknown as Exports));
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const labels = (cs: CompletionItem[]) => cs.map((c) => c.label);
const find = (cs: CompletionItem[], label: string) =>
  cs.find((c) => c.label === label);

// ---- member completion (after `.`) -----------------------------------------

Deno.test({ name: "completion: member completion after `.` lists a struct's fields", ignore }, async () => {
  init();
  // `p.` should offer the object's fields, NOT keywords/snippets.
  const src = "let p = { x: 1, y: 2 }\nconst v = p.\n";
  // Cursor at the end of line 2 (0-based line 1), just past the `.`.
  const cs = await completion(src, { line: 1, character: 12 }, ".");
  assertEquals(labels(cs).sort(), ["x", "y"], "fields of `p`");
  assertEquals(find(cs, "x")?.kind, "variable", "a plain field is a variable");
  // Member items carry the inline type detail + a highlighted documentation block,
  // never a keyword/snippet kind.
  assertEquals(find(cs, "x")?.labelDetail, ": i32");
  assert(
    cs.every((c) => c.kind !== "keyword" && c.kind !== "snippet"),
    "no keywords/snippets mixed into member completion",
  );
  assert(
    cs.every((c) => c.insertText === undefined),
    "member items insert their label (no snippet insertText)",
  );
});

Deno.test({ name: "completion: member completion resolves a parameter's declared object type", ignore }, async () => {
  init();
  const src = "type Point = { x: i32, y: i32 }\n" +
    "function f(p: Point): i32 {\n" +
    "  return p.\n" +
    "}\n";
  // Line 3 (0-based 2), just past `p.`.
  const cs = await completion(src, { line: 2, character: 11 }, ".");
  assertEquals(labels(cs).sort(), ["x", "y"], "fields of `Point`");
});

Deno.test({ name: "completion: a `.` with no resolvable receiver yields no items", ignore }, async () => {
  init();
  // `nope` isn't declared; an unresolved receiver gives nothing (not wrong items).
  const src = "const v = nope.\n";
  const cs = await completion(src, { line: 0, character: 15 }, ".");
  assertEquals(cs, [], "unknown receiver → empty member list");
});

Deno.test({ name: "completion: a `.` detected from the line prefix (no triggerChar) still completes members", ignore }, async () => {
  init();
  // Monaco fires completion on typing too (not only the `.` trigger); the adapter
  // falls back to the char before the cursor, mirroring `server.ts`.
  const src = "let p = { x: 1 }\nconst v = p.\n";
  const cs = await completion(src, { line: 1, character: 12 }); // no triggerChar
  assertEquals(labels(cs), ["x"], "member detected from the line prefix");
});

// ---- identifier completion (non-member) ------------------------------------

Deno.test({ name: "completion: non-member position offers in-scope identifiers + keywords + snippets", ignore }, async () => {
  init();
  const src = "let a = 1\nfunction f(p: i32): i32 {\n  return \n}\n";
  // Cursor at end of `return ` on line 3 (0-based 2).
  const cs = await completion(src, { line: 2, character: 9 });
  const names = labels(cs);
  // In-scope user bindings present.
  assert(names.includes("a"), "top-level `a` in scope");
  assert(names.includes("f"), "function `f` in scope");
  assert(names.includes("p"), "param `p` in scope inside `f`");
  // Keyword + snippet completions appended for statement-position typing.
  assert(names.includes("return"), "keyword `return` offered");
  assert(
    cs.some((c) => c.kind === "snippet"),
    "snippet completions offered at a non-member position",
  );
  // A snippet item carries tab-stop insertText; a plain identifier doesn't.
  const fnSnippet = cs.find((c) => c.kind === "snippet" && c.label === "function");
  assert(!!fnSnippet?.insertText?.includes("${"), "snippet carries a tab-stop");
});

Deno.test({ name: "completion: a typed binding renders its type inline + in the doc panel", ignore }, async () => {
  init();
  const src = "function f(p: i32): i32 {\n  return \n}\n";
  const cs = await completion(src, { line: 1, character: 9 });
  const p = find(cs, "p");
  assertEquals(p?.labelDetail, ": i32", "inline label detail");
  assertEquals(p?.documentation, "```vital\ni32\n```", "highlighted doc fence");
});

Deno.test({ name: "completion: a local from another function is NOT offered at top level", ignore }, async () => {
  init();
  const src = "function f(): i32 {\n  let b = 1\n  return b\n}\nlet c = 2\n";
  // Cursor at top level on line 5 (0-based 4).
  const cs = await completion(src, { line: 4, character: 9 });
  const names = labels(cs);
  assert(names.includes("c"), "top-level `c` offered");
  assert(names.includes("f"), "function `f` offered");
  assert(!names.includes("b"), "`b` is local to `f` and must not leak to top level");
});

// Editor support for getters (`get x(self: T): R`, property-access-design.md §D3a), off the
// SELF-HOSTED checker: a getter read is a `property` token carrying the `readonly` modifier,
// completion offers the getter with the `property` kind (and never as a UFCS method under its
// minted name), and go-to-definition on `.x` lands on the `get x` declaration. Seed-gated like
// the rest of the wasm suite; the pure conversions run unconditionally.
//   deno test -A --no-check tests/lsp_getter_wasm_test.ts

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  memberCompletionsFromWasm,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensDataFromWasm,
} from "../lsp/src/typeFeatures.ts";

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
const noSiblings = () => undefined;

// Line 3 (0-based) reads the getter `x` at column 8 and the field `a` at column 14.
const SRC = [
  "type V = new { a: i32 }",
  "get x(self: V): i32 { self.a * 2 }",
  "const v: V = { a: 3 }",
  "print(v.x + v.a)",
  "",
].join("\n");

Deno.test("getter tokens: the readonly modifier is in the legend", () => {
  const i = SEMANTIC_TOKEN_LEGEND.tokenModifiers.indexOf("readonly");
  assertEquals(i, 1, "readonly is the second modifier (bit 2)");
});

Deno.test("getter completion: a getter member converts to the property kind", () => {
  const out = memberCompletionsFromWasm([
    { name: "x", detail: "i32", isMethod: false, isGetter: true },
    { name: "a", detail: "i32", isMethod: false },
  ]);
  assertEquals(out.map((c) => [c.name, c.kind]), [["x", "property"], ["a", "variable"]]);
});

Deno.test({ name: "getter tokens: a getter read is a readonly property", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const members = await checker.memberTokensAt!(SRC, "/tmp/g.vl", noSiblings);
  const x = members.find((m) => m.line === 3 && m.char === 8);
  const a = members.find((m) => m.line === 3 && m.char === 14);
  if (x === undefined || a === undefined) {
    throw new Error(`expected member tokens at 3:8 and 3:14, got ${JSON.stringify(members)}`);
  }
  assertEquals([x.isMethod, x.isGetter], [false, true], "`.x` reads a getter");
  assertEquals([a.isMethod, a.isGetter], [false, false], "`.a` reads a field");
  // Encoded alone, the getter token is `property` (index 10) with modifier bit 2.
  const data = semanticTokensDataFromWasm([], [], [x]);
  assertEquals(data, [3, 8, 1, 10, 2], "property + readonly");
});

Deno.test({ name: "getter completion: offered as a property", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // The server strips the trailing `.`, leaving the receiver as a bare expression.
  const repaired = SRC.replace("print(v.x + v.a)", "v\nprint(1)");
  const members = await checker.memberCompletionsAt(repaired, "/tmp/g.vl", noSiblings, 3, 0);
  const x = members.find((m) => m.name === "x");
  if (x === undefined) throw new Error(`expected a getter \`x\`, got ${JSON.stringify(members)}`);
  assertEquals([x.isMethod, x.isGetter, x.detail], [false, true, "i32"]);
  const names = members.map((m) => m.name).sort();
  assertEquals(names, ["a", "x"], "the field and the getter, and no minted name");
  const ufcs = await checker.ufcsCandidatesAt?.(repaired, "/tmp/g.vl", noSiblings, 3, 0) ?? [];
  if (ufcs.some((c) => c.name.includes("."))) {
    throw new Error(`a getter leaked into the UFCS candidates: ${JSON.stringify(ufcs)}`);
  }
});

Deno.test({ name: "getter definition: `.x` jumps to the `get x` declaration", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const def = await checker.definitionAt(SRC, "/tmp/g.vl", noSiblings, 3, 8);
  assertEquals(def, { start: { line: 1, character: 4 }, end: { line: 1, character: 5 } });
});

// D9.3 document symbols (flat outline): functions + module-level `let`/`const`
// off the SELF-HOSTED checker's decl-flagged identifier tokens (`tokensAt`),
// `type` aliases off the host line scan, exported flags off `moduleSurface` —
// assembled by the pure `flatDocumentSymbols` (typeFeatures.ts). Flat is the
// shipped grade (nesting needs a body-extent seed export). The seed-backed
// tests load the real seed (`build/vl-compiler.wasm`); absent they
// self-ignore, the same convention as the rest of the wasm suite.

import {
  flatDocumentSymbols,
  type IdentToken,
} from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

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
const log = (_m: string) => {};

// ---- pure assembly ----------------------------------------------------------

// Line 0: a function decl; line 1: a module `let`; line 2: an indented local
// `let` (excluded); line 3: a `const`; line 4: a parameter token (excluded).
const pureSrc = "function f(n: i32): i32 {\n" +
  "let total = 1\n" +
  "  let inner = 2\n" +
  "export const limit = 9\n" +
  "type Point = { x: i32 }\n";
const tok = (
  line: number,
  char: number,
  length: number,
  bindKind: number,
  isDecl = true,
): IdentToken => ({ line, char, length, bindKind, isDecl });

Deno.test("document-symbols: functions and module-level values in, locals/params out", () => {
  const idents = [
    tok(0, 9, 1, 2), // f — function decl
    tok(0, 11, 1, 1), // n — parameter decl (excluded)
    tok(1, 4, 5, 0), // total — module-level let
    tok(2, 6, 5, 0), // inner — indented local (excluded)
    tok(3, 13, 5, 0), // limit — exported const
    tok(1, 4, 5, 0, false), // a USE of total (excluded: not a decl)
  ];
  const syms = flatDocumentSymbols(idents, pureSrc, new Set(["limit"]));
  const names = syms.map((s) => `${s.name}:${s.kind}`);
  const want = [
    "f:function",
    "total:variable",
    "limit:constant",
    "Point:type",
  ];
  if (JSON.stringify(names) !== JSON.stringify(want)) {
    throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(names)}`);
  }
  // The exported flag: `limit` via the surface set, `Point` via its own
  // `export` prefix — which this source does NOT carry, so Point is local...
  const limit = syms.find((s) => s.name === "limit")!;
  if (!limit.exported) throw new Error("limit must be marked exported");
  const point = syms.find((s) => s.name === "Point")!;
  if (point.exported) throw new Error("Point (no export prefix) is not exported");
  // ...and the type name's span points at the name, not the keyword.
  if (point.line !== 4 || point.char !== 5 || point.length !== 5) {
    throw new Error(
      `want Point at 4:5 len 5, got ${point.line}:${point.char} len ${point.length}`,
    );
  }
});

Deno.test("document-symbols: an exported type alias reads its own prefix", () => {
  const src = "export type Shape = { r: f64 }\n";
  const syms = flatDocumentSymbols([], src, new Set());
  if (syms.length !== 1 || syms[0].name !== "Shape" || !syms[0].exported) {
    throw new Error(`want exported Shape, got ${JSON.stringify(syms)}`);
  }
  if (syms[0].char !== 12) {
    throw new Error(`want the name span at col 12, got ${syms[0].char}`);
  }
});

Deno.test("document-symbols: sorted by position", () => {
  const idents = [tok(3, 13, 5, 0), tok(0, 9, 1, 2)];
  const syms = flatDocumentSymbols(idents, pureSrc, new Set());
  if (syms.map((s) => s.line).join(",") !== "0,3,4") {
    throw new Error(`want lines 0,3,4, got ${syms.map((s) => s.line)}`);
  }
});

// ---- seed-backed: real tokens over a real module ----------------------------

const src = "export function add(a: i32, b: i32): i32 {\n" +
  "  a + b\n" +
  "}\n" +
  "let total = 3\n" +
  "const limit = 9\n" +
  "type Point = { x: i32, y: i32 }\n" +
  "function helper(): i32 {\n" +
  "  let inner = 1\n" +
  "  inner\n" +
  "}\n" +
  "print(add(total, limit) + helper())\n";
const key = "/proj/main.vl";
const read = (k: string): string | undefined => (k === key ? src : undefined);

Deno.test({
  name: "document-symbols(wasm): the flat outline of a real module",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const idents = await checker.tokensAt(src, key, read);
  if (idents.length === 0) throw new Error("want identifier tokens from the seed");
  const exported = new Set(
    checker.moduleSurface(src, key).exports.map((e) => e.name),
  );
  const syms = flatDocumentSymbols(idents, src, exported);
  const names = syms.map((s) => `${s.name}:${s.kind}`);
  const want = [
    "add:function",
    "total:variable",
    "limit:constant",
    "Point:type",
    "helper:function",
  ];
  if (JSON.stringify(names) !== JSON.stringify(want)) {
    throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(names)}`);
  }
  const add = syms.find((s) => s.name === "add")!;
  if (!add.exported) throw new Error("add must carry the exported flag");
  if (syms.some((s) => s.name === "inner" || s.name === "a" || s.name === "b")) {
    throw new Error(`locals/params leaked into the outline: ${names}`);
  }
  // The name span: `add` on line 0 after `export function ` (16 cols).
  if (add.line !== 0 || add.char !== 16 || add.length !== 3) {
    throw new Error(`want add at 0:16 len 3, got ${add.line}:${add.char}`);
  }
});

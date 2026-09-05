// D9.3 document symbols, both grades, plus the seed export they now rest on.
//
// The NESTED outline (`nestedDocumentSymbols`) is built from `declExtentsAt` —
// the compiler's AST walk (`compiler/extents.vl`) — so a symbol's `range` is the
// whole declaration and a nested one is a child. The FLAT outline
// (`flatDocumentSymbols`) is the degraded path a seed without that export leaves,
// off the decl-flagged identifier tokens (`tokensAt`) plus a `type` line scan.
// Both take the exported flag from `moduleSurface`.
//
// The seed-backed tests load the real seed (`build/vl-compiler.wasm`); absent
// they self-ignore, the same convention as the rest of the wasm suite.

import {
  flatDocumentSymbols,
  type IdentToken,
  nestedDocumentSymbols,
  type OutlineNode,
} from "../lsp/src/typeFeatures.ts";
import type { WasmExtent } from "../lsp/src/wasmChecker.ts";
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

// ---- the nested outline, over extents supplied as data ----------------------

const eq = (got: unknown, want: unknown, what: string): void => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

const at = (line: number, character: number) => ({ line, character });
const extent = (
  kind: WasmExtent["kind"],
  name: string,
  parent: number,
  hdr: [number, number],
  from: [number, number],
  to: [number, number],
): WasmExtent => ({
  kind,
  name,
  parent,
  header: at(hdr[0], hdr[1]),
  range: { start: at(from[0], from[1]), end: at(to[0], to[1]) },
});

/** `name:kind(child, …)` — the tree shape as one string. */
const shape = (nodes: readonly OutlineNode[]): string =>
  nodes
    .map((n) =>
      n.children.length === 0
        ? `${n.name}:${n.kind}`
        : `${n.name}:${n.kind}(${shape(n.children)})`
    )
    .join(",");

Deno.test("nested-symbols: a block is not a symbol, and its contents re-parent", () => {
  const syms = nestedDocumentSymbols([
    extent("function", "outer", -1, [0, 9], [0, 0], [6, 1]),
    extent("block-if", "", 0, [1, 2], [1, 2], [5, 3]),
    extent("function", "inner", 1, [2, 13], [2, 4], [4, 5]),
  ], new Set());
  eq(shape(syms), "outer:function(inner:function)", "the if block vanished");
});

Deno.test("nested-symbols: a lambda bound to a const is the const, not a second entry", () => {
  const bound = nestedDocumentSymbols([
    extent("const", "f", -1, [0, 6], [0, 0], [2, 1]),
    extent("lambda", "", 0, [0, 10], [0, 10], [2, 1]),
  ], new Set());
  eq(shape(bound), "f:constant", "one entry for a const-bound lambda");
  // A callback lambda has no binding to be named by, so it keeps its own entry.
  const free = nestedDocumentSymbols([
    extent("function", "g", -1, [0, 9], [0, 0], [4, 1]),
    extent("lambda", "", 0, [1, 12], [1, 12], [3, 3]),
  ], new Set());
  eq(shape(free), "g:function((lambda):function)", "the callback shows");
});

Deno.test("nested-symbols: range is the declaration, selection is the name", () => {
  const syms = nestedDocumentSymbols(
    [extent("function", "add", -1, [0, 16], [0, 0], [2, 1])],
    new Set(["add"]),
  );
  const s = syms[0];
  eq(s.range, { start: at(0, 0), end: at(2, 1) }, "range spans the declaration");
  eq(s.selection, { start: at(0, 16), end: at(0, 19) }, "selection is the name");
  if (!s.exported) throw new Error("add is in the export set");
});

Deno.test("nested-symbols: an empty export set leaves flags false, drops nothing", () => {
  const syms = nestedDocumentSymbols(
    [extent("type", "Point", -1, [0, 12], [0, 0], [2, 1])],
    new Set(),
  );
  eq(shape(syms), "Point:type", "the entry survives a degraded surface");
  if (syms[0].exported) throw new Error("no surface means no exported flag");
});

// ---- seed-backed: real extents over a real module ---------------------------

const extSrc = [
  'import { fmt } from "std:fmt"', //      0
  "", //                                   1
  "export type Point = {", //              2
  "  x: i32,", //                          3
  "}", //                                  4
  "", //                                   5
  "const LIMIT = 9", //                    6
  "", //                                   7
  "export function classify(", //          8
  "  n: i32,", //                          9
  "): string {", //                       10
  "  if n > LIMIT {", //                  11
  '    return "big"', //                  12
  "  } else {", //                        13
  "    let step = (k: i32): i32 => {", //  14
  "      k * 2", //                       15
  "    }", //                             16
  "    for i in 0 to 3 {", //             17
  "      fmt(step(i))", //                18
  "    }", //                             19
  "  }", //                               20
  '  "other"', //                         21
  "}", //                                 22
  "", //                                  23
  "print(classify(1))", //                24
  "",
].join("\n");

Deno.test({ name: "extents(wasm): the shape of a real module", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  const rows = checker.declExtentsAt(extSrc);
  const got = rows.map((r) =>
    `${r.kind}:${r.name}@${r.header.line}:${r.header.character}` +
    `[${r.range.start.line}..${r.range.end.line}]<${r.parent}`
  );
  const want = [
    "type:Point@2:12[2..4]<-1",
    "const:LIMIT@6:6[6..6]<-1",
    "function:classify@8:16[8..22]<-1",
    "block-if:@11:2[11..13]<2",
    "block-else:@13:4[13..20]<2",
    "lambda:@14:15[14..16]<4",
    "block-for:@17:4[17..19]<4",
  ];
  eq(got, want, "kind, name, header, range and parent of every row");
});

Deno.test({
  name: "extents(wasm): a declaration range opens at its export keyword",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, log)!;
  const fn = checker.declExtentsAt(extSrc).find((r) => r.name === "classify")!;
  if (fn.range.start.character !== 0) {
    throw new Error(`want col 0, got ${fn.range.start.character}`);
  }
  // …and the header still points at the name, which is what an editor selects.
  if (fn.header.character !== 16) {
    throw new Error(`want the name at col 16, got ${fn.header.character}`);
  }
});

Deno.test({
  name: "extents(wasm): a half-typed block yields the extents that CLOSED",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The editor asks on every keystroke, so a file mid-edit is the normal input:
  // `b` is unclosed and its `if` never closes. Nothing may throw.
  const rows = checker.declExtentsAt(
    "function a() {\n  x()\n}\n\nfunction b() {\n  if y {\n    z()\n",
  );
  const names = rows.filter((r) => r.kind === "function").map((r) => r.name);
  eq(names, ["a", "b"], "both functions still report");
  const a = rows.find((r) => r.name === "a")!;
  if (a.range.end.line !== 2) {
    throw new Error(`the closed function keeps its own end: ${a.range.end.line}`);
  }
  if (!rows.some((r) => r.kind === "block-if")) {
    throw new Error("the unclosed if must still produce a row");
  }
});

Deno.test({
  name: "extents(wasm): a file that does not typecheck still outlines",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `undefinedFn` resolves to nothing: a `vl check` error, not a parse one. The
  // walk runs before the checker, so it answers anyway.
  const rows = checker.declExtentsAt(
    'function broken(): i32 {\n  undefinedFn("s")\n}\n',
  );
  eq(rows.map((r) => `${r.kind}:${r.name}`), ["function:broken"], "one row");
});

Deno.test({
  name: "extents(wasm): a document with no declarations produces no rows",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const src of ["", "\n\n", "}}}\n", "print(1)\n"]) {
    const rows = checker.declExtentsAt(src);
    if (rows.length !== 0) {
      throw new Error(
        `want no rows for ${JSON.stringify(src)}, got ${rows.length}`,
      );
    }
  }
});

Deno.test({
  name: "document-symbols(wasm): the nested outline of a real module",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, log)!;
  const rows = checker.declExtentsAt(extSrc);
  const exported = new Set(
    checker.moduleSurface(extSrc, "/proj/main.vl").exports.map((e) => e.name),
  );
  const syms = nestedDocumentSymbols(rows, exported);
  eq(
    shape(syms),
    "Point:type,LIMIT:constant,classify:function((lambda):function)",
    "blocks are not symbols; the lambda re-parents onto the function",
  );
  const fn = syms.find((s) => s.name === "classify")!;
  // The whole body: this is what sticky scroll pins under the outline model.
  eq(fn.range, {
    start: { line: 8, character: 0 },
    end: { line: 22, character: 1 },
  }, "the function's range is its declaration");
  if (!fn.exported) throw new Error("classify must carry the exported flag");
});

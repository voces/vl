// D4490: the LSP speaks UTF-16 code units, the seed speaks UTF-8 bytes. Every
// column the wasm-backed checker hands the editor must be a UTF-16 column, and
// every cursor the editor hands it must reach the seed as a byte column. Each
// case puts a 2-byte (é), a 3-byte (—) and a 4-byte surrogate-pair (😀)
// character EARLIER ON THE SAME LINE than the position under test, so a missing
// conversion shifts the answer by the byte excess. Expected columns are computed
// with JS `indexOf`, which counts UTF-16 units — the protocol's own unit.

import { filePath } from "./support/filePath.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { columnMap } from "../lsp/src/utf16Columns.ts";

const SEED = filePath(new URL("../build/vl-compiler.wasm", import.meta.url));
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
const noSiblings = () => undefined;
const KEY = "/proj/main.vl";

// One prefix per UTF-8 width, then all three together.
const PREFIXES = ["é", "—", "😀", "é—😀"];

const eq = (what: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${what}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
};

Deno.test("utf16 columns: the map converts both ways, surrogate pairs included", () => {
  const text = 'ascii\nconst s = "é—😀"; x\n';
  const m = columnMap(text);
  // ASCII line: identity.
  eq("ascii toUtf16", m.toUtf16(0, 3), 3);
  eq("ascii toByte", m.toByte(0, 3), 3);
  const line = text.split("\n")[1];
  const x16 = line.indexOf("x");
  const x8 = new TextEncoder().encode(line.slice(0, x16)).length;
  eq("x byte excess", x8 - x16, 1 + 2 + 2);
  eq("toUtf16(x)", m.toUtf16(1, x8), x16);
  eq("toByte(x)", m.toByte(1, x16), x8);
  // The emoji's own two units: its start maps to its first byte; its end to after byte 4.
  const e16 = line.indexOf("😀");
  const e8 = new TextEncoder().encode(line.slice(0, e16)).length;
  eq("emoji start", m.toByte(1, e16), e8);
  eq("emoji end", m.toByte(1, e16 + 2), e8 + 4);
  eq("emoji end back", m.toUtf16(1, e8 + 4), e16 + 2);
  // Past the line's end the excess carries over unchanged (an end-of-line span).
  const len8 = new TextEncoder().encode(line).length;
  eq("past end toUtf16", m.toUtf16(1, len8 + 2), line.length + 2);
  eq("past end toByte", m.toByte(1, line.length + 2), len8 + 2);
  // A line that does not exist is identity, not a throw.
  eq("no such line", m.toUtf16(9, 4), 4);
});

Deno.test({ name: "utf16 columns: a type error's range", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const p of PREFIXES) {
    const line = `const s = "${p}"; const t: i32 = s`;
    const diags = await checker.check(`${line}\nprint(t)\n`, KEY, noSiblings);
    const d = diags.find((x) => x.severity === "error");
    if (d === undefined) throw new Error(`[${p}] expected a type error`);
    const at = line.lastIndexOf("s");
    eq(`[${p}] diag range`, d.range, {
      start: { line: 0, character: at },
      end: { line: 0, character: at + 1 },
    });
  }
});

Deno.test({ name: "utf16 columns: lexical tokens, a non-ASCII comment's length too", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const p of PREFIXES) {
    const line = `const s = "${p}"; const n = 1 // ${p} end`;
    const toks = checker.lexicalTokensAt(`${line}\n`);
    const second = line.indexOf("const", 1);
    const kw = toks.find((t) => t.line === 0 && t.char === second);
    if (kw === undefined || kw.length !== 5) {
      throw new Error(`[${p}] no 5-wide token at ${second}: ${JSON.stringify(toks)}`);
    }
    const one = line.indexOf("1");
    if (!toks.some((t) => t.char === one && t.length === 1)) {
      throw new Error(`[${p}] no numeric token at ${one}: ${JSON.stringify(toks)}`);
    }
    const c = line.indexOf("//");
    const comment = toks.find((t) => t.char === c);
    eq(`[${p}] comment token`, comment && [comment.char, comment.length], [c, line.length - c]);
  }
});

Deno.test({ name: "utf16 columns: semantic identifier and member tokens", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const p of PREFIXES) {
    const line = `const s = "${p}"; const q: P = { x: 1 }; print(q.x)`;
    const src = `type P = { x: i32 }\n${line}\nprint(s)\n`;
    const toks = await checker.tokensAt(src, KEY, noSiblings);
    const decl = line.indexOf("q");
    const use = line.lastIndexOf("q");
    const qs = toks.filter((t) => t.line === 1 && t.length === 1).map((t) => t.char);
    for (const want of [decl, use]) {
      if (!qs.includes(want)) throw new Error(`[${p}] no token at ${want}: ${qs}`);
    }
    const members = await checker.memberTokensAt(src, KEY, noSiblings);
    const x = members.find((m) => m.line === 1);
    eq(`[${p}] member token`, x && [x.char, x.length], [line.lastIndexOf("x"), 1]);
  }
});

Deno.test({ name: "utf16 columns: cursor queries reach the seed as bytes", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const p of PREFIXES) {
    const line = `const s = "${p}"; const n: i32 = 1; print(f(n, n))`;
    const src = `function f(a: i32, b: i32): i32 { a + b }\n${line}\nprint(s)\n`;
    const use = line.lastIndexOf("n");
    const decl = line.indexOf("n:");
    eq(`[${p}] hover`, await checker.hoverTypeAt(src, KEY, noSiblings, 1, use), "i32");
    eq(`[${p}] definition`, await checker.definitionAt(src, KEY, noSiblings, 1, use), {
      start: { line: 1, character: decl },
      end: { line: 1, character: decl + 1 },
    });
    const refs = await checker.referencesAt(src, KEY, noSiblings, 1, use, true);
    eq(
      `[${p}] references`,
      refs.map((r) => [r.start.character, r.end.character]).sort((a, b) => a[0] - b[0]),
      [[decl, decl + 1], [line.indexOf("n,"), line.indexOf("n,") + 1], [use, use + 1]],
    );
    const sig = await checker.signatureAt(src, KEY, noSiblings, 1, line.indexOf("f("));
    eq(`[${p}] signature`, sig?.params.map((x) => x.name), ["a", "b"]);
    const scope = await checker.scopeAt(src, KEY, noSiblings, 1, use);
    if (!scope.some((b) => b.name === "n")) {
      throw new Error(`[${p}] scope at ${use} lacks n: ${JSON.stringify(scope)}`);
    }
  }
});

Deno.test({ name: "utf16 columns: inlay hints, lint and extents", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const p of PREFIXES) {
    const line = `const s = "${p}"; let k = 1 + 2; function g() { k }`;
    const src = `${line}\nprint(s)\nprint(g())\n`;
    const hints = await checker.inlayHintsAt(src, KEY, noSiblings);
    // Inlay lines are native (1-based); `s` hints at 7 on every prefix, `k` after it.
    const cols = hints.filter((h) => h.kind === 0 && h.line === 1).map((h) => h.col);
    eq(`[${p}] inlay cols`, cols.sort((a, b) => a - b), [7, line.indexOf("k") + 1]);
    const lints = checker.lint(src);
    const pc = lints.find((d) => d.code === "prefer-const");
    // prefer-const spans the declaration from its `let`.
    eq(`[${p}] lint start`, pc?.range.start, { line: 0, character: line.indexOf("let") });
    const extents = checker.declExtentsAt(src);
    const fn = extents.find((e) => e.name === "g");
    eq(`[${p}] extent`, fn && [fn.range.start, fn.range.end], [
      { line: 0, character: line.indexOf("function") },
      { line: 0, character: line.length },
    ]);
  }
});

Deno.test({ name: "utf16 columns: cross-file positions use the SIBLING's text", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const p of PREFIXES) {
    const utilLine = `const pad = "${p}"; export function add(a: i32, b: i32): i32 { a + b }`;
    const util = `${utilLine}\nprint(pad)\n`;
    const read = (key: string) => (key.endsWith("util.vl") ? util : undefined);
    const entryLine = `const z = "${p}${p}"; print(add(1, 2))`;
    const entry = `import { add } from "./util"\n${entryLine}\nprint(z)\n`;
    const src = (await checker.importedNameSources(entry, KEY, read)).add;
    const declCol = utilLine.indexOf("add");
    eq(`[${p}] imported source`, src && [src.line, src.col, src.length], [1, declCol, 3]);
    const surface = checker.moduleSurface(util, src!.key);
    const ex = surface.exports.find((e) => e.name === "add");
    eq(`[${p}] surface`, ex && [ex.declCol, ex.kwCol], [declCol, utilLine.indexOf("export")]);
    const occs = await checker.referencesInEntry(entry, KEY, read, {
      key: src!.key,
      exportedName: "add",
      declLine: 1,
      declCol,
    });
    const use = occs.find((o) => o.range.start.line === 1);
    eq(`[${p}] cross-file use`, use?.range.start.character, entryLine.indexOf("add"));
  }
});

Deno.test({ name: "utf16 columns: a dependency's diagnostic converts against ITS text", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  for (const p of PREFIXES) {
    const utilLine = `const pad = "${p}"; export const bad: i32 = pad`;
    const read = (key: string) => (key.endsWith("util.vl") ? `${utilLine}\n` : undefined);
    const entry = 'import { bad } from "./util"\nprint(bad)\n';
    const d = (await checker.check(entry, KEY, read)).find((x) => x.severity === "error");
    const at = utilLine.lastIndexOf("pad");
    eq(`[${p}] dependency diag`, d?.range, {
      start: { line: 0, character: at },
      end: { line: 0, character: at + 3 },
    });
  }
});

// Exact constants in the editor. An un-annotated literal `const` has no single type: it is an
// exact value, typed at each use as the literal written there would be (DECISIONS.md, "Exact
// constant arithmetic"). So hover shows the VALUE — `const SIZE = 192` at the declaration and
// `SIZE: i64 = 192` at a use that took `i64` — the way gopls shows Go's untyped constants, and
// completion shows `= 192` where any other binding shows `: T`.
//
// The unchanged rows are as much the point as the new ones: a `let`, an annotated `const` and
// a `const` whose initializer is a call each still hover with their one type.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  exactConstHover,
  exactConstNote,
  exactConstValue,
  inlayHintsFromWasm,
  scopeCompletionsFromBindings,
} from "../lsp/src/typeFeatures.ts";

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

const SRC = [
  /*  0 */ "export const SIZE = 192",
  /*  1 */ "const MASK = 1 << 40",
  /*  2 */ "const K = 2147483647 + 1",
  /*  3 */ "const M = 0xFFFFFFFF",
  /*  4 */ "const F = 0.1",
  /*  5 */ "const T = 1.0 / 3.0",
  /*  6 */ "const X: i64 = 5",
  /*  7 */ "let y = 3",
  /*  8 */ "function f(): i32 { 7 }",
  /*  9 */ "const N = f()",
  /* 10 */ "const a: i64 = SIZE",
  /* 11 */ "const b: i32 = SIZE",
  /* 12 */ "const d: i64 = M",
  /* 13 */ "const e: i32 = M",
  /* 14 */ "const NEG = -7",
  /* 15 */ "print(a + b as i64 + d + e as i64 + X + y as i64 + N as i64 + MASK + K)",
  /* 16 */ "print(F)",
  /* 17 */ "print(T)",
  /* 18 */ "print(NEG)",
  "",
].join("\n");

// The hover a name at (line, col) leads with: the exact-constant line and its note, or the
// type `hoverTypeAt` gives any other binding.
const hoverAt = async (src: string, line: number, col: number, read = noSiblings) => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const exact = await checker.constAt(src, "/proj/main.vl", read, line, col);
  if (exact) return exactConstHover(nameAt(src, line, col), exact);
  return { code: await checker.hoverTypeAt(src, "/proj/main.vl", read, line, col), note: "" };
};

const nameAt = (src: string, line: number, col: number): string => {
  const text = src.split("\n")[line];
  let s = col;
  let e = col;
  while (s > 0 && /\w/.test(text[s - 1])) s--;
  while (e < text.length && /\w/.test(text[e])) e++;
  return text.slice(s, e);
};

const want = async (
  line: number,
  col: number,
  code: string | undefined,
  note: string,
  what: string,
  src = SRC,
  read = noSiblings,
) => {
  const got = await hoverAt(src, line, col, read);
  if (got.code !== code || got.note !== note) {
    throw new Error(
      `${what}: want ${JSON.stringify({ code, note })}, got ${JSON.stringify(got)}`,
    );
  }
};

const INT = "integer constant; typed at each use";

Deno.test({ name: "exact-const hover: the declaration shows its value", ignore }, async () => {
  await want(0, 13, "const SIZE = 192", INT, "SIZE decl");
});

Deno.test({ name: "exact-const hover: a use shows the type it took there", ignore }, async () => {
  await want(10, 15, "SIZE: i64 = 192", INT, "SIZE at an i64 use");
  await want(11, 15, "SIZE: i32 = 192", INT, "SIZE at an i32 use");
});

Deno.test({ name: "exact-const hover: a folded expression shows its exact value", ignore }, async () => {
  await want(1, 6, "const MASK = 1099511627776", INT, "MASK decl");
  await want(2, 6, "const K = 2147483648", INT, "K decl");
  await want(15, 62, "MASK: i64 = 1099511627776", INT, "MASK use");
  await want(14, 6, "const NEG = -7", INT, "NEG decl");
  await want(18, 6, "NEG: i32 = -7", INT, "NEG use");
});

Deno.test({ name: "exact-const hover: a radix constant is a bit pattern", ignore }, async () => {
  await want(3, 6, "const M = 0xFFFFFFFF", "bit pattern; -1 at i32, 4294967295 at i64", "M decl");
  await want(12, 15, "M: i64 = 0xFFFFFFFF", "bit pattern; 4294967295 at i64", "M at i64");
  await want(13, 15, "M: i32 = 0xFFFFFFFF", "bit pattern; -1 at i32", "M at i32");
});

Deno.test({ name: "exact-const hover: a float constant", ignore }, async () => {
  const FLOAT = "float constant; typed at each use";
  await want(4, 6, "const F = 0.1", FLOAT, "F decl");
  await want(16, 6, "F: f64 = 0.1", FLOAT, "F use");
  // 1/3 has no terminating decimal, so it shows at f64 precision and says so.
  await want(
    5,
    6,
    "const T = 0.3333333333333333",
    "float constant (shown at f64 precision); typed at each use",
    "T decl",
  );
});

Deno.test({ name: "exact-const hover: other bindings keep their one type", ignore }, async () => {
  await want(6, 6, "i64", "", "annotated const");
  await want(7, 4, "i32", "", "let");
  await want(9, 6, "i32", "", "const from a call");
});

Deno.test({ name: "exact-const hover: an exported const used from another module", ignore }, async () => {
  const util = "export const SIZE = 192\n";
  const main = 'import { SIZE } from "./util"\nconst w: i64 = SIZE\nprint(w)\n';
  const read = (key: string) => (key.endsWith("util.vl") ? util : undefined);
  await want(1, 15, "SIZE: i64 = 192", INT, "imported SIZE at i64", main, read);
});

Deno.test({ name: "exact-const completion: the row shows the value", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const scope = await checker.scopeAt(SRC, "/proj/main.vl", noSiblings, 16, 0);
  const items = scopeCompletionsFromBindings(scope);
  const by = (n: string) => items.find((c) => c.name === n);
  const size = by("SIZE");
  if (size?.labelDetail !== " = 192" || size.detail !== "const SIZE = 192") {
    throw new Error(`SIZE completion: got ${JSON.stringify(size)}`);
  }
  const x = by("X");
  if (x?.labelDetail !== undefined || x.detail !== "i64") {
    throw new Error(`annotated X completion keeps its type: got ${JSON.stringify(x)}`);
  }
});

Deno.test({ name: "exact-const inlay: a declaration carries no type hint", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = "const SIZE = 192\nlet y = 3\nprint(SIZE + y)\n";
  const hints = inlayHintsFromWasm(await checker.inlayHintsAt(src, "/tmp/x.vl", noSiblings), undefined, src);
  const lines = hints.map((h) => `${h.line}${h.label}`);
  if (JSON.stringify(lines) !== JSON.stringify(["1: i32"])) {
    throw new Error(`want only the let's hint, got ${JSON.stringify(lines)}`);
  }
});

Deno.test({ name: "exact-const: go-to-definition and references still resolve", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const def = await checker.definitionAt(SRC, "/proj/main.vl", noSiblings, 10, 15);
  if (def?.start.line !== 0 || def.start.character !== 13) {
    throw new Error(`SIZE definition: got ${JSON.stringify(def)}`);
  }
  const refs = await checker.referencesAt(SRC, "/proj/main.vl", noSiblings, 0, 13, true);
  const at = refs.map((r) => `${r.start.line}:${r.start.character}`).sort();
  if (JSON.stringify(at) !== JSON.stringify(["0:13", "10:15", "11:15"])) {
    throw new Error(`SIZE references: got ${JSON.stringify(at)}`);
  }
});

Deno.test("exact-const rendering: values and notes", () => {
  const v = exactConstValue({ kind: "float", shown: "1." + "0".repeat(30) + "1", mag: "" });
  if (v.text !== "1.0" || !v.rounded) throw new Error(`long float: got ${JSON.stringify(v)}`);
  const small = exactConstNote({ kind: "pattern", shown: "0xFF", mag: "255" });
  if (small !== "bit pattern; 255 at i32 and i64") throw new Error(`0xFF note: got ${small}`);
  const wide = exactConstNote({ kind: "pattern", shown: "0xFFFFFFFFFF", mag: "1099511627775" });
  if (wide !== "bit pattern; 1099511627775 at i64") throw new Error(`wide note: got ${wide}`);
});

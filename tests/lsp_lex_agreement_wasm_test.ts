// `lsp/src/vlLex.ts` is a host-side twin of `compiler/lexer.vl`: folding,
// signature help and test discovery run on it with no seed. This holds the twin
// to the seed's own lexer (`lexicalTokensAt`) over every `tests/cases/**/*.vl`.
//
// The seed reports only its coloured classes (0 keyword, 1 operator, 2 number,
// 3 boolean/null, 4 comment, 5 template part), so the comparison is on what both
// sides can see: comment spans are equal; no keyword, operator, number or literal
// sits inside a vlLex string or comment (bar code inside a `\{…}` hole, which
// vlLex keeps opaque); a keyword, number or literal is exactly one vlLex token;
// each operator character is a one-character vlLex punct; a template part lies
// inside a vlLex string; and every vlLex numeric run is one seed number.
//
// Seed columns are UTF-8 bytes; they are mapped to UTF-16 per line here. A file
// with an unterminated literal is skipped: the two recover from it differently
// on purpose (vlLex stops a `"` at the newline so a mid-edit quote does not
// swallow the document).

import { filePath } from "./support/filePath.ts";
import { lineStarts, tokenize } from "../lsp/src/vlLex.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import type { WasmChecker } from "../lsp/src/wasmChecker.ts";

const SEED = filePath(new URL("../build/vl-compiler.wasm", import.meta.url));
const CASES = filePath(new URL("./cases", import.meta.url));
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();

interface Span {
  a: number;
  b: number;
}

const utf8Len = (ch: string): number => {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

/** Seed byte column `byte` on line `l` as a source offset. */
const byteOffset = (src: string, starts: number[], l: number, byte: number): number => {
  const from = starts[l] ?? src.length;
  let b = 0;
  let i = from;
  while (b < byte && i < src.length) {
    const ch = String.fromCodePoint(src.codePointAt(i) ?? 0);
    b += utf8Len(ch);
    i += ch.length;
  }
  return i;
};

/**
 * Every disagreement between vlLex's tokens of `lexSrc` and the seed's lexical
 * tokens of `seedSrc` (the same text, except in the control), or undefined when
 * the file is skipped.
 */
const disagreements = (
  checker: WasmChecker,
  lexSrc: string,
  seedSrc: string,
): string[] | undefined => {
  const out: string[] = [];
  const starts = lineStarts(lexSrc);
  const vt = tokenize(lexSrc, { comments: true }).map((t) => ({
    kind: t.kind,
    s: t.s,
    a: (starts[t.start.line] ?? lexSrc.length) + t.start.character,
    b: (starts[t.end.line] ?? lexSrc.length) + t.end.character,
  }));
  if (vt.some((t) => t.kind === "punct" && /^["'`]$/.test(t.s))) return undefined;
  const seedStarts = lineStarts(seedSrc);
  const st = checker.lexicalTokensAt(seedSrc).map((t) => ({
    cls: t.tokenClass,
    a: byteOffset(seedSrc, seedStarts, t.line, t.char),
    b: byteOffset(seedSrc, seedStarts, t.line, t.char + t.length),
  }));
  const text = (s: Span) => JSON.stringify(seedSrc.slice(s.a, s.b));
  const byStart = new Map<number, (typeof vt)[number]>();
  for (const t of vt) byStart.set(t.a, t);
  // vlLex's strings and comments, in source order and disjoint.
  const boxes = vt.filter((t) => t.kind === "str" || t.kind === "comment");
  const container = (s: Span) => {
    let lo = 0;
    let hi = boxes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (boxes[mid].a <= s.a) lo = mid;
      else hi = mid - 1;
    }
    const t = boxes[lo];
    if (t === undefined || t.a > s.a || s.b > t.b) return undefined;
    return t.a === s.a && t.b === s.b ? undefined : t;
  };
  const key = (s: Span) => `${s.a}:${s.b}`;
  const seedComments = new Set(st.filter((t) => t.cls === 4).map(key));
  const lexComments = new Set(vt.filter((t) => t.kind === "comment").map(key));
  for (const k of seedComments) if (!lexComments.has(k)) out.push(`seed-only comment ${k}`);
  for (const k of lexComments) if (!seedComments.has(k)) out.push(`vlLex-only comment ${k}`);
  for (const t of st) {
    if (t.cls === 4) continue;
    const box = container(t);
    if (t.cls === 5) {
      if (box?.kind !== "str") out.push(`template part outside a vlLex string at ${t.a} ${text(t)}`);
      continue;
    }
    if (box !== undefined) {
      if (box.kind === "str" && seedSrc.slice(box.a, box.b).includes("\\{")) continue;
      out.push(`class ${t.cls} inside a vlLex ${box.kind} at ${t.a} ${text(t)}`);
      continue;
    }
    if (t.cls === 1) {
      for (let k = t.a; k < t.b; k++) {
        const p = byStart.get(k);
        if (p?.kind !== "punct" || p.b !== k + 1) {
          out.push(`operator not one-char vlLex puncts at ${t.a} ${text(t)}`);
          break;
        }
      }
      continue;
    }
    const v = byStart.get(t.a);
    if (v?.b !== t.b) {
      out.push(`class ${t.cls} span at ${t.a}: seed ${text(t)}, vlLex ${v ? text(v) : "none"}`);
    }
  }
  const seedNumbers = new Set(st.filter((t) => t.cls === 2).map(key));
  for (const t of vt) {
    if (t.kind === "punct" && /^[0-9]/.test(t.s) && !seedNumbers.has(key(t))) {
      out.push(`vlLex number not a seed number at ${t.a} ${JSON.stringify(t.s)}`);
    }
  }
  return out;
};

const caseFiles = (): string[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of Deno.readDirSync(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) walk(p);
      else if (e.name.endsWith(".vl")) files.push(p);
    }
  };
  walk(CASES);
  return files.sort();
};

const checker = (): WasmChecker => {
  const c = loadWasmChecker(SEED, () => {});
  if (c === undefined) throw new Error("the seed did not load as a checker");
  return c;
};

Deno.test({
  name: "vlLex agrees with the seed's lexer on every tests/cases file",
  ignore: !seedExists,
  fn() {
    const c = checker();
    let graded = 0;
    let skipped = 0;
    const bad: string[] = [];
    for (const f of caseFiles()) {
      const src = Deno.readTextFileSync(f);
      const d = disagreements(c, src, src);
      if (d === undefined) {
        skipped++;
        continue;
      }
      graded++;
      for (const m of d) bad.push(`${f.slice(CASES.length + 1)}: ${m}`);
    }
    if (graded < 1000) {
      throw new Error(`want >= 1000 graded files, got ${graded} (${skipped} skipped)`);
    }
    if (skipped > 20) throw new Error(`want <= 20 skipped files, got ${skipped}`);
    if (bad.length > 0) {
      throw new Error(`want 0 disagreements, got ${bad.length}:\n${bad.slice(0, 30).join("\n")}`);
    }
  },
});

Deno.test({
  name: "vlLex agreement: the comparison reports a shifted comment and a split number",
  ignore: !seedExists,
  fn() {
    const c = checker();
    const comment = disagreements(c, "let a = 1 // c\n", "let a = 1  // c\n") ?? [];
    if (!comment.some((m) => m.includes("comment"))) {
      throw new Error(`want a comment disagreement, got ${JSON.stringify(comment)}`);
    }
    const number = disagreements(c, "let a = 1e5\n", "let a = 1 + 5\n") ?? [];
    if (!number.some((m) => m.includes("number"))) {
      throw new Error(`want a number disagreement, got ${JSON.stringify(number)}`);
    }
  },
});

Deno.test("vlLex: an exponent's sign is part of a decimal number, not a radix one", () => {
  const nums = (src: string) =>
    tokenize(src).filter((t) => t.kind === "punct" && /^[0-9]/.test(t.s)).map((t) => t.s);
  const got = JSON.stringify([...nums("1e-5 2E+10 1.5e-3"), ...nums("0x1e-5")]);
  const want = JSON.stringify(["1e-5", "2E+10", "1.5e-3", "0x1e", "5"]);
  if (got !== want) throw new Error(`want ${want}, got ${got}`);
});

Deno.test("vlLex: a string spans lines, a lone CR breaks a line, a stray quote stops at the newline", () => {
  const multi = tokenize('let s = "a\nb"\nlet t = 1');
  const s = multi.find((t) => t.kind === "str");
  const t = multi.find((x) => x.kind === "ident" && x.s === "t");
  if (s?.s !== "a\nb" || t?.start.line !== 2) {
    throw new Error(`want "a\\nb" and t on line 2, got ${JSON.stringify(s?.s)} and ${t?.start.line}`);
  }
  const cr = tokenize("let a = 1\rlet b = 2", { comments: true });
  const b = cr.find((x) => x.s === "b");
  if (b?.start.line !== 1 || b.start.character !== 4) {
    throw new Error(`want b at 1:4, got ${JSON.stringify(b?.start)}`);
  }
  const stray = tokenize('let s = "abc\nlet u = 1');
  const u = stray.find((x) => x.s === "u");
  if (u?.start.line !== 1) throw new Error(`want u on line 1, got ${JSON.stringify(u?.start)}`);
  const cont = tokenize('"a\\\n    b"');
  if (cont[0]?.s !== "ab") throw new Error(`want "ab" from a continuation, got ${JSON.stringify(cont[0]?.s)}`);
});

// A MODULE CHECK THAT SERVES UNCHANGED DEPENDENTS FROM THE BANK IS A WHOLE CHECK (S5,
// `checkSkipArm` in `compiler/driver.vl`).
//
// Each case is a three-module graph (main imports lib and mid, mid imports lib) and one edit.
// An armed instance checks the base graph, then the edited one, serving what it can from the
// bank; a fresh armed instance checks the edited graph with nothing banked; an unarmed one checks
// it the default way. Graded:
//   * SOUND: the served check's diagnostics equal the fresh check's row for row (module, span,
//     code, data, message, order) and the unarmed check's as a set, with the same exit code; a
//     build on the served instance afterwards is byte-identical to one on a fresh instance.
//   * CONTROLS: each case says whether the check must serve a module or must decline, and why,
//     so a bank that never serves (sound and useless) or always serves cannot pass.
//   * MUTATION: with inferred types dropped from the interface hash, the inferred-return edit is
//     served and its diagnostics differ, so the suite can see an unsound skip.
// Every case runs twice, with main clean and with main carrying its own type errors, so a
// banked diagnostic is replayed as well as an empty bank.
//
// GATING: needs the seed.

import { COMPILER, exists, STD } from "./support/tree.ts";

const ENABLED = exists(COMPILER);
if (!ENABLED) console.warn("[check-skip] skipped — missing the seed");

type Exports = {
  modReset(): number;
  modKeyPush(cp: number): number;
  modSrcPush(cp: number): number;
  modCommit(n: number): number;
  modPendingCount(): number;
  modPendingLen(i: number): number;
  modPendingAt(i: number, j: number): number;
  srcReset(): number;
  srcPush(cp: number): number;
  checkSrc(): number;
  compileSrc(): number;
  rbyteLen(): number;
  rbyteAt(i: number): number;
  diagCount(): number;
  diagLine(i: number): number;
  diagCol(i: number): number;
  diagEndLine(i: number): number;
  diagEndCol(i: number): number;
  diagMsgLen(i: number): number;
  diagMsgAt(i: number, j: number): number;
  diagCodeLen(i: number): number;
  diagCodeByte(i: number, j: number): number;
  diagDataLen(i: number): number;
  diagDataByte(i: number, j: number): number;
  diagModule(i: number): number;
  diagOrderKey(i: number): number;
  ifaceHashArm(on: number): number;
  ifaceHashDrop(mask: number): number;
  ifaceHashCount(): number;
  ifaceHashKeyLen(i: number): number;
  ifaceHashKeyAt(i: number, j: number): number;
  checkSkipArm(on: number): number;
  checkSkipStat(which: number): number;
  checkGen(): number;
  lintUseCheck(gen: number): number;
  lintGraph(): number;
  lintGraphCount(): number;
  lintGraphModule(i: number): number;
  lintGraphLine(i: number): number;
  lintGraphCol(i: number): number;
  lintGraphCodeLen(i: number): number;
  lintGraphCodeByte(i: number, j: number): number;
  lintGraphMsgLen(i: number): number;
  lintGraphMsgByte(i: number, j: number): number;
};

const MODULE = ENABLED
  ? new WebAssembly.Module(Deno.readFileSync(COMPILER))
  : undefined;

const instance = (skip: boolean, drop = 0): Exports => {
  const exp = new WebAssembly.Instance(MODULE!, {}).exports as unknown as Exports;
  exp.ifaceHashArm(1);
  exp.ifaceHashDrop(drop);
  if (skip) exp.checkSkipArm(1);
  return exp;
};

const push = (fn: (cp: number) => number, text: string) => {
  for (const ch of text) fn(ch.codePointAt(0)!);
};
const readStr = (len: number, at: (j: number) => number) => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

type Graph = Record<string, string>;
type Result = {
  rc: number;
  diags: string[];
  canon: string[];
  reason: number;
  served: number;
};

const load = (exp: Exports, g: Graph, entry = "main.vl") => {
  exp.modReset();
  const commit = (key: string, src: string) => {
    push(exp.modKeyPush, key);
    push(exp.modSrcPush, src);
    exp.modCommit(1);
  };
  commit(`/proj/${entry}`, g[entry]);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const k of keys) {
      const src = k.startsWith("std:")
        ? g[k] ?? Deno.readTextFileSync(`${STD}/${k.slice(4)}.vl`)
        : g[k.slice(k.lastIndexOf("/") + 1)];
      if (src === undefined) throw new Error(`no source for ${k}`);
      commit(k, src);
    }
  }
  exp.srcReset();
  push(exp.srcPush, g[entry]);
};

const keysOf = (exp: Exports) => {
  const out: string[] = [];
  for (let i = 0; i < exp.ifaceHashCount(); i++) {
    const k = readStr(exp.ifaceHashKeyLen(i), (j) => exp.ifaceHashKeyAt(i, j));
    out.push(k.slice(k.lastIndexOf("/") + 1));
  }
  return out;
};

const check = (exp: Exports, g: Graph, entry = "main.vl"): Result => {
  load(exp, g, entry);
  const rc = exp.checkSrc();
  const keys = keysOf(exp);
  const diags: string[] = [];
  const order: number[] = [];
  for (let i = 0; i < exp.diagCount(); i++) {
    order.push(exp.diagOrderKey(i));
    const msg = readStr(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j));
    const code = readStr(exp.diagCodeLen(i), (j) => exp.diagCodeByte(i, j));
    const data = readStr(exp.diagDataLen(i), (j) => exp.diagDataByte(i, j));
    diags.push(
      `${keys[exp.diagModule(i)] ?? "?"} ${exp.diagLine(i)}:${exp.diagCol(i)}-` +
        `${exp.diagEndLine(i)}:${exp.diagEndCol(i)} [${code}|${data}] ${msg}`,
    );
  }
  // The rows listed stably by `diagOrderKey`, the order the LSP publishes.
  const canon = diags.map((d, i) => ({ d, k: order[i] })).sort((a, b) => a.k - b.k).map((r) =>
    r.d
  );
  return {
    rc,
    diags,
    canon,
    reason: exp.checkSkipStat(0),
    served: exp.checkSkipStat(1),
  };
};

const build = (exp: Exports, g: Graph): Uint8Array | number => {
  load(exp, g);
  const rc = exp.compileSrc();
  if (rc !== 0) return rc;
  const b = new Uint8Array(exp.rbyteLen());
  for (let i = 0; i < b.length; i++) b[i] = exp.rbyteAt(i);
  return b;
};

// `checkSkipStat(0)`'s reasons, by name.
const REASON = [
  "served",
  "no bank",
  "graph",
  "all",
  "demand",
  "re-export",
  "interface",
  "span",
  "stray",
  "pass",
  "ambient",
  "fresh",
  "decor",
];

// ── the graph ────────────────────────────────────────────────────────────────

const LIB = `export type Shape = { w: i32, h: i32 }
function quiet(): void { print(3) }
export function area(n: i32): i32 {
  return n * 2
}
export function bump(): void {
  quiet()
}
export function half(n: i32) { n / 2 }
export function twice(x) { x * 2 }
export function pick<T>(a: T, b: T): T { return a }
export function size(sh: Shape): i32 { return sh.w * sh.h }
export function dflt(n: i32 = 1): i32 { return n }
export let pt = { x: 1, y: 2 }
export function spare(n: i32): i32 { return n }
export let level: i32 = 0
export let g: i32 | null = 1
export let box: Shape = { w: 1, h: 1 }
export function clear(): void { print(0) }
export function grow(): void { box.w = box.w + 1 }
export const N = 16
export function cdflt(n: i32 = N): i32 { return n }
export function sdflt(n: i32, k: f64 = -0.5, s: string = "x", b: boolean = true): f64 { return k }
export const TAG = "t"
export let flag = false
export let mode = "a"
export let count = 0
export let dbl = (x) => x + x
function take(w: { x: i64, y: i64 }): void { print(w.x) }
`;

const MID = `import { area, Shape } from "./lib"
export function mid(n: i32): i32 { return area(n) + 1 }
export function edge(s: Shape): i32 { return s.w }
`;

const MAIN = `import { area, bump, size, Shape, half } from "./lib"
import { mid, edge } from "./mid"
const sh: Shape = { w: 2, h: 3 }
const bx: Shape = { w: 4, h: 5 }
print(area(2))
bump()
print(size(sh))
print(size(bx))
print(mid(1))
print(edge(bx))
const hv: i32 = half(4)
print(hv)
`;

// Main's own type errors, one naming a record both main and lib can spell.
const MAIN_BAD = `const bad: string = bx
const worse: boolean = area(1)
`;

// Main calls a generic from gen, which hub also imports, so an edit to hub puts gen in S.
const HUB: Graph = {
  "gen.vl": 'import { keep } from "./base"\nexport function gp<T>(x: T): T {\n  keep(x)\n  return x\n}\n',
  "base.vl": "export function keep(x: i32): void { print(x) }\n",
  "hub.vl": 'import { gp } from "./gen"\nexport function hub(): i32 { return 1 }\n',
};
const HUB_USES = 'import { gp } from "./gen"\nimport { hub } from "./hub"\nprint(gp(1))\nprint(hub())\n';

// std:fmt's own source, for an edit to the template renderer.
const FMT = ENABLED ? Deno.readTextFileSync(`${STD}/fmt.vl`) : "";

type Want = "serve" | "decline" | "any";
type Case = {
  name: string;
  want: Want;
  // The reason a decline must give; any decline when absent.
  why?: string;
  // With main holding errors, a decline for this reason instead of `want`.
  badWhy?: string;
  at?: string;
  from: string;
  to: string;
  // Added to main's imports and body on both sides, for an edit main must reach.
  uses?: string;
  // Added to lib's head on both sides.
  libUses?: string;
  // More modules, on both sides.
  extra?: Graph;
  // A second edit, as [module, from, to].
  also?: [string, string, string];
};

const CASES: Case[] = [
  { name: "body-only edit", want: "serve", from: "n * 2", to: "n * 3" },
  {
    name: "body edit that raises a lib error",
    want: "serve",
    from: "n * 2",
    to: 'n * "x"',
  },
  {
    name: "body edit whose error names a shared record",
    want: "serve",
    from: "return sh.w * sh.h",
    to: "return sh" + " ".repeat(9),
  },
  {
    name: "private helper an exposed body calls",
    want: "serve",
    from: "print(3)",
    to: "print(4)",
  },
  {
    // Main's diagnostics point into main and spell no number, so they hold wherever lib moves.
    name: "body edit that shifts the lines below it",
    want: "serve",
    from: "  return n * 2\n",
    to: "  const k = 2\n  return n * k\n",
  },
  {
    // A served diagnostic that spells a number may be citing a line, so a moved token declines.
    name: "line-shifting edit under a diagnostic that spells a number",
    want: "decline",
    why: "span",
    from: "  return n * 2\n",
    to: "  const k = 2\n  return n * k\n",
    uses: "const huge: i32 = 3000000000000\n",
  },
  {
    name: "same-length edit under a diagnostic that spells a number",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: "const huge: i32 = 3000000000000\n",
  },
  {
    name: "signature edit",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "area(n: i32)",
    to: "area(n: string)",
  },
  {
    // A served diagnostic may spell any of S's declarations, so main's errors keep them all.
    name: "signature edit of an export main does not import",
    want: "serve",
    badWhy: "decor",
    from: "spare(n: i32): i32 { return n }",
    to: "spare(n: string): string { return n }",
  },
  {
    name: "signature edit of a private callee only an unimported export calls",
    want: "serve",
    badWhy: "decor",
    from: "lone(n: i32): i32 { return n }",
    to: "lone(k: i32): i32 { return k + 1 }",
    libUses: "function lone(n: i32): i32 { return n }\nexport function user(): i32 { return lone(1) }\n",
  },
  {
    name: "type edit of a binding main does not import",
    want: "serve",
    badWhy: "decor",
    from: 'export let mode = "a"',
    to: "export let mode = 1",
  },
  {
    name: "inferred-return change",
    want: "decline",
    why: "interface",
    from: "{ n / 2 }",
    to: '{ "h" }',
  },
  {
    name: "record type edit",
    want: "decline",
    why: "ambient",
    from: "{ w: i32, h: i32 }",
    to: "{ w: i32, h: i64 }",
  },
  {
    name: "generic body edit",
    want: "decline",
    why: "demand",
    from: "return a }",
    to: "return b }",
    uses: `import { pick } from "./lib"\nprint(pick(1, 2))\n`,
  },
  {
    name: "un-annotated param body edit",
    want: "decline",
    why: "demand",
    from: "x * 2",
    to: "x * 3",
    uses: `import { twice } from "./lib"\nprint(twice(2))\n`,
  },
  {
    // A scalar-literal default is typed by the declaration's check; a caller reads its annotation.
    name: "defaulted param body edit",
    want: "serve",
    from: "return n }\nexport let",
    to: "return n + 1 }\nexport let",
    uses: `import { dflt, sdflt } from "./lib"\nprint(dflt())\nprint(sdflt(2))\n`,
  },
  {
    name: "a defaulted param loses its default",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "dflt(n: i32 = 1)",
    to: "dflt(n: i32)",
    uses: `import { dflt } from "./lib"\nprint(dflt())\n`,
  },
  {
    // A default naming a binding is not a literal, so the plan does not close it.
    name: "a const-defaulted param body edit",
    want: "decline",
    why: "demand",
    from: "n * 2",
    to: "n * 3",
    uses: `import { cdflt } from "./lib"\nprint(cdflt())\n`,
  },
  {
    name: "imported binding edit",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "x: 1, y: 2",
    to: "x: 5, y: 2",
    uses: `import { pt } from "./lib"\nprint(pt.x)\n`,
  },
  {
    // An inferred binding is served while its checked type keeps its hash.
    name: "inferred record binding main reads, lib body edit",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: `import { pt } from "./lib"\nconst px: i32 = pt.x\nprint(px)\n`,
  },
  {
    name: "a lib body starts adopting an inferred binding main reads",
    want: "decline",
    why: "interface",
    from: "clear(): void { print(0) }",
    to: "clear(): void { take(pt) }",
    uses: `import { pt } from "./lib"\nconst px: i32 = pt.x\nprint(px)\n`,
  },
  {
    // The bank holds the type main's delivery adopted; lib checked alone does not adopt it.
    name: "main adopts an inferred binding, lib body edit",
    want: "decline",
    why: "ambient",
    from: "n * 2",
    to: "n * 3",
    uses:
      `import { pt } from "./lib"\nfunction wide(w: { x: i64, y: i64 }): i64 { return w.x }\nprint(wide(pt))\n`,
  },
  {
    // A call of a function-valued binding checks its body at the caller's arguments.
    name: "function-valued binding main calls, lib body edit",
    want: "decline",
    why: "demand",
    from: "n * 2",
    to: "n * 3",
    uses: `import { dbl } from "./lib"\nprint(dbl(2))\n`,
  },
  {
    name: "annotated binding main writes, lib body edit",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: `import { level, box, grow } from "./lib"\nlevel = 2\nbox.h = 3\ngrow()\nprint(level + box.w)\n`,
  },
  {
    name: "scalar constants main widens, lib body edit",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses:
      `import { N, TAG } from "./lib"\nconst big: i64 = N\nconst fl: f64 = N\nconst u: u8 = N\nprint(big)\nprint(fl)\nprint(u)\nprint(TAG)\n`,
  },
  {
    name: "string and boolean bindings main stores, lib body edit",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses:
      `import { flag, mode } from "./lib"\nflag = true\nmode = "zz"\nconst m: "a" | "zz" = mode\nprint(m)\nif flag { print(mode) }\n`,
  },
  {
    // An importer's store cannot retype a number binding (it is refused), so this serves.
    name: "number binding main widens, lib body edit",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: `import { count } from "./lib"\nconst w: i64 = 5\ncount = w\nprint(count)\n`,
  },
  {
    name: "number binding main stores and delivers wider, lib body edit",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses:
      `import { count } from "./lib"\nfunction wide(x: i64): i64 { return x }\nconst fl: f64 = count\ncount = count + 1\nprint(wide(count))\nprint(fl)\n`,
  },
  {
    name: "a lib body starts widening a number binding main reads",
    want: "decline",
    why: "interface",
    from: "clear(): void { print(0) }",
    to: "clear(): void {\n  const z: i64 = 9\n  count = z\n}",
    uses: `import { count } from "./lib"\nconst k: i32 = count\nprint(k)\n`,
  },
  {
    name: "a number binding's literal edit",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "count = 0",
    to: "count = 0.5",
    uses: `import { count } from "./lib"\nconst k: i32 = count\nprint(k)\n`,
  },
  {
    name: "scalar constant edit",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "N = 16",
    to: "N = 300",
    uses: `import { N } from "./lib"\nconst u: u8[] = [N]\nprint(u[0])\n`,
  },
  {
    name: "annotated binding initialiser edit",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "level: i32 = 0",
    to: "level: i32 = 7",
    uses: `import { level } from "./lib"\nlevel = 2\nprint(level)\n`,
  },
  {
    name: "a callee main narrows across starts writing the binding",
    want: "decline",
    why: "interface",
    from: "clear(): void { print(0) }",
    to: "clear(): void { g = null }",
    uses: `import { g, clear } from "./lib"\nconst gv = g\nif g != null {\n  clear()\n  const k: i32 = g\n  print(k)\n}\nprint(gv)\n`,
  },
  {
    name: "a callee main narrows across stops writing the binding",
    want: "any",
    at: "lib.vl",
    from: "export function grow(): void { box.w = box.w + 1 }",
    to: "export function grow(): void { print(box.w + 1) }",
    uses: `import { box, grow } from "./lib"\nconst bw = box.w\ngrow()\nprint(bw + box.w)\n`,
  },
  {
    // A check reads no export surface, so an entry's re-export is an import like any other.
    name: "re-export of an edited function",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: `export { area, Shape as Sh } from "./lib"\nexport { size as sz } from "./lib"\n`,
  },
  {
    name: "re-export of a function whose signature changes",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "area(n: i32)",
    to: "area(n: string)",
    uses: `export { area as ar } from "./lib"\n`,
  },
  {
    name: "added export",
    want: "any",
    from: "export function spare",
    to: "export function extra(): i32 { return 1 }\nexport function spare",
  },
  {
    name: "removed export",
    want: "any",
    from: "export function spare(n: i32): i32 { return n }\n",
    to: "",
  },
  {
    name: "edit to a module main does not import directly",
    want: "serve",
    at: "mid.vl",
    from: "area(n) + 1",
    to: "area(n) + 2",
  },
  {
    name: "edit to the entry",
    want: "decline",
    why: "all",
    at: "main.vl",
    from: "print(hv)",
    to: "print(hv + 1)",
  },
  { name: "no edit", want: "serve", from: "", to: "" },
  {
    name: "a private literal-union alias main's diagnostic can spell",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: 'type AB = "a" | "b"\nfunction quiet',
    uses: 'const e: "a" | "b" = "a"\nconst b2: boolean = e\n',
  },
  {
    name: "a lib body annotation spells main's literal record",
    want: "decline",
    why: "ambient",
    from: "print(3)",
    to: "const qq: { f: i32 } = { f: 1 }\n  print(qq.f)",
    uses: "type J = { f: i32 | null }\nfunction idn<T>(v: T): T { v }\nconst xj: J = idn({ f: 4 })\nprint(xj.f ?? 0)\n",
  },
  {
    name: "a private lib type spells main's literal record",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: "type II = { f: i32 }\nfunction quiet",
    uses: "type J = { f: i32 | null }\nfunction idn<T>(v: T): T { v }\nconst xj: J = idn({ f: 4 })\nprint(xj.f ?? 0)\n",
  },
  {
    name: "a lib generic application spells main's literal record",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: "function bq(b: Bx<i32>): void { print(b.f) }\nfunction quiet",
    libUses: "export type J = { f: i32 | null }\ntype Bx<T> = { f: T }\n",
    uses: 'import { J } from "./lib"\nfunction idn<T>(v: T): T { v }\nconst xj: J = idn({ f: 4 })\nprint(xj.f ?? 0)\n',
  },
  {
    name: "a private lib self-function main's typo is near",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: "function zzq(self: string): i32 { 1 }\nfunction quiet",
    uses: 'const sq = "abc"\nprint(sq.zzz())\n',
  },
  {
    name: "a private lib type main's unknown type is near",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: "type Shapez = { w: i32 }\nfunction quiet",
    uses: "const tq: Shapy = 1\n",
  },
  {
    // Lib's own error may suggest a name main declares, so a lib diagnostic meets every
    // served ambient statement.
    name: "a lib method typo is near a private main self-function",
    want: "decline",
    why: "ambient",
    from: "n * 2",
    to: "n * 3",
    libUses: 'const sq = "abc"\nconst sr = sq.zzz()\n',
    uses: "function zzq(self: string): i32 { 1 }\n",
  },
  {
    // A getter is found from its receiver without an import, so its name is a key.
    name: "main declares a getter on a lib type lib reads",
    want: "decline",
    why: "ambient",
    from: "n * 2",
    to: "n * 3",
    libUses: "export type Cq = new i32\nfunction qv(): void {\n  const c = 3 as! Cq\n  print(c.zzg)\n}\n",
    uses: 'import { Cq } from "./lib"\nget zzg(self: Cq): i32 { 1 }\n',
  },
  {
    // Lib spells none of the fields, so no lib literal can adopt main's record.
    name: "main's private record has fields lib never spells",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: "type Mq = { zqa: i32, zqb: i32 }\nconst mq: Mq = { zqa: 1, zqb: 2 }\nprint(mq.zqa)\n",
  },
  {
    name: "main's private self-function has a name lib never spells",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: 'function zzm(self: string): i32 { 1 }\nprint("a".zzm())\n',
  },
  {
    // Lib spells `x` and `n`, but builds no record of exactly those fields, so none adopts it.
    name: "main's private record spells lib's words but no lib record's field set",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: "type Iq = { x: i32, n: i32 }\nconst iq: Iq = { x: 1, n: 2 }\nprint(iq.n)\n",
  },
  {
    name: "main spells the built-in Map",
    want: "serve",
    from: "n * 2",
    to: "n * 3",
    uses: 'const mq: Map<string, i32> = Map()\nmq["a"] = 1\nprint(mq["a"] ?? 0)\n',
  },
  {
    name: "a lib application of a declared Map spells main's literal record",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: "function bq(b: Map<i32>): void { print(b.f) }\nfunction quiet",
    libUses: "export type J = { f: i32 | null }\ntype Map<T> = { f: T }\n",
    uses: 'import { J } from "./lib"\nfunction idn<T>(v: T): T { v }\nconst xj: J = idn({ f: 4 })\nprint(xj.f ?? 0)\n',
  },
  {
    name: "main's private type spells a lib body literal's record",
    want: "decline",
    why: "ambient",
    from: "n * 2",
    to: "n * 3",
    libUses:
      "type J = { f: i32 | null }\nfunction idn<T>(v: T): T { v }\nfunction jj(): void {\n  const xj: J = idn({ f: 4 })\n  print(xj.f ?? 0)\n}\n",
    uses: "type II = { f: i32 }\n",
  },
  {
    name: "field write moves",
    want: "decline",
    why: "ambient",
    from: "b.h = 2",
    to: "b.w = null",
    libUses: "export function setf(b: { w: i32 | null, h: i32 }): void { b.h = 2 }\n",
    uses: 'import { setf } from "./lib"\nconst rw: { w: i32, h: i32 } = { w: 1, h: 2 }\nsetf(rw)\nprint(rw.h)\n',
  },
  {
    name: "alias write moves",
    want: "decline",
    why: "ambient",
    from: "c.h = 2",
    to: "c.w = null",
    libUses: "export function seta(b: { w: i32 | null, h: i32 }): void {\n  const c = b\n  c.h = 2\n}\n",
    uses: 'import { seta } from "./lib"\nconst ra: { w: i32, h: i32 } = { w: 1, h: 2 }\nseta(ra)\nprint(ra.h)\n',
  },
  {
    name: "a callee's write moves to the narrowed field",
    want: "decline",
    why: "interface",
    from: "b2.h = 1",
    to: "b2.w = null",
    libUses:
      "export let b2: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nexport function g2(): void { b2.h = 1 }\n",
    uses:
      'import { b2, g2 } from "./lib"\nif b2.w != null {\n  g2()\n  const k2: i32 = b2.w\n  print(k2)\n}\n',
  },
  {
    name: "a callee's helper write moves to the narrowed field",
    want: "decline",
    why: "interface",
    from: "b3.h = 1",
    to: "b3.w = null",
    libUses:
      "export let b3: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nfunction h3(): void { b3.h = 1 }\nexport function g3(): void { h3() }\n",
    uses:
      'import { b3, g3 } from "./lib"\nif b3.w != null {\n  g3()\n  const k3: i32 = b3.w\n  print(k3)\n}\n',
  },
  {
    name: "a callee's alias write moves to the narrowed field",
    want: "decline",
    why: "interface",
    from: "c5.h = 1",
    to: "c5.w = null",
    libUses:
      "export let b5: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nexport function g5(): void {\n  const c5 = b5\n  c5.h = 1\n}\n",
    uses:
      'import { b5, g5 } from "./lib"\nif b5.w != null {\n  g5()\n  const k5: i32 = b5.w\n  print(k5)\n}\n',
  },
  {
    name: "a callee's argument write moves to the narrowed field",
    want: "decline",
    why: "ambient",
    from: "p6.h = 1",
    to: "p6.w = null",
    libUses:
      "export let b6: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nfunction s6(p6: { w: i32 | null, h: i32 }): void { p6.h = 1 }\nexport function g6(): void { s6(b6) }\n",
    uses:
      'import { b6, g6 } from "./lib"\nif b6.w != null {\n  g6()\n  const k6: i32 = b6.w\n  print(k6)\n}\n',
  },
  {
    name: "a callee starts calling a writer",
    want: "decline",
    why: "interface",
    from: "print(3)",
    to: "w4()",
    libUses:
      "export let b4: i32 | null = 1\nfunction w4(): void { b4 = null }\n",
    uses:
      'import { b4, bump } from "./lib"\nif b4 != null {\n  bump()\n  const k4: i32 = b4\n  print(k4)\n}\n',
  },
  {
    name: "a served call is a second site of a fresh builder",
    want: "decline",
    why: "fresh",
    from: "n * 2",
    to: "n * 3",
    libUses:
      "type W = { f: f64 }\nexport function mk() { { f: 4 } }\nfunction usew(): void {\n  const w: W = mk()\n  print(w.f / 8)\n}\n",
    uses: 'import { mk } from "./lib"\nprint(mk().f)\n',
  },
  {
    name: "a lib call becomes a second site of a fresh builder",
    want: "decline",
    why: "fresh",
    from: "print(3)",
    to: "print(mk().f)",
    libUses: "export function mk() { { f: 4 } }\n",
    uses: 'import { mk } from "./lib"\nconst w: { f: f64 } = mk()\nprint(w.f / 8)\n',
  },
  {
    name: "a lib call starts delivering a fresh builder to a wider record",
    want: "decline",
    why: "fresh",
    from: "print(3)",
    to: "takeW(mk())",
    libUses: "type W = { f: f64 }\nfunction takeW(w: W): void { print(w.f) }\nexport function mk() { { f: 4 } }\n",
    uses: 'import { mk } from "./lib"\nconst z: i32 = mk().f\nprint(z)\n',
  },
  {
    name: "a lib call stops delivering a fresh builder to a wider record",
    want: "decline",
    why: "fresh",
    from: "takeW(mk())",
    to: "print(3)",
    libUses: "type W = { f: f64 }\nfunction takeW(w: W): void { print(w.f) }\nexport function mk() { { f: 4 } }\nfunction qq(): void { takeW(mk()) }\n",
    uses: 'import { mk } from "./lib"\nconst z: i32 = mk().f\nprint(z)\n',
  },
  {
    // `mk`'s site count is read by every site's check, so lib losing a site moves main's result.
    name: "a lib call stops being a second site of a fresh builder",
    want: "decline",
    why: "fresh",
    from: "print(3)",
    to: "print(4)",
    libUses: "export function mk() { { f: 4 } }\nexport function other(): void { const b = mk(); print(b.f + 1) }\n",
    uses: 'import { mk } from "./lib"\nlet v = { f: 1.5 }\nv = mk()\nprint(v.f)\n',
    also: ["lib.vl", "const b = mk(); print(b.f + 1)", "print(5)"],
  },
  {
    // Lib is in S only as mid's import, and a generic main calls from it closes over nothing moved.
    name: "a generic called from a module S only imports",
    want: "serve",
    at: "mid.vl",
    from: "area(n) + 1",
    to: "area(n) + 2",
    uses: 'import { pick } from "./lib"\nprint(pick(1, 2))\n',
  },
  {
    name: "a generic called from a module S only imports, over an unmoved closure",
    want: "serve",
    at: "hub.vl",
    from: "return 1",
    to: "return 2",
    extra: HUB,
    uses: HUB_USES,
  },
  {
    name: "a generic called from a module S only imports, over a moved closure",
    want: "decline",
    why: "demand",
    at: "hub.vl",
    from: "return 1",
    to: "return 2",
    extra: HUB,
    uses: HUB_USES,
    also: ["base.vl", "x: i32", "x: string"],
  },
  {
    name: "a generic called from a module S only imports, over a banked diagnostic",
    want: "decline",
    why: "demand",
    at: "hub.vl",
    from: "return 1",
    to: "return 2",
    extra: { ...HUB, "gen.vl": HUB["gen.vl"] + "const gbad: string = 1\n" },
    uses: HUB_USES,
  },
  {
    name: "a generic main takes as a value from a module S only imports",
    want: "decline",
    why: "demand",
    at: "hub.vl",
    from: "return 1",
    to: "return 2",
    extra: HUB,
    uses: HUB_USES + "const gh: (x: i32) => i32 = gp\nprint(gh(3))\n",
  },
  {
    // A hole's renderer is the one export std:fmt's injected import names.
    name: "a template hole beside an edit to a lib template",
    want: "serve",
    from: '"v',
    to: '"w',
    libUses: 'export function tl(n: i32): string { return "v\\{n}" }\n',
    uses: 'const tm = 3\nprint("m\\{tm}")\n',
  },
  {
    name: "the template renderer narrows its parameter",
    want: "decline",
    why: "ambient",
    at: "std:fmt",
    from: "export function toString(self: i32 | i64 | boolean | f64)",
    to: "export function toString(self: boolean)",
    extra: { "std:fmt": FMT },
    uses: 'const tm = 3\nprint("m\\{tm}")\n',
  },
  {
    name: "a bare import of std:fmt beside an edit to a lib template",
    want: "decline",
    why: "demand",
    from: '"v',
    to: '"w',
    libUses: 'export function tl(n: i32): string { return "v\\{n}" }\n',
    uses: 'import "std:fmt"\nconst tm = 3\nprint("m\\{tm}")\n',
  },
];

const graphs = (c: Case, bad: boolean): [Graph, Graph] => {
  const main = (c.uses ?? "") + MAIN + (bad ? MAIN_BAD : "");
  const g: Graph = {
    "main.vl": main,
    "lib.vl": (c.libUses ?? "") + LIB,
    "mid.vl": MID,
    ...c.extra,
  };
  const edits: [string, string, string][] = [[c.at ?? "lib.vl", c.from, c.to]];
  if (c.also) edits.push(c.also);
  const h: Graph = { ...g };
  for (const [at, from, to] of edits) {
    if (!h[at].includes(from)) throw new Error(`${c.name}: no \`${from}\` in ${at}`);
    h[at] = h[at].replace(from, to);
  }
  return [g, h];
};

const same = (a: string[], b: string[]) => a.join("\n") === b.join("\n");

// The served check against a fresh one and, listed by `diagOrderKey`, an unarmed one, as
// failure lines; `reordered` when the unarmed rows were in another order before that listing.
const grade = (
  c: Case,
  bad: boolean,
  drop = 0,
): { fails: string[]; got: Result; reordered: boolean } => {
  const [before, after] = graphs(c, bad);
  const tag = `${c.name}${bad ? " (main with errors)" : ""}`;
  const fails: string[] = [];
  const warm = instance(true, drop);
  const first = check(warm, before);
  if (first.reason !== 1) fails.push(`${tag}: the first check found a bank`);
  const got = check(warm, after);
  const fresh = check(instance(true, drop), after);
  const plain = check(instance(false, drop), after);
  if (fresh.reason !== 1 || fresh.served !== 0) {
    fails.push(`${tag}: a fresh instance served from a bank`);
  }
  if (got.rc !== fresh.rc || !same(got.diags, fresh.diags)) {
    fails.push(
      `${tag}: served rc ${got.rc} [${got.diags.join(" | ")}], whole rc ${fresh.rc} [${
        fresh.diags.join(" | ")
      }]`,
    );
  }
  if (plain.rc !== got.rc || !same(plain.canon, got.diags) || !same(got.canon, got.diags)) {
    fails.push(
      `${tag}: served [${got.diags.join(" | ")}], unarmed in order [${plain.canon.join(" | ")}]`,
    );
  }
  return { fails, got, reordered: !same(plain.diags, plain.canon) };
};

Deno.test({
  name: "a served module check gives the whole check's diagnostics and build",
  ignore: !ENABLED,
  fn() {
    const fails: string[] = [];
    const table: string[] = [];
    let reordered = 0;
    for (const c of CASES) {
      for (const bad of [false, true]) {
        const { fails: f, got, reordered: r } = grade(c, bad);
        fails.push(...f);
        if (r) reordered++;
        const why = REASON[got.reason] ?? `${got.reason}`;
        const tag = `${c.name}${bad ? " (main with errors)" : ""}`;
        table.push(`${tag}: ${why}, ${got.served} served, rc ${got.rc}`);
        const want = bad && c.badWhy ? "decline" : c.want;
        const wantWhy = bad && c.badWhy ? c.badWhy : c.why;
        if (want === "serve" && got.served === 0) {
          fails.push(`${tag}: want served, got declined (${why})`);
        }
        if (want === "decline" && got.served !== 0) {
          fails.push(`${tag}: want declined, got ${got.served} served`);
        }
        if (want === "decline" && wantWhy && why !== wantWhy) {
          fails.push(`${tag}: want declined for ${wantWhy}, got ${why}`);
        }
      }
      // A build after the served check is the build a fresh instance makes.
      const [before, after] = graphs(c, false);
      const warm = instance(true);
      check(warm, before);
      check(warm, after);
      const a = build(warm, after);
      const b = build(instance(true), after);
      const eq = typeof a === "number" || typeof b === "number"
        ? a === b
        : a.length === b.length && a.every((x, i) => x === b[i]);
      if (!eq) fails.push(`${c.name}: the build after a served check differs from a fresh build`);
    }
    if (Deno.env.get("VL_CHECK_SKIP_TABLE")) {
      console.log(`${table.join("\n")}\n${reordered} unarmed checks listed in another order`);
    }
    if (fails.length > 0) {
      throw new Error(`want every served check sound, got:\n  ${fails.join("\n  ")}`);
    }
  },
});

Deno.test({
  name: "a hash missing an ingredient serves an edit it must not",
  ignore: !ENABLED,
  fn() {
    // `IH_NO_INFERRED_TYPE | IH_NO_MENTIONS` hides a cut return's type, `IH_NO_LIVE |
    // IH_NO_MENTIONS` what a callee writes.
    const witness: [string, number][] = [
      ["inferred-return change", 64 | 16],
      ["a callee main narrows across starts writing the binding", 32768 | 16],
      // `IH_NO_TYPES | IH_NO_MENTIONS` hides both the widened type of a number binding and the
      // body store that widened it; dropping the type alone still declines.
      ["a lib body starts widening a number binding main reads", 8 | 16],
      // The same two hide a record binding's adopted type and the body delivery that adopted it.
      ["a lib body starts adopting an inferred binding main reads", 8 | 16],
      // `IH_NO_AMBIENT` hides a record spelling one module's literal can adopt in another's check.
      ["a lib body annotation spells main's literal record", 16384],
      ["a private lib type spells main's literal record", 16384],
      ["main's private type spells a lib body literal's record", 16384],
      // Each narrowing of `IH_NO_AMBIENT` loses its own case when its key is dropped:
      // `IH_NO_AMB_FIELDS`, `IH_NO_AMB_GENERIC`, `IH_NO_AMB_RENDER`, and
      // `IH_NO_AMB_RECV | IH_NO_AMB_RENDER` (the getter's read is itself a lib diagnostic).
      ["main's private type spells a lib body literal's record", 524288],
      ["a lib generic application spells main's literal record", 8388608],
      // `IH_NO_AMB_SHADOW` reads `Map<…>` as the built-in even where a module declares `Map`.
      ["a lib application of a declared Map spells main's literal record", 67108864],
      ["a lib method typo is near a private main self-function", 4194304],
      ["main declares a getter on a lib type lib reads", 2097152 | 4194304],
      // `IH_NO_LIVE` cuts a writing body to its mentions, which miss the field it writes.
      ["a callee's write moves to the narrowed field", 32768],
      ["a callee's helper write moves to the narrowed field", 32768],
      ["a callee's alias write moves to the narrowed field", 32768],
      // `IH_NO_REACH_TOKENS` drops a reach row's signature tokens, which alone spell a default:
      // the checked type renders the same with it or without.
      ["a defaulted param loses its default", 16777216],
      // `IH_NO_FRESH` hides the builder whose site count every site's check reads.
      ["a lib call stops being a second site of a fresh builder", 65536],
      // `SK_NO_KEPT_SRC | IH_NO_CROSS` keeps a bank across a generic whose closure moved, with
      // the reach below the origin dropped; dropping the reach alone still declines `demand`.
      ["a generic called from a module S only imports, over a moved closure", 134217728 | 8192],
    ];
    for (const [name, mask] of witness) {
      const { fails, got } = grade(CASES.find((c) => c.name === name)!, false, mask);
      if (got.served === 0 || fails.length === 0) {
        throw new Error(
          `want mask ${mask} to serve \`${name}\` unsoundly, got ${got.served} served` +
            ` and ${fails.length} differences`,
        );
      }
    }
    const moved = CASES.find((c) => c.name.endsWith("over a moved closure"))!;
    const alone = grade(moved, false, 8192).got;
    if (alone.served !== 0 || REASON[alone.reason] !== "demand") {
      throw new Error(`want IH_NO_CROSS alone to decline \`demand\`, got ${REASON[alone.reason]}`);
    }
  },
});

Deno.test({
  name: "a second edit on top of a served check is served from the refreshed bank",
  ignore: !ENABLED,
  fn() {
    const [g0, g1] = graphs(CASES[0], true);
    const g2 = { ...g1, "lib.vl": g1["lib.vl"].replace("print(3)", "print(5)") };
    const warm = instance(true);
    check(warm, g0);
    check(warm, g1);
    const got = check(warm, g2);
    const back = check(warm, g0);
    const want2 = check(instance(true), g2);
    const want0 = check(instance(true), g0);
    if (got.served === 0 || back.served === 0) {
      throw new Error(`want both re-checks served, got ${got.served} and ${back.served}`);
    }
    if (!same(got.diags, want2.diags) || !same(back.diags, want0.diags)) {
      throw new Error(
        `want the whole checks' diagnostics, got [${got.diags.join(" | ")}] / [${
          back.diags.join(" | ")
        }], want [${want2.diags.join(" | ")}] / [${want0.diags.join(" | ")}]`,
      );
    }
  },
});

Deno.test({
  name: "an entry checked between two checks of another keeps the other's bank",
  ignore: !ENABLED,
  fn() {
    const [g0, g1] = graphs(CASES[0], true);
    const other = `import { area } from "./lib"\nprint(area(2))\nconst no: string = 1\n`;
    const h0 = { ...g0, "other.vl": other };
    const h1 = { ...g1, "other.vl": other };
    const warm = instance(true);
    check(warm, h0);
    check(warm, h0, "other.vl");
    const got: Result[] = [check(warm, h1), check(warm, h1, "other.vl")];
    const want = [check(instance(true), h1), check(instance(true), h1, "other.vl")];
    got.forEach((r, i) => {
      if (r.served === 0 || !same(r.diags, want[i].diags)) {
        throw new Error(
          `want entry ${i} served with the whole check's rows, got ${r.served} served,` +
            ` [${r.diags.join(" | ")}] against [${want[i].diags.join(" | ")}]`,
        );
      }
    });
  },
});

// The graph lint after the last check, as `module line:col [code] message` rows.
const lintRows = (exp: Exports, paired: boolean) => {
  if (paired) exp.lintUseCheck(exp.checkGen());
  exp.lintGraph();
  const out: string[] = [];
  for (let i = 0; i < exp.lintGraphCount(); i++) {
    const code = readStr(exp.lintGraphCodeLen(i), (j) => exp.lintGraphCodeByte(i, j));
    const msg = readStr(exp.lintGraphMsgLen(i), (j) => exp.lintGraphMsgByte(i, j));
    out.push(
      `${exp.lintGraphModule(i)} ${exp.lintGraphLine(i)}:${exp.lintGraphCol(i)} [${code}] ${msg}`,
    );
  }
  return out;
};

Deno.test({
  name: "a lint paired with a served check reads the served module's typed sites",
  ignore: !ENABLED,
  fn() {
    // `prefer-interpolation` judges a chain opening with a parameter only from the typed `+`
    // links, so lib's chain is reported by a paired lint and not by an unpaired one.
    const lib = `export function greet(n: string): string { return n + " a" + " b" + " c" }
function quiet(): void { print(3) }
export function noise(): void { quiet() }
`;
    const g0: Graph = { "main.vl": `import { greet } from "./lib"\nprint(greet("x"))\n`, "lib.vl": lib };
    const g1 = { ...g0, "lib.vl": lib.replace("print(3)", "print(4)") };
    const warm = instance(true);
    check(warm, g0);
    const got = check(warm, g1);
    const served = lintRows(warm, true);
    const fresh = instance(true);
    check(fresh, g1);
    const whole = lintRows(fresh, true);
    check(fresh, g1);
    const unpaired = lintRows(fresh, false);
    if (got.served === 0) throw new Error(`want lib served, got ${REASON[got.reason]}`);
    if (!same(served, whole)) {
      throw new Error(`want [${whole.join(" | ")}] after the served check, got [${served.join(" | ")}]`);
    }
    if (same(whole, unpaired)) {
      throw new Error(`want the paired lint to differ from an unpaired one, got [${whole.join(" | ")}] for both`);
    }
  },
});

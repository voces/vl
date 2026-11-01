// A MODULE CHECK THAT SERVES UNCHANGED DEPENDENTS FROM THE BANK IS A WHOLE CHECK (S5,
// `checkSkipArm` in `compiler/driver.vl`).
//
// Each case is a three-module graph (main imports lib and mid, mid imports lib) and one edit.
// An armed instance, its bank emptied by `checkSkipArm(1)`, checks the base graph, then the
// edited one, serving what it can from the bank; an unarmed instance checks the edited graph the
// default way. One instance of each serves every case, as the LSP's does. Graded:
//   * SOUND: the served check's diagnostics equal the unarmed check's listed by `diagOrderKey`
//     (module, span, code, data, message), with the same exit code, and are themselves in that
//     order, as are the armed base check's; for the `BUILT` cases a build on the served instance
//     afterwards is byte-identical to one on a fresh instance, and differs from the base build.
//   * CONTROLS: each case says whether the check must serve a module or must decline, and why,
//     so a bank that never serves (sound and useless) or always serves cannot pass.
//   * MUTATION: each interface-hash ingredient dropped serves a witness unsoundly, so the suite
//     can see an unsound skip.
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
  ifaceHashOf(i: number, w: number): number;
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
  "writer",
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
export function ndflt(sh: Shape | null = null): i32 { return 1 }
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
    // A `null` default is typed by the declaration's check as well.
    name: "a null-defaulted param body edit",
    want: "serve",
    from: "Shape | null = null): i32 { return 1 }",
    to: "Shape | null = null): i32 { return 2 }",
    uses: `import { ndflt } from "./lib"\nprint(ndflt())\n`,
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
    why: "writer",
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
    uses: "type J = { f: f64 }\nfunction mk() { { f: 4 } }\nconst xj: J | string = mk()\nconst kk = mk()\nif xj is J { print(xj.f) }\nprint([kk][0].f)\n",
  },
  {
    name: "a private lib type spells main's literal record",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: "type II = { f: i32 }\nfunction quiet",
    uses: "type J = { f: f64 }\nfunction mk() { { f: 4 } }\nconst xj: J | string = mk()\nconst kk = mk()\nif xj is J { print(xj.f) }\nprint([kk][0].f)\n",
  },
  {
    name: "a lib generic application spells main's literal record",
    want: "decline",
    why: "ambient",
    from: "function quiet",
    to: "function bq(b: Bx<i32>): void { print(b.f) }\nfunction quiet",
    libUses: "export type J = { f: f64 }\ntype Bx<T> = { f: T }\n",
    uses: 'import { J } from "./lib"\nfunction mk() { { f: 4 } }\nconst xj: J | string = mk()\nconst kk = mk()\nif xj is J { print(xj.f) }\nprint([kk][0].f)\n',
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
    libUses: "export type J = { f: f64 }\ntype Map<T> = { f: T }\n",
    uses: 'import { J } from "./lib"\nfunction mk() { { f: 4 } }\nconst xj: J | string = mk()\nconst kk = mk()\nif xj is J { print(xj.f) }\nprint([kk][0].f)\n',
  },
  {
    name: "main's private type spells a lib body literal's record",
    want: "decline",
    why: "ambient",
    from: "n * 2",
    to: "n * 3",
    libUses:
      "type J = { f: f64 }\nfunction mk() { { f: 4 } }\nfunction jj(): void {\n  const xj: J | string = mk()\n  const kk = mk()\n  if xj is J { print(xj.f) }\n  print([kk][0].f)\n}\n",
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
    name: "a private helper two calls down moves the exported callee's write",
    want: "decline",
    why: "interface",
    from: "bp.h = 1",
    to: "bp.w = null",
    libUses:
      "export let bp: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nfunction pp(): void { bp.h = 1 }\nfunction mp(): void { pp() }\nexport function qp(): void { mp() }\n",
    uses:
      'import { bp, qp } from "./lib"\nif bp.w != null {\n  qp()\n  const kp: i32 = bp.w\n  print(kp)\n}\n',
  },
  {
    name: "a private helper reached through a function value moves the exported callee's write",
    want: "decline",
    why: "interface",
    from: "bv.h = 1",
    to: "bv.w = null",
    libUses:
      "export let bv: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nfunction pv(): void { bv.h = 1 }\nconst fv: () => void = pv\nexport function qv(): void { fv() }\n",
    uses:
      'import { bv, qv } from "./lib"\nif bv.w != null {\n  qv()\n  const kv: i32 = bv.w\n  print(kv)\n}\n',
  },
  {
    name: "a served function's call into lib moves its write",
    want: "decline",
    why: "interface",
    from: "bm.h = 1",
    to: "bm.w = null",
    libUses:
      "export let bm: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nexport function qm(): void { bm.h = 1 }\n",
    uses:
      'import { bm, qm } from "./lib"\nfunction mm(): void { qm() }\nif bm.w != null {\n  mm()\n  const km: i32 = bm.w\n  print(km)\n}\n',
  },
  {
    name: "an exported callee's own body moves its write, asked from inside a served function",
    want: "decline",
    why: "interface",
    from: "be.h = 1",
    to: "be.w = null",
    libUses:
      "export let be: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nexport function qe(): void {\n  if be.h > 0 { be.h = 1 }\n}\n",
    uses:
      'import { be, qe } from "./lib"\nfunction ue(): i32 {\n  if be.w != null {\n    qe()\n    const ke: i32 = be.w\n    return ke\n  }\n  return 0\n}\nprint(ue())\n',
  },
  {
    name: "a callee's write moves onto a list cell main narrowed",
    want: "decline",
    why: "interface",
    from: "bh[0] = 1",
    to: "bk[0] = null",
    libUses:
      "export let bk: (i32 | null)[] = [1]\nconst bh: {[i32]: i32} = Map()\nexport function qk(): void { bh[0] = 1 }\n",
    uses:
      'import { bk, qk } from "./lib"\nif bk[0] != null {\n  qk()\n  const kk: i32 = bk[0]\n  print(kk)\n}\n',
  },
  {
    name: "a callee's write moves between tables no served narrowing tests",
    want: "serve",
    from: "tb[1] = 1",
    to: "tc.push(1)",
    libUses:
      "export let bt: { w: i32 | null } = { w: 1 }\nconst tb: {[i32]: i32} = Map()\nconst tc: i32[] = []\nexport function qt(): void { tb[1] = 1 }\n",
    uses:
      'import { bt, qt } from "./lib"\nif bt.w != null {\n  qt()\n  const kt: i32 = bt.w\n  print(kt)\n}\n',
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
    why: "writer",
    from: "print(3)",
    to: "w4()",
    libUses:
      "export let b4: i32 | null = 1\nfunction w4(): void { b4 = null }\n",
    uses:
      'import { b4, bump } from "./lib"\nif b4 != null {\n  bump()\n  const k4: i32 = b4\n  print(k4)\n}\n',
  },
  {
    // The write questions main asked of `g7` answer as banked.
    name: "a callee main narrows across keeps its writes",
    want: "serve",
    from: "b7.h = 1",
    to: "b7.h = 2",
    libUses:
      "export let b7: { w: i32 | null, h: i32 } = { w: 1, h: 1 }\nexport function g7(): void { b7.h = 1 }\n",
    uses:
      'import { b7, g7 } from "./lib"\nif b7.w != null {\n  g7()\n  const k7: i32 = b7.w\n  print(k7)\n}\n',
  },
  {
    name: "a callee main narrows across keeps writing nothing",
    want: "serve",
    from: "clear(): void { print(0) }",
    to: "clear(): void { print(5) }",
    uses: `import { g, clear } from "./lib"\nif g != null {\n  clear()\n  const k: i32 = g\n  print(k)\n}\n`,
  },
  {
    // D6780: an escaping lib lambda starts writing the binding main narrows across a call.
    name: "a private lib lambda starts writing a binding main narrows",
    want: "decline",
    why: "writer",
    from: "run8(() => { print(0) })",
    to: "run8(() => { g = null })",
    libUses:
      "function run8(f: () => void): void { f() }\nfunction zz8(): void { run8(() => { print(0) }) }\nexport function noop8(): void { print(1) }\n",
    uses: `import { g, noop8 } from "./lib"\nif g != null {\n  noop8()\n  const k: i32 = g\n  print(k)\n}\n`,
  },
  {
    name: "a private lib lambda keeps writing nothing main narrows",
    want: "serve",
    from: "run8(() => { print(0) })",
    to: "run8(() => { print(2) })",
    libUses:
      "function run8(f: () => void): void { f() }\nfunction zz8(): void { run8(() => { print(0) }) }\nexport function noop8(): void { print(1) }\n",
    uses: `import { g, noop8 } from "./lib"\nif g != null {\n  noop8()\n  const k: i32 = g\n  print(k)\n}\n`,
  },
  {
    // D6781: lib starts narrowing across a call while a served main function writes and escapes.
    name: "lib starts narrowing a binding a served escaping function writes",
    want: "decline",
    why: "writer",
    badWhy: "decor",
    from: "export function noop9(): void { print(1) }\n",
    to: "export function noop9(): void { print(1) }\nfunction f9(): i32 {\n  if g != null {\n    noop9()\n    const k: i32 = g\n    return k\n  }\n  0\n}\n",
    libUses:
      "export function noop9(): void { print(1) }\nexport function reg9(h: () => void): void { h() }\n",
    uses: `import { g, reg9 } from "./lib"\nfunction w9(): void { g = null }\nreg9(w9)\n`,
  },
  {
    name: "lib starts narrowing a binding no served function writes",
    want: "serve",
    badWhy: "decor",
    from: "export function noop9(): void { print(1) }\n",
    to: "export function noop9(): void { print(1) }\nfunction f9(): i32 {\n  if g != null {\n    noop9()\n    const k: i32 = g\n    return k\n  }\n  0\n}\n",
    libUses:
      "export function noop9(): void { print(1) }\nexport function reg9(h: () => void): void { h() }\n",
    uses: `import { g, reg9 } from "./lib"\nfunction w9(): void {\n  let q9 = 1\n  q9 = 2\n  print(q9 + (g ?? 0))\n}\nreg9(w9)\n`,
  },
  {
    // Nothing the adoption reads moved: no occurrence of `mk` in S, nor its body.
    name: "a served call is a second site of a fresh builder",
    want: "serve",
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
    // Lib's own delivery refuses; main's read of `mk` keeps the type it had.
    name: "a lib call starts delivering a fresh builder to a wider record",
    want: "serve",
    from: "print(3)",
    to: "takeW(mk())",
    libUses: "type W = { f: f64 }\nfunction takeW(w: W): void { print(w.f) }\nexport function mk() { { f: 4 } }\n",
    uses: 'import { mk } from "./lib"\nconst z: i32 = mk().f\nprint(z)\n',
  },
  {
    name: "a lib call stops delivering a fresh builder to a wider record",
    want: "serve",
    from: "takeW(mk())",
    to: "print(3)",
    libUses: "type W = { f: f64 }\nfunction takeW(w: W): void { print(w.f) }\nexport function mk() { { f: 4 } }\nfunction qq(): void { takeW(mk()) }\n",
    uses: 'import { mk } from "./lib"\nconst z: i32 = mk().f\nprint(z)\n',
  },
  {
    // Main's refusal read `mk`'s site count, which lib's occurrences move.
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
    name: "lib edits elsewhere while main keeps lib's builder",
    want: "serve",
    from: "print(3)",
    to: "print(4)",
    libUses: "export function mk() { { f: 4 } }\n",
    uses: 'import { mk } from "./lib"\nlet v = { f: 1.5 }\nv = mk()\nprint(v.f)\n',
  },
  {
    // The builder's declaring statement is an input: a leaf that becomes an element read is
    // kept, where a literal binding leaf is built at the destination as the literal is.
    name: "lib's builder leaf becomes an element read",
    want: "decline",
    why: "fresh",
    from: "{ { f: 4 } }",
    to: "{ const t = [{ f: 4 }]; t[0] }",
    libUses: "export function mk() { { f: 4 } }\n",
    uses: 'import { mk } from "./lib"\nlet v = { f: 1.5 }\nv = mk()\nprint(v.f)\n',
  },
  {
    // D6750: an occurrence named like the builder that resolves elsewhere; the skip declines.
    name: "lib gains a value use named like lib2's builder",
    want: "decline",
    why: "fresh",
    from: "function quiet",
    to: "function zz(mk: i32): void { print(mk) }\nfunction quiet",
    extra: { "lib2.vl": "export function mk() { { f: 4 } }\n" },
    uses: 'import { mk } from "./lib2"\nlet v = { f: 1.5 }\nv = mk()\nprint(v.f)\n',
  },
  {
    // D6751: main's wider delivery pins lib's literal binding at main's type, so lib checked
    // alone renders the binding at its own type and the reach declines.
    name: "lib hands on a binding main delivers to a wider record",
    want: "decline",
    why: "interface",
    badWhy: "decor",
    from: "function quiet",
    to: "export function hand(): void { let w = { f: 1, g: { h: 1, k: 2 } }; w = q2; print(w.f) }\nfunction quiet",
    libUses: "export const pk = { f: 4, g: { h: 1, k: 2 } }\nconst q2 = pk\n",
    uses: 'import { pk } from "./lib"\nlet vk = { f: 1.5, g: { h: 1 } }\nvk = pk\nprint(vk.f)\n',
  },
  {
    // A builder main's wider delivery keeps: lib's new own delivery is what main's refusal reads.
    name: "lib hands on a kept builder main delivers to a wider record",
    want: "decline",
    why: "fresh",
    from: "function quiet",
    to: "export function hand(): void { let w = { f: 1 }; w = mk(); print(w.f) }\nfunction quiet",
    libUses: "export function mk() { { f: 4 } }\n",
    uses: 'import { mk } from "./lib"\nlet v = { f: 1.5 }\nv = mk()\nprint(v.f)\n',
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
    // Main spells no `.toString`; its hole reads the renderer through std:fmt's injected import.
    name: "the template renderer narrows its parameter",
    want: "decline",
    why: "interface",
    badWhy: "ambient",
    at: "std:fmt",
    from: "export function toString(self: i32 | i64 | boolean | f64)",
    to: "export function toString(self: boolean)",
    extra: { "std:fmt": FMT },
    uses: 'const tm = 3\nprint("m\\{tm}")\n',
  },
  {
    // Main never names the type: its literal of the old field set is what a check could adopt.
    name: "a private lib record renames a field main's literal spells",
    want: "decline",
    why: "ambient",
    from: "zpb: i32 }",
    to: "zpc: i32 }",
    libUses: "type Pz = { zpa: i32, zpb: i32 }\n",
    uses: "const pz = { zpa: 1, zpb: 2 }\nprint(pz.zpa)\n",
  },
  {
    name: "a private lib record retypes a field main's literal spells",
    want: "decline",
    why: "ambient",
    from: "zpb: i32 }",
    to: "zpb: i64 }",
    libUses: "type Pz = { zpa: i32, zpb: i32 }\n",
    uses: "const pz = { zpa: 1, zpb: 2 }\nprint(pz.zpa)\n",
  },
  {
    name: "a lib type main spells by name only",
    want: "decline",
    why: "ambient",
    from: "zna: i32 }",
    to: "zna: string }",
    libUses: "export type Nq = { zna: i32 }\n",
    uses: 'import { Nq } from "./lib"\nfunction nqf(q: Nq): i32 { 1 }\nprint(1)\n',
  },
  {
    // Main's own errors may suggest any name lib declares, so they decline every ambient move.
    name: "a private lib record nothing outside lib meets",
    want: "serve",
    badWhy: "ambient",
    from: "zua: i32 }",
    to: "zua: i64 }",
    libUses: "type Uq = { zua: i32 }\nfunction uqf(): i32 {\n  const u: Uq = { zua: 1 }\n  return 1\n}\n",
  },
  {
    // Main's typed bindings share the record's field names; a binding is not a field.
    name: "a private lib record whose field names main only binds",
    want: "serve",
    badWhy: "ambient",
    from: "zwb: i32 }",
    to: "zwb: i64 }",
    libUses: "type Wq = { zwa: i32, zwb: i32 }\nfunction wqf(): i32 {\n  const w: Wq = { zwa: 1, zwb: 2 }\n  return w.zwa\n}\n",
    uses: "let zwa: i32 = 1\nfunction wqm(): i32 {\n  const zwb: i32 = 2\n  return zwb\n}\nprint(zwa + wqm())\n",
  },
  {
    // A getter is found from its receiver, so main reads it without importing it.
    name: "a lib getter main reads by receiver changes its result",
    want: "decline",
    why: "ambient",
    from: "zgq(self: Cr): i32 { 1 }",
    to: 'zgq(self: Cr): string { "x" }',
    libUses: "export type Cr = new i32\nexport get zgq(self: Cr): i32 { 1 }\n",
    uses: 'import { Cr } from "./lib"\nconst cr = 3 as! Cr\nconst vq: i32 = cr.zgq\nprint(vq)\n',
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
  {
    // A body `is` against a recursive union asks the second pass about main's map delivery.
    name: "a lib body starts testing a recursive union main delivers a map to",
    want: "decline",
    why: "pass",
    from: "{ return 0 }",
    to: "{\n  if r is Cfg { return r.port }\n  return 0\n}",
    libUses: "export type Json = null | boolean | f64 | string | Json[] | { [string]: Json }\n" +
      "type Cfg = { port: i32, host: string | null }\n" +
      "export function jd(r: Json): i32 { return 0 }\n",
    uses: 'import { jd, Json } from "./lib"\nconst jm: { [string]: Json } = Map()\nprint(jd(jm))\n',
  },
  {
    // The re-export's target moves, so main's import resolves to another function.
    name: "a re-export main imports names another lib function",
    want: "decline",
    why: "interface",
    at: "rx.vl",
    from: "area as",
    to: "spare as",
    extra: { "rx.vl": 'export { area as foo } from "./lib"\n' },
    uses: 'import { foo } from "./rx"\nprint(foo(2))\n',
  },
  {
    // Main's own literal type is spelled like lib's hidden inline-union alias (D11850): its
    // message keeps the literal, so it is not banked.
    name: "a literal type spelled like a hidden union alias",
    want: "decline",
    why: "no bank",
    from: '"x" | "y"',
    to: "i32 | i64",
    libUses: 'function luq(): void {\n  const u: "x" | "y" | null = null\n  print(1)\n}\n',
    uses: 'const l0: "#lu0" = "c"\n',
  },
  {
    // A shape summary memoised while rig's bodies were still being typed is not what the
    // finished check answers (D14460), so a trailing comment on defs must not move it.
    name: "a trailing comment on a module whose import holds a write-shape question",
    want: "serve",
    badWhy: "decor",
    at: "defs.vl",
    from: "export const RIG_BOAR = 0",
    to: "export const RIG_BOAR = 0\n// a trailing note",
    extra: {
      "rig.vl": "export type Key = { fn: f64, ff: f64 }\nexport const PART_LEG = 3\n" +
        "export type View = { side: boolean }\n" +
        "export type Gait = { cycle: f64, gait: f64, stride: f64 }\n" +
        "function lerp(a: f64, b: f64, t: f64) { a + (b - a) * t }\n" +
        "export function pose(v: View, k: Key, g: Gait): i32 {\n  leg(v, 0, k, g, 0.5, 0.5, 0)\n  0\n}\n" +
        "function leg(v: View, i: i32, k: Key, g: Gait, amp: f64, run: f64, s: i32) {\n" +
        "  const extra = [k.fn, k.ff][i]\n  const fold = min(1.0, g.gait) * lerp(0.15, 0.28, run)\n}\n",
      "defs.vl": 'import { View, PART_LEG } from "./rig"\nexport const RIG_BOAR = 0\n',
    },
    uses: 'import { Buffer } from "std:buffer"\nimport { RIG_BOAR } from "./defs"\nprint(RIG_BOAR)\n',
  },
  {
    // Lib's error renders a literal union by its members, and a whole check, which also holds
    // main's alias for that set, renders it by the alias's name.
    name: "lib's error renders a literal union a private main alias names",
    want: "decline",
    why: "ambient",
    from: "print(3)",
    to: "print(4)",
    libUses: 'const e: "a" | "b" = "a"\nconst b2: boolean = e\n',
    uses: 'type AB = "a" | "b"\n',
  },
  {
    // Lib's error offers no near name, so main's private declarations cannot reach its text.
    name: "lib's error offers no name and main declares a private self-function",
    want: "serve",
    from: "print(3)",
    to: "print(4)",
    libUses: "const b3: boolean = 1\n",
    uses: "function zzq(self: string): i32 { 1 }\n",
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

// An armed instance and an unarmed one; `masked` drops `drop` from both one's later hashes.
type Pair = { warm: Exports; plain: Exports };
const pairOf = (): Pair => ({ warm: instance(true), plain: instance(false) });
const masked = (p: Pair, drop: number): Pair => {
  p.warm.ifaceHashDrop(drop);
  p.plain.ifaceHashDrop(drop);
  return p;
};

// The served check against an unarmed one listed by `diagOrderKey`, as failure lines;
// `reordered` when the unarmed rows were in another order before that listing.
const grade = (
  c: Case,
  bad: boolean,
  p: Pair,
): { fails: string[]; got: Result; reordered: boolean; before: Graph; after: Graph } => {
  const [before, after] = graphs(c, bad);
  const tag = `${c.name}${bad ? " (main with errors)" : ""}`;
  const fails: string[] = [];
  p.warm.checkSkipArm(1);
  const first = check(p.warm, before);
  if (first.reason !== 1) fails.push(`${tag}: the first check found a bank`);
  if (!same(first.canon, first.diags)) {
    fails.push(`${tag}: the armed whole check listed [${first.diags.join(" | ")}] out of order`);
  }
  const got = check(p.warm, after);
  const plain = check(p.plain, after);
  if (plain.rc !== got.rc || !same(plain.canon, got.diags) || !same(got.canon, got.diags)) {
    fails.push(
      `${tag}: served rc ${got.rc} [${got.diags.join(" | ")}], unarmed rc ${plain.rc} in order [${
        plain.canon.join(" | ")
      }]`,
    );
  }
  return { fails, got, reordered: !same(plain.diags, plain.canon), before, after };
};

// The cases whose served instance also builds: one served, one declined and rerun.
const BUILT = new Set([
  "body-only edit",
  "a generic main takes as a value from a module S only imports",
]);
const bytesEq = (a: Uint8Array | number, b: Uint8Array | number) =>
  typeof a === "number" || typeof b === "number"
    ? a === b
    : a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test({
  name: "a served module check gives the whole check's diagnostics and build",
  ignore: !ENABLED,
  fn() {
    const fails: string[] = [];
    const table: string[] = [];
    let reordered = 0;
    const p = pairOf();
    for (const c of CASES) {
      for (const bad of [false, true]) {
        const { fails: f, got, reordered: r, before, after } = grade(c, bad, p);
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
        if (bad || !BUILT.has(c.name)) continue;
        // A build after the clean check is the build a fresh instance makes, and the edit
        // reaches the bytes, so the comparison can see a build that read the bank.
        const fresh = instance(true);
        const b = build(fresh, after);
        if (!bytesEq(build(p.warm, after), b)) {
          fails.push(`${c.name}: the build after a module check differs from a fresh build`);
        }
        if (bytesEq(build(fresh, before), b)) {
          fails.push(`${c.name}: want the edit to change the build, got the same bytes`);
        }
      }
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
    // `IH_NO_INFERRED_TYPE | IH_NO_MENTIONS` hides a cut return's type, `SK_NO_EFFECT` what a
    // callee writes (the banked write questions are not asked again).
    const witness: [string, number][] = [
      ["inferred-return change", 64 | 16],
      ["a callee main narrows across starts writing the binding", 2048 | 16],
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
      // `IH_NO_AMB_FIELDS`, `IH_NO_AMB_GENERIC`, `IH_NO_AMB_NEAR`, `SK_NO_AMB_ROWS`, and
      // `IH_NO_AMB_RECV | IH_NO_AMB_NEAR` (the getter's read is itself a lib diagnostic).
      ["main's private type spells a lib body literal's record", 524288],
      ["a lib generic application spells main's literal record", 8388608],
      // `IH_NO_AMB_SHADOW` reads `Map<…>` as the built-in even where a module declares `Map`.
      ["a lib application of a declared Map spells main's literal record", 67108864],
      ["a lib method typo is near a private main self-function", 4194304],
      ["lib's error renders a literal union a private main alias names", 32768],
      ["main declares a getter on a lib type lib reads", 2097152 | 4194304],
      // `SK_NO_EFFECT` keeps a bank whose write questions about a callee answer differently.
      ["a callee's write moves to the narrowed field", 2048],
      ["a callee's helper write moves to the narrowed field", 2048],
      ["a callee's alias write moves to the narrowed field", 2048],
      ["a private helper two calls down moves the exported callee's write", 2048],
      ["a private helper reached through a function value moves the exported callee's write", 2048],
      ["an exported callee's own body moves its write, asked from inside a served function", 2048],
      ["a served function's call into lib moves its write", 2048],
      // `SK_NO_WRITER` drops the writer closure of a name a whole-program question asked about.
      ["a private lib lambda starts writing a binding main narrows", 16],
      ["lib starts narrowing a binding a served escaping function writes", 16],
      // `IH_NO_REACH_TOKENS` drops a reach row's signature tokens, which alone spell a default:
      // the checked type renders the same with it or without.
      ["a defaulted param loses its default", 16777216],
      // `SK_NO_FRESH_BODY` drops a builder's declaring statement, `SK_NO_FRESH_OCC` its
      // occurrences in S, and `SK_NO_FRESH_SPLIT` the kept-or-own split of its deliveries.
      ["lib's builder leaf becomes an element read", 65536],
      ["a lib call stops being a second site of a fresh builder", 1073741824],
      // With `SK_NO_FRESH_OCC` too: lib's new site of `mk` alone declines it at stage 0.
      ["lib hands on a kept builder main delivers to a wider record", 1073741824 | -2147483648],
      // `IH_NO_TYPES` hides the type main's delivery pins a lib binding at.
      ["lib hands on a binding main delivers to a wider record", 8],
      // `SK_NO_KEPT_SRC | IH_NO_CROSS` keeps a bank across a generic whose closure moved, with
      // the reach below the origin dropped; dropping the reach alone still declines `demand`.
      ["a generic called from a module S only imports, over a moved closure", 134217728 | 8192],
    ];
    const p = pairOf();
    for (const [name, mask] of witness) {
      const { fails, got } = grade(CASES.find((c) => c.name === name)!, false, masked(p, mask));
      if (got.served === 0 || fails.length === 0) {
        throw new Error(
          `want mask ${mask} to serve \`${name}\` unsoundly, got ${got.served} served` +
            ` and ${fails.length} differences`,
        );
      }
    }
    const moved = CASES.find((c) => c.name.endsWith("over a moved closure"))!;
    const alone = grade(moved, false, masked(p, 8192)).got;
    if (alone.served !== 0 || REASON[alone.reason] !== "demand") {
      throw new Error(`want IH_NO_CROSS alone to decline \`demand\`, got ${REASON[alone.reason]}`);
    }
    // `IH_NO_IMPORT_MAP` hides a moved re-export from the resolved guard; the reach row's own
    // change still declines it, one guard later.
    const rx = CASES.find((c) => c.name.startsWith("a re-export main imports"))!;
    const late = grade(rx, true, masked(p, 262144)).got;
    if (late.served !== 0 || REASON[late.reason] !== "decor") {
      throw new Error(`want IH_NO_IMPORT_MAP to decline \`decor\`, got ${REASON[late.reason]}`);
    }
    // A bank read under another mask is no bank: its hashes were taken with other ingredients.
    const unmasked = check(masked(p, 0).warm, graphs(moved, false)[0]);
    if (unmasked.served !== 0 || REASON[unmasked.reason] !== "no bank") {
      throw new Error(`want the mask-262144 bank unread at mask 0, got ${REASON[unmasked.reason]}`);
    }
  },
});

Deno.test({
  name: "a second edit on top of a served check is served from the refreshed bank",
  ignore: !ENABLED,
  fn() {
    // Main's self-function error carries data, and a served module's readings are carried, so
    // every step is compared with the whole check's rows and with its hashes.
    const uses = "function get(self: {[i32]: i32}, k: i32): i32 { k }\n";
    const [g0, g1] = graphs({ ...CASES[0], uses }, true);
    const g2 = { ...g1, "lib.vl": g1["lib.vl"].replace("print(3)", "print(5)") };
    // A mid edit after a lib edit, so mid's reach of lib is the one the served check carried.
    const g3 = { ...g2, "mid.vl": g2["mid.vl"].replace("+ 1", "+ 2") };
    const warm = instance(true);
    const plain = instance(false);
    const hashes = (e: Exports) => {
      const out: number[] = [];
      for (let i = 0; i < e.ifaceHashCount(); i++) {
        for (let w = 0; w < 9; w++) out.push(e.ifaceHashOf(i, w));
      }
      return out.join(",");
    };
    check(warm, g0);
    [g1, g2, g3, g0].forEach((g, i) => {
      const got = check(warm, g);
      const want = check(plain, g);
      const held = hashes(warm) === hashes(plain);
      if (got.served === 0 || !same(got.diags, want.diags) || !held) {
        throw new Error(
          `want step ${i + 1} served with the whole check's rows and hashes, got ${got.served}` +
            ` served (${REASON[got.reason]}), [${got.diags.join(" | ")}] against` +
            ` [${want.diags.join(" | ")}], hashes ${held ? "equal" : "differ"}`,
        );
      }
    });
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
    // links, so lib's chain is reported by a paired lint and not by an unpaired one; main's
    // chain is in a served module, whose links the served check carries from the bank.
    const lib = `export function greet(n: string): string { return n + " a" + " b" + " c" }
function quiet(): void { print(3) }
export function noise(): void { quiet() }
`;
    const main = `import { greet } from "./lib"
function shout(n: string): string { return n + " !" + " ?" + " ." }
print(greet(shout("x")))
`;
    const g0: Graph = { "main.vl": main, "lib.vl": lib };
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

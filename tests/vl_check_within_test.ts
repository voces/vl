// A TARGET SERVED FROM AN IMPORTER'S CHECK IN THE SAME INVOCATION IS ITS OWN CHECK (S5,
// `wiArm` in `compiler/driver.vl`).
//
// Each case is a small graph whose every module is a target, checked importers first on one
// instance armed with all of them, the way a multi-target `vl check` runs; each target is also
// checked alone on a fresh instance. Graded:
//   * SOUND: a served target's diagnostics (none), report-stream rows and lint rows equal its
//     own check's, and an unserved target's equal them too.
//   * CONTROLS: each case names one target that must be served, or must be declined for one
//     guard's reason, so a bank that never serves or always serves cannot pass.
//   * MASK: a declined case run with that guard's mask bit is served and differs from the
//     target's own check, so each guard is shown to stand between a serve and a wrong answer.
//
// GATING: needs the seed.

import { COMPILER, exists, STD } from "./support/tree.ts";

const ENABLED = exists(COMPILER);
if (!ENABLED) console.warn("[check-within] skipped — missing the seed");

// deno-lint-ignore no-explicit-any
type Exports = any;

const MODULE = ENABLED
  ? new WebAssembly.Module(Deno.readFileSync(COMPILER))
  : undefined;
const fresh = (): Exports => new WebAssembly.Instance(MODULE!, {}).exports as Exports;

const push = (fn: (cp: number) => number, text: string) => {
  for (const ch of text) fn(ch.codePointAt(0)!);
};
const readStr = (len: number, at: (j: number) => number) => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

type Graph = Record<string, string>;
const KEY = (f: string) => `/proj/${f}`;

// Load the graph rooted at `entry`; returns the module keys in commit order (module index).
const load = (exp: Exports, g: Graph, entry: string): string[] => {
  exp.modReset();
  const keys: string[] = [];
  const commit = (key: string, src: string) => {
    keys.push(key);
    push(exp.modKeyPush, key);
    push(exp.modSrcPush, src);
    exp.modCommit(1);
  };
  commit(KEY(entry), g[entry]);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const pend: string[] = [];
    for (let i = 0; i < n; i++) {
      pend.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const k of pend) {
      const src = k.startsWith("std:")
        ? Deno.readTextFileSync(`${STD}/${k.slice(4)}.vl`)
        : g[k.slice(k.lastIndexOf("/") + 1)];
      if (src === undefined) throw new Error(`no source for ${k}`);
      commit(k, src);
    }
  }
  exp.srcReset();
  push(exp.srcPush, g[entry]);
  return keys;
};

const STREAMS = ["redun", "rcoal", "isval", "expInf"];
// Module `mod`'s report-stream rows, by stream, position and message.
const streamRows = (e: Exports, mod: number): string[] => {
  const o: string[] = [];
  for (const s of STREAMS) {
    for (let i = 0; i < e[`${s}Count`](); i++) {
      if (e[`${s}ModuleAt`](i) !== mod) continue;
      const line = s === "redun" ? e.redunSLineAt(i) : e[`${s}LineAt`](i);
      const col = s === "redun" ? e.redunSColAt(i) : e[`${s}ColAt`](i);
      o.push(`${s} ${line}:${col} ${readStr(e[`${s}MsgLen`](i), (j) => e[`${s}MsgByte`](i, j))}`);
    }
  }
  return o;
};
const diagRows = (e: Exports, keys: string[]): string[] => {
  const o: string[] = [];
  for (let i = 0; i < e.diagCount(); i++) {
    const msg = readStr(e.diagMsgLen(i), (j) => e.diagMsgAt(i, j));
    const span = `${e.diagLine(i)}:${e.diagCol(i)}-${e.diagEndLine(i)}:${e.diagEndCol(i)}`;
    o.push(`${keys[e.diagModule(i)] ?? "?"} ${span} ${msg}`);
  }
  return o;
};
// A served check's banked type diagnostics, in the same form.
const servedDiagRows = (e: Exports, keys: string[]): string[] => {
  const o: string[] = [];
  for (let i = 0; i < e.wiDiagCount(); i++) {
    const msg = readStr(e.wiDiagMsgLen(i), (j) => e.wiDiagMsgAt(i, j));
    const span = `${e.wiDiagLine(i)}:${e.wiDiagCol(i)}-${e.wiDiagEndLine(i)}:${e.wiDiagEndCol(i)}`;
    o.push(`${keys[e.wiDiagMod(i)] ?? "?"} ${span} ${msg}`);
  }
  return o;
};
const lintRows = (e: Exports): string[] => {
  e.lintUseCheck(e.checkGen());
  e.lintSrc();
  const o: string[] = [];
  for (let i = 0; i < e.lintCount(); i++) {
    o.push(`${e.lintLine(i)}:${e.lintCol(i)} ${readStr(e.lintMsgLen(i), (j) => e.lintMsgByte(i, j))}`);
  }
  return o;
};

// The targets most-reaching first, as the CLI queues them; ties keep the graph's order.
const order = (g: Graph): string[] => {
  const scan = fresh();
  const imps: Record<string, string[]> = {};
  for (const f of Object.keys(g)) {
    scan.modReset();
    push(scan.modKeyPush, KEY(f));
    push(scan.modSrcPush, g[f]);
    scan.modCommit(1);
    imps[f] = [];
    for (let i = 0; i < scan.modPendingCount(); i++) {
      const k = readStr(scan.modPendingLen(i), (j) => scan.modPendingAt(i, j));
      const b = k.slice(k.lastIndexOf("/") + 1);
      if (g[b] !== undefined) imps[f].push(b);
    }
  }
  const reach = (f: string) => {
    const seen = new Set([f]);
    const work = [f];
    while (work.length) {
      for (const d of imps[work.pop()!]) if (!seen.has(d)) seen.add(d) && work.push(d);
    }
    return seen.size;
  };
  return Object.keys(g).map((f, i) => ({ f, i, r: reach(f) }))
    .sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.f);
};

// `wiStat`'s reasons, by index.
const REASON = [
  "served",
  "unseen",
  "dirty",
  "entry",
  "demand",
  "fresh",
  "writer",
  "ambient",
  "asks",
  "graph",
];

type Verdict = { reason: string; sound: boolean; why: string };

// Check every target of `g` on one armed instance (guard mask `mask`); each target's verdict.
const run = (g: Graph, mask = 0): Record<string, Verdict> => {
  const sh = fresh();
  sh.wiArm(1, mask);
  for (const f of Object.keys(g)) {
    push(sh.wiTargetPush, KEY(f));
    sh.wiTargetCommit();
  }
  const banked: Record<string, string[]> = {};
  const out: Record<string, Verdict> = {};
  for (const t of order(g)) {
    const before = REASON.map((_, r) => sh.wiStat(r));
    const keys = load(sh, g, t);
    const rc = sh.checkSrc();
    const served = sh.wiServed();
    const reason = REASON.find((_, r) => sh.wiStat(r) !== before[r]) ?? "?";
    const mine = {
      rc,
      diags: served ? servedDiagRows(sh, keys) : diagRows(sh, keys),
      streams: served ? banked[KEY(t)] ?? ["<no rows banked>"] : streamRows(sh, 0),
      lint: [] as string[],
    };
    for (let i = 0; i < sh.wiBankedCount(); i++) {
      // As the CLI reads them: a target banked clean from a check with errors swaps in the
      // redundant-annotation rows that check withheld.
      const held = Boolean(sh.wiBankedHeld(i));
      if (held) sh.wiHeldSwap();
      banked[keys[sh.wiBankedMod(i)]] = streamRows(sh, sh.wiBankedMod(i));
      if (held) sh.wiHeldSwap();
    }
    mine.lint = lintRows(sh);
    const f = fresh();
    const fk = load(f, g, t);
    const own = {
      rc: f.checkSrc(),
      diags: diagRows(f, fk),
      streams: streamRows(f, 0),
      lint: lintRows(f),
    };
    const a = JSON.stringify(mine), b = JSON.stringify(own);
    out[t] = { reason, sound: a === b, why: a === b ? "" : `served ${a}\nown    ${b}` };
  }
  return out;
};

type Case = {
  name: string;
  graph: Graph;
  target: string;
  // `served`, or the reason the target must be declined for.
  want: string;
  // For a decline: the guard's mask bit, under which the target is served unsoundly.
  mask?: number;
};

const ST = "export let g: i32 | null = 1\n" +
  "let hh: () => void = () => { print(0) }\n" +
  "export function reg(h: () => void): void { hh = h }\n" +
  "export function poke(): void { hh() }\n";
const NARROW = 'import { g, poke } from "./st"\n' +
  "export function f(): i32 {\n  if g != null {\n    poke()\n    const k = g\n" +
  "    const j = k ?? 0\n    return j\n  }\n  0\n}\n";

// `Q` declared beside the importer, with `x` of type `xTy`; G declares `P = { x: i32, tag }`.
const TWIN_MAIN = (xTy: string) =>
  `import { mk } from "./lib"\nexport type Q = { x: ${xTy}, tag: string }\n` +
  'const q: Q = { x: 3, tag: "b" }\nprint(mk())\nprint(q.tag)\n';
const TWIN_LIB = (read: string) =>
  "export type P = { x: i32, tag: string }\nexport function mk(): i32 {\n" +
  `  const p: P = { x: 1, tag: "a" }\n  ${read}\n}\n`;
const WRAP = "export function wrap<T>(v: T): T[] { [v] }\n";
const FILL = "export function fill<T>(n: i32, v: T): T[] {\n  const o: T[] = []\n  let i = 0\n" +
  "  while i < n {\n    o.push(v)\n    i = i + 1\n  }\n  o\n}\n";
const WRAP_MID = 'import { wrap } from "./lib"\nexport function m(): i32 { wrap(1)[0] }\n';

// Mask bits, as `WI_NO_*` in `compiler/driver.vl` numbers them.
const NO_ENTRY = 1, NO_DEMAND = 2, NO_WRITER = 8, NO_AMBIENT = 16, NO_RENDER = 128;
const NO_ADOPTED = 256, NO_DIAG_NAMES = 4096, NO_OUTSIDE = 8192, NO_INERT_OUT = 16384;
const NO_LIT_ORDER = 32768, NO_ARENA = 64, NO_ASKS = 32;
const LOOSE_ARGS = 65536, LOOSE_GETTER = 131072, LOOSE_SETTLED = 262144, LOOSE_CALLS = 524288;

// G builds a `J` from an inferred builder; main declares a record of the literal's own storage.
const BUILT_LIB = (body: string) =>
  `type J = { f: i32 | null }\nfunction id<T>(v: T): T { v }\nfunction mk() { ${body} }\n` +
  "export function jj(): void {\n  const xj: J = mk()\n  const kk = mk()\n" +
  "  print(xj.f ?? 0)\n  print([kk][0].f)\n}\n";
const BUILT_MAIN = 'import { jj } from "./lib"\ntype II = { f: i32 }\njj()\n';

// The fresh guard, the asks guard and the outside guard's undo halves have no mask witness: no
// graph found shows a served answer that differs once they are dropped, so they are defensive.
// The ambient guard's arena half is witnessed only beside a dropped literal filter.
// The twin, called-generic and narrowed ambient keys carry must-serve and must-decline controls.
const CASES: Case[] = [
  {
    name: "a closed function import is served",
    graph: {
      "main.vl": 'import { area } from "./lib"\nprint(area(2))\n',
      "lib.vl": "export function area(n: i32): i32 { n * 2 }\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "an uncalled untyped export is inferred only when its module is the entry",
    graph: {
      "main.vl": 'import { f } from "./lib"\nprint(f(2))\n',
      "lib.vl": "export function f(n: i32): i32 { n * 2 }\nexport function g(x) { x + 1 }\n",
    },
    target: "lib.vl",
    want: "entry",
    mask: NO_ENTRY,
  },
  {
    name: "an importer's push decides an empty list binding's element type",
    graph: {
      "main.vl": 'import { xs } from "./lib"\nxs.push("a")\nprint(xs.length)\n',
      "lib.vl": "export let xs = []\n",
    },
    target: "lib.vl",
    want: "demand",
    mask: NO_DEMAND,
  },
  {
    name: "an importer's annotation adopts a record binding into a type of G",
    graph: {
      "main.vl": 'import { P, pt, px } from "./lib"\nconst w: P = pt\nprint(w.x / 8 + px())\n',
      "lib.vl": "export type P = { x: f64, y: f64 }\nexport let pt = { x: 1, y: 2 }\n" +
        "export function px(): f64 {\n  const q = pt ?? pt\n  q.x\n}\n",
    },
    target: "lib.vl",
    want: "demand",
    mask: NO_ADOPTED,
  },
  {
    name: "a literal union declared outside G renders G's message",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": 'export function area(n: i32): i32 {\n  const k: "a" | "b" = "a"\n' +
        '  const t = k ?? "b"\n  n\n}\n',
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_AMBIENT,
  },
  {
    name: "the ambient guard's render half alone stands between the serve and the message",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": 'export function area(n: i32): i32 {\n  const k: "a" | "b" = "a"\n' +
        '  const t = k ?? "b"\n  n\n}\n',
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_RENDER,
  },
  {
    // The merged check renders `q`'s redundant annotation as main's `AB`, G's own as the union.
    name: "a redundant annotation G renders by an outside union's name is not served",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": 'export function area(n: i32): i32 {\n  const k: "a" | "b" = "a"\n' +
        '  const q: "a" | "b" = k\n  print(q)\n  n\n}\n',
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_INERT_OUT,
  },
  {
    // The merged render is `{[string]: AB}`: past one word and its `[]`s, any part may name.
    name: "a redundant annotation G renders with an outside union inside a map is not served",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": 'export function area(n: i32): i32 {\n  const k: Map<string, "a" | "b"> = Map()\n' +
        '  const q: Map<string, "a" | "b"> = k\n  print(q.length)\n  n\n}\n',
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_INERT_OUT,
  },
  {
    // A string literal set renders in the order its first-interned spelling gave it.
    name: "a row G renders as a string literal union is not served beside another member order",
    graph: {
      "main.vl": 'import { area } from "./lib"\nconst z: "b" | "a" = "b"\nprint(z)\nprint(area(2))\n',
      "lib.vl": 'export function area(n: i32): i32 {\n  const k: "a" | "b" = "a"\n' +
        '  const t = k ?? "b"\n  print(t)\n  n\n}\n',
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_LIT_ORDER,
  },
  {
    name: "an error G renders as a string literal union is not served beside a sibling's order",
    graph: {
      "main.vl": 'import { two } from "./g2"\nimport { area } from "./lib"\nprint(two())\n' +
        "print(area(2))\n",
      "g1.vl": 'export function one(): "a" | "b" { "a" }\n',
      "g2.vl": 'export function two(): "b" | "a" { "b" }\n',
      "lib.vl": 'import { one } from "./g1"\nimport { two } from "./g2"\n' +
        "export function area(n: i32): i32 {\n  const k = one()\n  const j: i32 = k\n" +
        "  print(two())\n  n + j\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_LIT_ORDER,
  },
  {
    name: "an error G renders by a literal union alias is not served beside a sibling's alias",
    graph: {
      "main.vl": 'import { two } from "./g2"\nimport { area } from "./lib"\nprint(two())\n' +
        "print(area(2))\n",
      "g1.vl": 'export type L1 = "p" | "q"\nexport function one(): i32 { 1 }\n',
      "g2.vl": 'export type L2 = "q" | "p"\nexport function two(): i32 { 2 }\n',
      "lib.vl": 'import { one } from "./g1"\nimport { two } from "./g2"\n' +
        'function lit(c: boolean): "p" | "q" {\n  if c { return "p" }\n  "q"\n}\n' +
        "export function area(n: i32): i32 {\n  const j: i32 = lit(n > 1)\n" +
        "  n + j + one() + two()\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_LIT_ORDER,
  },
  {
    name: "a row G renders by a literal union alias is not served beside a sibling's alias",
    graph: {
      "main.vl": 'import { two } from "./g2"\nimport { area } from "./lib"\nprint(two())\n' +
        "print(area(2))\n",
      "g1.vl": 'export type L1 = "p" | "q"\nexport function one(): i32 { 1 }\n',
      "g2.vl": 'export type L2 = "q" | "p"\nexport function two(): i32 { 2 }\n',
      "lib.vl": 'import { one } from "./g1"\nimport { two } from "./g2"\n' +
        'function lit(c: boolean): "p" | "q" {\n  if c { return "p" }\n  "q"\n}\n' +
        "export function area(n: i32): i32 {\n  const k = lit(n > 1)\n" +
        "  if k != null { n + one() + two() } else { 0 }\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_LIT_ORDER,
  },
  {
    name: "a row G renders by the one alias of its literal union is served",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype L2 = "q" | "r"\nconst y: L2 = "q"\n' +
        "print(y)\nprint(area(2))\n",
      "lib.vl": 'type L1 = "p" | "q"\nexport function area(n: i32): i32 {\n' +
        '  const z: L1 = "p"\n  if z != null { n } else { 0 }\n}\n',
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a row G renders as a numeric literal union is served beside another member order",
    graph: {
      "main.vl": 'import { area } from "./lib"\nconst z: 2 | 1 = 2\nprint(z)\nprint(area(2))\n',
      "lib.vl": "export function area(n: i32): i32 {\n  const k: 1 | 2 = 1\n" +
        "  const t = k ?? 2\n  print(t)\n  n\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a row that renders no type is served beside an outside union",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": "const stack: i32[] = [1, 2]\nexport function area(n: i32): i32 {\n" +
        "  let s = n\n  if stack.length > 0 { s = s + (stack.pop() ?? 0) }\n  s\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a redundant annotation that renders a map of a primitive is served beside one",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": "export function area(n: i32): i32 {\n  const k: Map<string, i32> = Map()\n" +
        "  const q: Map<string, i32> = k\n  print(q.length)\n  n\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a redundant annotation that renders a primitive is served beside an outside union",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": "export function area(n: i32): i32 {\n  const b: boolean = n > 1\n" +
        "  print(b)\n  n\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a redundant annotation that renders an array of a primitive is served beside one",
    graph: {
      "main.vl": 'import { area } from "./lib"\ntype AB = "a" | "b"\nconst x: AB = "a"\n' +
        "print(area(2))\nprint(x)\n",
      "lib.vl": 'export function area(n: i32): i32 {\n  const o: string[] = ["x"]\n' +
        "  print(o[0])\n  n\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a callback an importer registers writes a global G narrows across a call",
    graph: {
      "main.vl": 'import { f } from "./lib"\nimport { g, reg } from "./st"\n' +
        "function w9(): void { g = null }\nreg(w9)\nprint(f())\n",
      "lib.vl": NARROW,
      "st.vl": ST,
    },
    target: "lib.vl",
    want: "writer",
    mask: NO_WRITER,
  },
  {
    name: "a callback that writes nothing G asked about is served",
    graph: {
      "main.vl": 'import { f } from "./lib"\nimport { reg } from "./st"\n' +
        "function w9(): void { print(2) }\nreg(w9)\nprint(f())\n",
      "lib.vl": NARROW,
      "st.vl": ST,
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a same-shape record declared outside G is one type with G's own",
    graph: {
      "main.vl": TWIN_MAIN("i32"),
      "lib.vl": TWIN_LIB("p.x"),
    },
    target: "lib.vl",
    want: "served",
  },
  {
    // Each record renders by its own name, so a row naming G's `P` is served beside `Q`.
    name: "a same-shape record outside G is served beside a row that renders G's record",
    graph: {
      "main.vl": TWIN_MAIN("i32"),
      "lib.vl": TWIN_LIB("(p ?? p).x"),
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a same-shape record outside G is one type with G's beside a row that renders a primitive",
    graph: {
      "main.vl": TWIN_MAIN("i32"),
      "lib.vl": TWIN_LIB("const b: boolean = p.x > 0\n  if b { p.x } else { 0 }"),
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a same-shape record checked before G is served beside a row that renders G's record",
    graph: {
      "main.vl": 'import { q } from "./oth"\nimport { mk } from "./lib"\nprint(mk())\nprint(q.tag)\n',
      "oth.vl": 'export type Q = { x: i32, tag: string }\nexport const q: Q = { x: 3, tag: "b" }\n',
      "lib.vl": TWIN_LIB("const q: P = p\n  q.x"),
    },
    target: "lib.vl",
    want: "served",
  },
  {
    // `r,g,b` and `w,h,d` once shared a field-set key.
    name: "a record outside G whose field set no G literal spells is served",
    graph: {
      "main.vl": 'import { mk } from "./lib"\ntype Col = { r: i32, g: i32, b: i32 }\n' +
        "const c: Col = { r: 1, g: 2, b: 3 }\nprint(mk() + c.g)\n",
      "lib.vl": "function box() { { w: 1, h: 2, d: 3 } }\nexport function mk(): i32 { box().h }\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a record outside G that differs in one field type is not a twin",
    graph: {
      "main.vl": TWIN_MAIN("f64"),
      "lib.vl": TWIN_LIB("p.x"),
    },
    target: "lib.vl",
    want: "ambient",
  },
  {
    name: "a record outside G whose field G spells only on its own other-shaped record is served",
    graph: {
      "main.vl": 'import { mk } from "./lib"\ntype Rng = { s: i32 }\nconst r: Rng = { s: 1 }\n' +
        "print(mk())\nprint(r.s)\n",
      "lib.vl": "export type W = { s: f64, t: i32 }\nexport function mk(): i32 {\n" +
        "  const w: W = { s: 0.5, t: 2 }\n  w.t\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a private type outside G named like G's own is a different type",
    graph: {
      "main.vl": 'import { mk } from "./lib"\ntype Key = { k: i32 }\nconst q: Key = { k: 1 }\n' +
        "print(mk())\nprint(q.k)\n",
      "lib.vl": 'type Key = { a: string }\nexport function mk(): i32 {\n  const q: Key = { a: "x" }\n' +
        "  q.a.length\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "an operator outside G on a `new` type G never names is served",
    graph: {
      "main.vl": 'import { g } from "./lib"\nimport { mkV } from "./v"\nprint(g() + mkV()[1])\n',
      "v.vl": "export type V = new { base: i32, length: i32 }\n" +
        'export function "[]"(self: V, i: i32): i32 { self.base + i }\n' +
        "export function mkV(): V { return { base: 1, length: 2 } }\n",
      "lib.vl": "export function g(): i32 {\n  const r = { base: 1, size: 2 }\n  r.base\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "an operator outside G on a structural type can index G's own record",
    graph: {
      "main.vl": 'import { g } from "./lib"\nimport { mk } from "./v"\nprint(mk() + g())\n',
      "v.vl": "export type V = { base: i32, length: i32 }\n" +
        'export function "[]"(self: V, i: i32): i32 { self.base + i }\n' +
        "export function mk(): i32 { 1 }\n",
      "lib.vl": "type W = { base: i32, length: i32 }\nexport function g(): i32 {\n" +
        "  const r: W = { base: 1, length: 2 }\n  r[0]\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    // `g`'s summary also asks a write question of the operator outside G, which the asks guard
    // declines; dropping both is what serves the outside operator unsoundly.
    mask: NO_AMBIENT | NO_ASKS,
  },
  {
    name: "a push G makes on a list an outside body types declines its target on demand",
    graph: {
      "main.vl": 'import { add, xs } from "./lib"\nimport { u } from "./use"\nprint(add("a") + u())\n',
      "lib.vl": "export let xs = []\nexport function add(s: string): i32 {\n  xs.push(s)\n  0\n}\n",
      "use.vl": 'import { xs } from "./lib"\nexport function u(): i32 {\n  xs.push(1)\n  0\n}\n',
    },
    target: "use.vl",
    want: "demand",
  },
  {
    name: "a closed generic an importer only calls is served",
    graph: {
      "main.vl": 'import { wrap } from "./lib"\nimport { m } from "./mid"\n' +
        'print(wrap("s")[0])\nprint(m())\n',
      "mid.vl": WRAP_MID,
      "lib.vl": WRAP,
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "a closed generic an importer takes as a value declines its callers",
    graph: {
      "main.vl": 'import { wrap } from "./lib"\nimport { m } from "./mid"\n' +
        'const f = wrap\nprint(f("s")[0])\nprint(m())\n',
      "mid.vl": WRAP_MID,
      "lib.vl": WRAP,
    },
    target: "mid.vl",
    want: "demand",
  },
  {
    name: "a signed literal binding an importer delivers into a wider number is served",
    graph: {
      "main.vl": 'import { NONE } from "./lib"\nconst x: i64 = NONE\nconst y: f64 = NONE\n' +
        "print(x)\nprint(y / 8)\n",
      "lib.vl": "export const NONE = -1\nexport function f(): i32 { NONE }\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a list of scalar literals and primitive names an importer pushes to is served",
    graph: {
      "main.vl": 'import { ks, ns, ws } from "./lib"\nks.push(2.0)\nws.push("c")\nns.push(3)\n' +
        "print(ks[2] / 8)\nprint(ws.length)\n",
      "lib.vl": 'let B = 2\nexport let ks = [0.5, -0.25]\nexport let ws = ["a", "b"]\n' +
        "export let ns = [1, B]\nexport function f(): f64 { ks[0] }\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a closed call's result an importer delivers onward is served",
    graph: {
      "main.vl": 'import { C } from "./lib"\nconst x: i32 | null = C\nprint(x ?? 0)\n',
      "lib.vl": "export function mk(a: f64): i32 { 1 }\nexport const C = mk(0.5)\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a call of a function with no declared return still declines its binding",
    graph: {
      "main.vl": 'import { xs } from "./lib"\nxs.push("a")\nprint(xs.length)\n',
      "lib.vl": "function mk() { [] }\nexport let xs = mk()\n",
    },
    target: "lib.vl",
    want: "demand",
  },
  {
    name: "a list holding a name of a non-primitive type still declines its binding",
    graph: {
      "main.vl": 'import { xs } from "./lib"\nxs[0].push("a")\nprint(xs.length)\n',
      "lib.vl": "const e = []\nexport let xs = [e]\n",
    },
    target: "lib.vl",
    want: "demand",
  },
  {
    name: "a generic call whose scalar literal argument binds its type parameter is served",
    graph: {
      "main.vl": 'import { xs } from "./lib"\nxs.push(4)\nprint(xs[3])\n',
      "lib.vl": 'import { fill } from "./gen"\nexport let xs = fill(3, -1)\n',
      "gen.vl": FILL,
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a generic call whose argument an importer can still retype declines its binding",
    graph: {
      "main.vl": 'import { xs } from "./lib"\nxs[0].push("a")\nprint(xs.length)\n',
      "lib.vl": 'import { fill } from "./gen"\nexport let xs = fill(2, [])\n',
      "gen.vl": FILL,
    },
    target: "lib.vl",
    want: "demand",
  },
  {
    name: "a generic call binding its type parameter through a wider annotation declines",
    graph: {
      "main.vl": 'import { xs } from "./lib"\nxs.push("a")\nprint(xs.length)\n',
      "lib.vl": 'import { same } from "./gen"\nexport let xs = same(1, [])\n',
      "gen.vl": "export function same<T>(n: i32, v: T[]): T[] { v }\n",
    },
    target: "lib.vl",
    want: "demand",
  },
  {
    name: "a call of a function with a call-site default is closed",
    graph: {
      "main.vl": 'import { C } from "./lib"\nconst x: i64 = C\nprint(x)\n',
      "lib.vl": "type Loc = { file: string, line: i32, col: i32 }\n" +
        "function mk(n: i32, at: Loc = __callsite__): i32 { n + at.line }\nexport const C = mk(1)\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a self-function outside G whose name G spells only as a plain word is served",
    graph: {
      "main.vl": 'import { f } from "./lib"\ntype Rq = { zzt: i32 }\n' +
        "function zzn(self: Rq): i32 { self.zzt }\nconst r: Rq = { zzt: 1 }\nprint(r.zzn() + f(2))\n",
      "lib.vl": "export function f(n: i32): i32 {\n  const zzn = n * 2\n  zzn\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a record outside G whose field G spells only as a parameter is served",
    graph: {
      "main.vl": 'import { f } from "./lib"\ntype Rq = { zzs: i32 }\nconst r: Rq = { zzs: 1 }\n' +
        "print(r.zzs + f(2))\n",
      "lib.vl": "export function f(zzs: i32): i32 { zzs * 2 }\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a record outside G whose field G spells as a literal key declines",
    graph: {
      "main.vl": 'import { f } from "./lib"\ntype Rq = { zzs: i32 }\nconst r: Rq = { zzs: 1 }\n' +
        "print(r.zzs + f(2))\n",
      "lib.vl": "export function f(n: i32): i32 {\n  const q = { zzs: n }\n  q.zzs\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
  },
  {
    // Both checks now build the binding at the wider record, so the mask's witness is the
    // `J | string` case below.
    name: "a literal an inferred builder returns declines beside a record of its storage",
    graph: { "main.vl": BUILT_MAIN, "lib.vl": BUILT_LIB("{ f: 4 }") },
    target: "lib.vl",
    want: "ambient",
  },
  {
    name: "a literal a builder hands to a generic call declines beside a record of its storage",
    graph: {
      "main.vl": BUILT_MAIN,
      "lib.vl": "type J = { f: f64 }\nfunction id<T>(v: T): T { v }\nfunction mk() { id({ f: 4 }) }\n" +
        "export function jj(): void {\n  const xj: J | string = mk()\n  const kk = mk()\n" +
        "  if xj is J { print(xj.f) }\n  print([kk][0].f)\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_ARENA | LOOSE_ARGS,
  },
  {
    name: "a literal a declared result settles is served beside a record of other storage",
    graph: {
      "main.vl": 'import { mk } from "./lib"\ntype Ct = { x: i32, y: i32 }\n' +
        "const c: Ct = { x: 1, y: 2 }\nprint(mk() + c.y)\n",
      "lib.vl": "type Pt = { x: f64, y: f64 }\nfunction pt(x: f64, y: f64): Pt { { x, y } }\n" +
        "export function mk(): i32 {\n  const p = pt(1.5, 2.5)\n  if p.x > 1.0 { 1 } else { 0 }\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a record G holds only at an outside record's storage is served",
    graph: {
      "main.vl": 'import { mk } from "./lib"\ntype Ct = { x: i32, y: i32 }\n' +
        "const c: Ct = { x: 1, y: 2 }\nprint(mk() + c.y)\n",
      "lib.vl": "function pt(x: i32, y: i32): { x: i32, y: i32 } { { x, y } }\n" +
        "export function mk(): i32 { pt(1, 2).y }\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a built literal G delivers to a record stored apart from an outside one declines",
    graph: {
      "main.vl": BUILT_MAIN,
      "lib.vl": "type J = { f: f64 }\nfunction mk() { { f: 4 } }\nexport function jj(): void {\n" +
        "  const xj: J | string = mk()\n  const kk = mk()\n  if xj is J { print(xj.f) }\n" +
        "  print([kk][0].f)\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    mask: NO_ARENA | LOOSE_SETTLED,
  },
  {
    name: "a method call a dirty G makes declines beside an outside import of the name",
    graph: {
      "main.vl": 'import { indexOf } from "std:array"\nimport { at } from "./lib"\n' +
        "print(at() + [1, 2].indexOf(2))\n",
      "lib.vl": "export function at(): i32 {\n  const xs: i32[] = [4, 5]\n  xs.indexOf(5)\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    mask: LOOSE_CALLS,
  },
  {
    name: "a method call a clean G resolves is served beside an outside one of the name",
    graph: {
      "main.vl": 'import { indexOf } from "std:array"\nimport { at } from "./lib"\n' +
        "print(at() + [1, 2].indexOf(2))\n",
      "lib.vl": "type W = { s: string }\nfunction indexOf(self: W, c: string): i32 { 1 }\n" +
        'export function at(): i32 {\n  const w: W = { s: "ab" }\n  w.indexOf("b")\n}\n',
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a built literal G delivers only at an outside record's storage is served",
    graph: {
      "main.vl": BUILT_MAIN,
      "lib.vl": "type J = { f: i32 }\nfunction mk() { { f: 4 } }\nexport function jj(): void {\n" +
        "  const xj: J | string = mk()\n  const kk = mk()\n  if xj is J { print(xj.f) }\n" +
        "  print([kk][0].f)\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a literal G pushes onto its own list is served beside a record of its fields",
    graph: {
      "main.vl": 'import { mk } from "./lib"\ntype Ct = { x: f64, y: i32 }\n' +
        "const c: Ct = { x: 1.5, y: 2 }\nprint(mk() + c.y)\n",
      "lib.vl": "type Pt = { x: i32, y: i32 }\nexport function mk(): i32 {\n" +
        "  const xs: Pt[] = []\n  xs.push({ x: 1, y: 2 })\n  xs[0].y\n}\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a self-function outside G whose name G reads only as a field is served",
    graph: {
      "main.vl": 'import { Gr, at } from "./lib"\nfunction next(self: Gr): i32 { 0 }\n' +
        "const g: Gr = { next: [4] }\nprint(at(g, 0) + g.next())\n",
      "lib.vl": "export type Gr = { next: i32[] }\nexport function at(g: Gr, i: i32): i32 { g.next[i] }\n",
    },
    target: "lib.vl",
    want: "served",
  },
  {
    name: "a self-function outside G that G calls declines",
    graph: {
      "main.vl": 'import { Gr, at } from "./lib"\nfunction zzn(self: Gr): i32 { 1 }\n' +
        "const g: Gr = { n: 4 }\nprint(at(g))\n",
      "lib.vl": "export type Gr = { n: i32 }\nexport function at(g: Gr): i32 { g.zzn() }\n",
    },
    target: "lib.vl",
    want: "ambient",
  },
  {
    name: "a getter outside G that G reads without a call declines",
    graph: {
      "main.vl": 'import { Cq, qv } from "./lib"\nget zzg(self: Cq): i32 { 1 }\nqv()\n',
      "lib.vl": "export type Cq = new i32\nexport function qv(): void {\n" +
        "  const c = 3 as! Cq\n  print(c.zzg)\n}\n",
    },
    target: "lib.vl",
    want: "ambient",
    mask: LOOSE_GETTER,
  },
  {
    name: "an error in a function body of G is served with the error",
    graph: {
      "main.vl": 'import { g } from "./mid"\nprint(g(1))\n',
      "mid.vl": 'import { f } from "./lib"\nexport function g(x: i32): i32 {\n' +
        "  const s: string = x\n  f(x) * 2\n}\n",
      "lib.vl": "export function f(x: i32): i32 { x + 1 }\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "an error in an imported body is served to every target whose G holds it",
    graph: {
      "main.vl": 'import { g } from "./mid"\nprint(g(1))\n',
      "mid.vl": 'import { f } from "./lib"\nexport function g(x: i32): i32 { f(x) * 2 }\n',
      "lib.vl": "export function f(x: i32): i32 {\n  const s: string = x\n  x + 1\n}\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "an error that changes an exported type is served with the error",
    graph: {
      "main.vl": 'import { g } from "./mid"\nprint(g(1))\n',
      "mid.vl": 'import { f } from "./lib"\nexport function g(x: i32): i32 { f(x) * 2 }\n',
      "lib.vl": 'export function f(x: i32) { x * "a" }\n',
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "an unknown type name an importer's sibling might declare is not banked",
    graph: {
      "main.vl": 'import { g } from "./mid"\nprint(g(1))\n',
      "mid.vl": 'import { f } from "./lib"\nexport function g(x: i32): i32 { f(x) * 2 }\n',
      "lib.vl": "export function f(x: i32): Strng { x + 1 }\n",
    },
    target: "mid.vl",
    want: "dirty",
  },
  {
    name: "an error outside G is not the target's and is served without it",
    graph: {
      "main.vl": 'import { g } from "./mid"\nconst s: string = g(1)\nprint(s)\n',
      "mid.vl": 'import { f } from "./lib"\nexport function g(x: i32): i32 { f(x) * 2 }\n',
      "lib.vl": "export function f(x: i32): i32 { x + 1 }\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "a redundant annotation in G beside an error outside it is served with its hint",
    graph: {
      "main.vl": 'import { g } from "./mid"\nconst s: string = g(1)\nprint(s)\n',
      "mid.vl": "export function g(x: i32): i32 {\n  const k: i32 = 2\n  x * k\n}\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "a generic instance G shares with an erroring call outside it is served",
    graph: {
      "main.vl": 'import { dbl } from "./lib"\nimport { m } from "./mid"\n' +
        'print(dbl("s"))\nprint(m())\n',
      "mid.vl": 'import { dbl } from "./lib"\nexport function m(): i32 { dbl("t") }\n',
      "lib.vl": "export function dbl<T>(v: T): i32 { v * 2 }\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "a refusal G repeats, reported once from outside G, declines the target",
    graph: {
      "main.vl": 'import { z } from "./a"\nimport { g } from "./mid"\nprint(z + g())\n',
      "a.vl": "type U = Set<string> | {[string]: boolean}\nexport const z = 1\n",
      "mid.vl": "type U = Set<string> | {[string]: boolean}\nexport function g(): i32 { 1 }\n",
    },
    target: "mid.vl",
    want: "dirty",
    mask: NO_OUTSIDE,
  },
  {
    name: "an adoption an outside error undoes declines the target",
    graph: {
      "main.vl": 'import { g } from "./mid"\nconst s: string = g()\nprint(s)\n',
      "mid.vl": "type B = { r: i32 | null }\nconst q = { r: 7 }\nconst d: B | string = q\n" +
        "export function g(): i32 { q.r ?? 0 }\n",
    },
    target: "mid.vl",
    want: "dirty",
  },
  {
    name: "a deep-is site in a clean G beside an error outside it declines the target",
    graph: {
      "main.vl": 'import { d } from "./mid"\nconst s: string = d(null)\nprint(s)\n',
      "mid.vl": "type Json = null | boolean | f64 | string | Json[] | { [string]: Json }\n" +
        "export function d(r: Json): i32 {\n  if r is string[] {\n    const n = r[0].length\n" +
        "    r = null\n    return n\n  }\n  0\n}\n",
    },
    target: "mid.vl",
    want: "dirty",
    mask: NO_OUTSIDE,
  },
  {
    name: "a warning-only target is served with its rows",
    graph: {
      "main.vl": 'import { g } from "./mid"\nprint(g(1))\n',
      "mid.vl": 'import { f } from "./lib"\nexport function g(x: i32): i32 {\n' +
        "  const k: i32 = 2\n  const u = 3\n  f(x) * k\n}\n",
      "lib.vl": "export function f(x: i32): i32 { x + 1 }\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "an importer's instance of a generic reports its error at the importer's call",
    graph: {
      "main.vl": 'import { dbl } from "./lib"\nimport { m } from "./mid"\n' +
        'print(dbl("s"))\nprint(m())\n',
      "mid.vl": 'import { dbl } from "./lib"\nexport function m(): i32 { dbl(1) }\n',
      "lib.vl": "export function dbl<T>(v: T): i32 { v * 2 }\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "an error in G that renders a union by an outside declaration's name is not banked",
    graph: {
      "main.vl": 'import { g } from "./mid"\ntype U = "a" | "b"\nconst u: U = "a"\nprint(g())\n',
      "mid.vl": 'export function g(): i32 {\n  const v: "a" | "b" = "a"\n  const t: i32 = v\n  0\n}\n',
    },
    target: "mid.vl",
    want: "ambient",
    mask: NO_DIAG_NAMES,
  },
  {
    name: "an error in G whose message names no outside type is banked beside one",
    graph: {
      "main.vl": 'import { g } from "./mid"\ntype U = "a" | "b"\nconst u: U = "a"\nprint(g())\n',
      "mid.vl": 'export function g(): i32 {\n  const t: i32 = "s"\n  0\n}\n',
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "an instance made through a generic in G reports at the importer's outermost call",
    graph: {
      "main.vl": 'import { w } from "./mid"\nimport { m } from "./mid2"\n' +
        'print(w("s"))\nprint(m())\n',
      "mid2.vl": 'import { w } from "./mid"\nexport function m(): i32 { w(1) }\n',
      "mid.vl": 'import { dbl } from "./lib"\nexport function w<T>(v: T): i32 { dbl(v) }\n',
      "lib.vl": "export function dbl<T>(v: T): i32 { v * 2 }\n",
    },
    target: "mid2.vl",
    want: "served",
  },
  {
    name: "an instance error at a call inside G is G's own and is served",
    graph: {
      "main.vl": 'import { dbl } from "./lib"\nimport { m } from "./mid"\n' +
        'print(dbl("s"))\nprint(m())\n',
      "mid.vl": 'import { dbl } from "./lib"\nexport function m(): i32 { dbl(1) }\n',
      "lib.vl": "export function dbl<T>(v: T): i32 { v.length }\n",
    },
    target: "mid.vl",
    want: "served",
  },
  {
    name: "a fresh record G builds is delivered into a wider type outside G",
    graph: {
      "main.vl": 'import { mk } from "./lib"\nconst ys: { f: f64 } = mk()\nprint(ys.f / 8)\n',
      "lib.vl": "export function mk() { { f: 1 } }\n",
    },
    target: "lib.vl",
    want: "fresh",
  },
];

const failures: string[] = [];
const grade = (c: Case) => {
  const v = run(c.graph);
  for (const [t, x] of Object.entries(v)) {
    if (!x.sound) failures.push(`${c.name}: ${t} (${x.reason}) unsound\n${x.why}`);
  }
  const got = v[c.target]?.reason;
  if (got !== c.want) failures.push(`${c.name}: ${c.target} want ${c.want}, got ${got}`);
  if (c.mask !== undefined) {
    const m = run(c.graph, c.mask)[c.target];
    if (m?.reason !== "served" || m.sound) {
      failures.push(
        `${c.name} mask ${c.mask}: want an unsound serve, got ${m?.reason} sound=${m?.sound}`,
      );
    }
  }
};

Deno.test({
  name: "check-within: every target's check equals its own, and each guard is load-bearing",
  ignore: !ENABLED,
  fn() {
    for (const c of CASES) grade(c);
    if (failures.length) throw new Error(failures.join("\n\n"));
  },
});

// A root with no imports checks as a single source, which never consults the banks; it must
// still read as unserved and unbanked after a served root, or the CLI prints the served
// root's rows (none) in place of its own.
Deno.test({
  name: "check-within: an import-free check after a served one is its own",
  ignore: !ENABLED,
  fn() {
    const g: Graph = { "main.vl": TWIN_MAIN("i32"), "lib.vl": TWIN_LIB("p.x") };
    const sh = fresh();
    sh.wiArm(1, 0);
    for (const f of [...Object.keys(g), "leaf.vl"]) {
      push(sh.wiTargetPush, KEY(f));
      sh.wiTargetCommit();
    }
    for (const t of order(g)) {
      load(sh, g, t);
      sh.checkSrc();
    }
    if (!sh.wiServed()) throw new Error("want lib.vl served, got its own check");
    sh.modReset();
    sh.srcReset();
    push(sh.srcPush, "export function f(): i32 { const n: i32 = 1\n  n }\n");
    sh.checkSrc();
    const got = `served=${sh.wiServed()} banked=${sh.wiBankedCount()}`;
    if (got !== "served=0 banked=0") {
      throw new Error(`want served=0 banked=0, got ${got}`);
    }
  },
});

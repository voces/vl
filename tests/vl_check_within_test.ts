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
    o.push(`${keys[e.diagModule(i)] ?? "?"} ${e.diagLine(i)}:${e.diagCol(i)} ${msg}`);
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
    sh.checkSrc();
    const served = sh.wiServed();
    const reason = REASON.find((_, r) => sh.wiStat(r) !== before[r]) ?? "?";
    const mine = {
      diags: served ? [] : diagRows(sh, keys),
      streams: served ? banked[KEY(t)] ?? ["<no rows banked>"] : streamRows(sh, 0),
      lint: [] as string[],
    };
    for (let i = 0; i < sh.wiBankedCount(); i++) {
      banked[keys[sh.wiBankedMod(i)]] = streamRows(sh, sh.wiBankedMod(i));
    }
    mine.lint = lintRows(sh);
    const f = fresh();
    const fk = load(f, g, t);
    f.checkSrc();
    const own = { diags: diagRows(f, fk), streams: streamRows(f, 0), lint: lintRows(f) };
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
const WRAP_MID = 'import { wrap } from "./lib"\nexport function m(): i32 { wrap(1)[0] }\n';

// Mask bits, as `WI_NO_*` in `compiler/driver.vl` numbers them.
const NO_ENTRY = 1, NO_DEMAND = 2, NO_WRITER = 8, NO_AMBIENT = 16, NO_RENDER = 128;
const NO_ADOPTED = 256;

// The fresh guard, the asks guard and the ambient guard's arena half have no mask witness: no
// graph found shows a served answer that differs once they are dropped, so they are defensive.
// The twin and called-generic widenings carry must-decline controls in their place.
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
    name: "a same-shape record outside G declines a target whose rows could name either",
    graph: {
      "main.vl": TWIN_MAIN("i32"),
      "lib.vl": TWIN_LIB("(p ?? p).x"),
    },
    target: "lib.vl",
    want: "ambient",
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

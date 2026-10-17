// A REPLAYED PARSE IS THE PARSE (S5's replay step, `compiler/parse_bank.vl`).
//
// A reused instance banks each module's clean parse by (key, source) and, when the module comes
// back unchanged, appends the banked image rebased onto the current arena ends instead of
// parsing it again. This suite drives two instances through one sequence of compiles, one with
// the bank on and one with it off, and holds every step's diagnostics, wasm and editor symbol
// rows identical.
// The pair isolates the bank: any other per-instance state is the same on both sides. The
// sequences reorder lib.vl's predecessors (graphs A–D of the parse-image suite), then check the
// compiler's own module graph, edit one module in the middle of it, and check again, so every
// module after the edit replays at a different offset. The control is the hit count: a run
// that served nothing from the bank proves nothing.
//
// GATING: needs the seed.

import { COMPILER as TREE_COMPILER, exists, ROOT } from "./support/tree.ts";

// `VL_PARSE_REPLAY_COMPILER` grades another seed (the mutation check uses it).
const COMPILER = Deno.env.get("VL_PARSE_REPLAY_COMPILER") ?? TREE_COMPILER;

const ENABLED = exists(COMPILER);
if (!ENABLED) {
  console.warn("[parse-replay] skipped — missing the seed");
}

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
  checkSrcSym(): number;
  compileSrc(): number;
  symOccCount(): number;
  symOccTokAt(i: number): number;
  symOccBinding(i: number): number;
  symOccIsDeclAt(i: number): number;
  symOccKindAt(i: number): number;
  symOccStartLine(i: number): number;
  symOccStartCol(i: number): number;
  symOccEndCol(i: number): number;
  symInlayScan(): number;
  symInlayCount(): number;
  symInlayLineAt(i: number): number;
  symInlayColAt(i: number): number;
  symInlayTypeLen(i: number): number;
  symInlayTypeCharAt(i: number, j: number): number;
  rbyteLen(): number;
  rbyteAt(i: number): number;
  diagCount(): number;
  diagLine(i: number): number;
  diagCol(i: number): number;
  diagMsgLen(i: number): number;
  diagMsgAt(i: number, j: number): number;
  parseReplaySet(on: number): number;
  parseReplayStat(which: number): number;
};

const LIB_KEY = "/proj/lib.vl";
const LIB = `extern function hostTick(a: i32): i32
extern let hostFlag: i32

type Box<T> = { v: T }
type Circle = { r: f64 }
type Square = { s: f64 }
export type Shape = Circle | Square

export function area(s: Shape): f64 {
  match s {
    Circle => 3.0 * s.r * s.r
    Square => s.s * s.s
  }
}

export function wrap<T>(x: T): Box<T> { return { v: x } }

export function tick(n: i32): i32 {
  type Local = { k: i32 }
  const l: Local = { k: n }
  const xs: i32[] = [1, 2, ...[3]]
  let t = 0
  for x in xs { t = t + x }
  return hostTick(l.k + t + hostFlag) + wrap<i32>(n).v
}
`;
const FLAG = `export function flagged(n: i32): i32 {
  const f: (x: i32) => i32 = (k) => k + 1
  const v = @B {
    if f(n) > 0 { break @B 7 }
    0
  }
  v + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + n
}
`;

type Graph = {
  name: string;
  entryKey: string;
  entry: string;
  dep: (key: string) => string | undefined;
};

const fixed = (
  name: string,
  entry: string,
  deps: Record<string, string>,
): Graph => ({ name, entryKey: "/proj/main.vl", entry, dep: (k) => deps[k] });

const GRAPHS: Graph[] = [
  fixed("A", 'import { tick } from "./lib"\nprint(tick(1))\n', {
    [LIB_KEY]: LIB,
  }),
  fixed(
    "B",
    'import { twice } from "./other"\nimport { tick } from "./lib"\nprint(twice(tick(2)))\n',
    {
      "/proj/other.vl": "extern function hostTick(a: i32): i32\n" +
        "type Pair = { a: i32, b: i32 }\n" +
        "export function twice(n: i32): i32 {\n  const p: Pair = { a: n, b: n }\n" +
        "  return hostTick(p.a + p.b)\n}\n",
      [LIB_KEY]: LIB,
    },
  ),
  fixed("C", 'import { both } from "./mid"\nprint(both(3))\n', {
    "/proj/mid.vl":
      'import { zz } from "./zed"\nimport { tick, area } from "./lib"\n' +
      "export function both(n: i32): i32 { return zz(n) + tick(n) }\n",
    "/proj/zed.vl":
      "extern let hostFlag: i32\nexport function zz(n: i32): i32 {\n" +
      "  let s = 0\n  for i in 0 to n { s = s + i + hostFlag }\n  return s\n}\n",
    [LIB_KEY]: LIB,
  }),
  fixed(
    "D",
    'import { flagged } from "./flag"\nimport { tick } from "./lib"\nprint(tick(flagged(1)))\n',
    { "/proj/flag.vl": FLAG, [LIB_KEY]: LIB },
  ),
];

// The compiler's own graph, read from this tree; `edit` replaces one module's text.
const compilerGraph = (name: string, edit?: [string, string]): Graph => {
  const entryKey = `${ROOT}/compiler/entry.vl`;
  return {
    name,
    entryKey,
    entry: Deno.readTextFileSync(entryKey),
    dep: (k) => {
      if (edit && k === edit[0]) return edit[1];
      try {
        return Deno.readTextFileSync(k);
      } catch {
        return undefined;
      }
    },
  };
};
const EDITED = `${ROOT}/compiler/listutil.vl`;
const EDIT: [string, string] = [
  EDITED,
  Deno.readTextFileSync(EDITED) +
  "\nexport function pbReplayEdit(n: i32): i32 { n + 1 }\n",
];

const push = (fn: (cp: number) => number, text: string) => {
  for (const b of new TextEncoder().encode(text)) fn(b);
};
const readStr = (len: number, at: (j: number) => number) => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

// `sym` is the editor's check: the symbol table on, read back as the occurrence and inlay rows
// go-to-definition and hover answer from. Those read token indices the diagnostics never do.
type Mode = "check" | "emit" | "sym";
type Step = { diags: string; bytes: string; syms: string; ms: number };

const symRows = (exp: Exports): string => {
  const rows: string[] = [];
  for (let i = 0; i < exp.symOccCount(); i++) {
    rows.push(
      `occ ${exp.symOccTokAt(i)} ${exp.symOccBinding(i)} ${
        exp.symOccIsDeclAt(i)
      } ${exp.symOccKindAt(i)} ${exp.symOccStartLine(i)}:${
        exp.symOccStartCol(i)
      }-${exp.symOccEndCol(i)}`,
    );
  }
  exp.symInlayScan();
  for (let i = 0; i < exp.symInlayCount(); i++) {
    rows.push(
      `inlay ${exp.symInlayLineAt(i)}:${exp.symInlayColAt(i)} ${
        readStr(exp.symInlayTypeLen(i), (j) => exp.symInlayTypeCharAt(i, j))
      }`,
    );
  }
  return rows.join("\n");
};

const run = (exp: Exports, g: Graph, mode: Mode): Step => {
  exp.modReset();
  const commit = (key: string, src: string) => {
    push(exp.modKeyPush, key);
    push(exp.modSrcPush, src);
    exp.modCommit(1);
  };
  commit(g.entryKey, g.entry);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const k of keys) {
      const src = g.dep(k);
      if (src === undefined) {
        throw new Error(`graph ${g.name}: no source for ${k}`);
      }
      commit(k, src);
    }
  }
  exp.srcReset();
  push(exp.srcPush, g.entry);
  const t0 = performance.now();
  const rc = mode === "emit"
    ? exp.compileSrc()
    : mode === "sym"
    ? exp.checkSrcSym()
    : exp.checkSrc();
  const ms = performance.now() - t0;
  const d: string[] = [`rc ${rc}`];
  for (let i = 0; i < exp.diagCount(); i++) {
    d.push(
      `${exp.diagLine(i)}:${exp.diagCol(i)} ${
        readStr(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j))
      }`,
    );
  }
  let bytes = "";
  if (mode === "emit" && rc === 0) {
    const b = new Uint8Array(exp.rbyteLen());
    for (let i = 0; i < b.length; i++) b[i] = exp.rbyteAt(i);
    if (!WebAssembly.validate(b)) {
      throw new Error(`graph ${g.name}: invalid wasm`);
    }
    bytes = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  const syms = mode === "sym" ? symRows(exp) : "";
  return { diags: d.join("\n"), bytes, syms, ms };
};

const instance = (replay: number): Exports => {
  const exp = new WebAssembly.Instance(
    new WebAssembly.Module(Deno.readFileSync(COMPILER)),
    {},
  ).exports as unknown as Exports;
  exp.parseReplaySet(replay);
  return exp;
};

// Run `seq` on a bank-on and a bank-off instance and require every step to agree.
const agree = (
  seq: [Graph, Mode][],
): { on: Step[]; off: Step[]; hits: number } => {
  const on = instance(1);
  const off = instance(0);
  const a: Step[] = [];
  const b: Step[] = [];
  for (const [g, mode] of seq) {
    const x = run(on, g, mode);
    const y = run(off, g, mode);
    if (x.syms !== y.syms) {
      const xs = x.syms.split("\n");
      const ys = y.syms.split("\n");
      const at = ys.findIndex((r, i) => r !== xs[i]);
      throw new Error(
        `REPLAY DIVERGED — graph ${g.name}'s symbol rows, row ${at}: want ${
          ys[at]
        } / got ${xs[at]}`,
      );
    }
    if (x.diags !== y.diags) {
      throw new Error(
        `REPLAY DIVERGED — graph ${g.name}'s diagnostics:\nwant (fresh parse)\n${y.diags}\ngot (replayed)\n${x.diags}`,
      );
    }
    if (x.bytes !== y.bytes) {
      throw new Error(
        `REPLAY DIVERGED — graph ${g.name}'s wasm: want ${
          y.bytes.length / 2
        } bytes / got ${
          x.bytes.length / 2
        } bytes, or the same length with different bytes`,
      );
    }
    a.push(x);
    b.push(y);
  }
  if (off.parseReplayStat(1) !== 0) {
    throw new Error(
      `CONTROL — the bank-off instance served ${off.parseReplayStat(1)} hits`,
    );
  }
  return { on: a, off: b, hits: on.parseReplayStat(1) };
};

Deno.test({
  name:
    "parse-replay: graphs A–D compile to the same wasm with the bank on and off",
  ignore: !ENABLED,
  fn: () => {
    const [A, B, C, D] = GRAPHS;
    // lib.vl edited under its own key, then restored: the slot is replaced, never served stale.
    const A2 = fixed("A, lib.vl edited", A.entry, {
      [LIB_KEY]: LIB + "export function more(n: i32): i32 { n * 2 }\n",
    });
    // A clean parse that fails the CHECK: its diagnostics' spans are read off replayed tokens.
    const E = fixed(
      "E (entry → bad)",
      'import { bad } from "./bad"\nprint(bad(1))\n',
      {
        "/proj/bad.vl":
          "export function bad(n: i32): i32 {\n  const s: string = n\n  return n\n}\n",
      },
    );
    const seq: [Graph, Mode][] = [
      [E, "check"],
      [A, "emit"],
      [B, "emit"],
      [C, "emit"],
      [D, "emit"],
      [A2, "emit"],
      [A, "emit"],
      [D, "check"],
      [C, "sym"],
      [E, "sym"],
      [B, "sym"],
    ];
    const { on, hits } = agree(seq);
    if (!on[0].diags.includes("\n2:")) {
      throw new Error(
        `CONTROL — bad.vl must report on its line 2 / got:\n${on[0].diags}`,
      );
    }
    seq.forEach(([g, mode], i) => {
      if (mode === "sym" && on[i].syms === "") {
        throw new Error(`CONTROL — graph ${g.name} produced no symbol rows`);
      }
      if (mode === "emit" && on[i].bytes === "") {
        throw new Error(`graph ${g.name} did not compile:\n${on[i].diags}`);
      }
    });
    if (hits < 6) {
      throw new Error(
        `CONTROL — want at least 6 replayed modules / got ${hits}`,
      );
    }
  },
});

Deno.test({
  name:
    "parse-replay: the compiler's own graph checks the same before and after a one-module edit",
  ignore: !ENABLED,
  fn: () => {
    const orig = compilerGraph("compiler");
    const edited = compilerGraph("compiler, listutil.vl edited", EDIT);
    const { on, off, hits } = agree([[orig, "check"], [edited, "sym"]]);
    if (hits === 0) {
      throw new Error("CONTROL — the compiler graph replayed no module");
    }
    console.log(
      `[parse-replay] compiler graph re-check after an edit: bank on ${
        on[1].ms.toFixed(0)
      } ms, off ${off[1].ms.toFixed(0)} ms; ${hits} modules replayed in all`,
    );
  },
});

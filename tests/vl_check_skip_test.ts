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

import { COMPILER, exists } from "./support/tree.ts";

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
  ifaceHashArm(on: number): number;
  ifaceHashDrop(mask: number): number;
  ifaceHashCount(): number;
  ifaceHashKeyLen(i: number): number;
  ifaceHashKeyAt(i: number, j: number): number;
  checkSkipArm(on: number): number;
  checkSkipStat(which: number): number;
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
type Result = { rc: number; diags: string[]; reason: number; served: number };

const load = (exp: Exports, g: Graph) => {
  exp.modReset();
  const commit = (key: string, src: string) => {
    push(exp.modKeyPush, key);
    push(exp.modSrcPush, src);
    exp.modCommit(1);
  };
  commit("/proj/main.vl", g["main.vl"]);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const k of keys) {
      const src = g[k.slice(k.lastIndexOf("/") + 1)];
      if (src === undefined) throw new Error(`no source for ${k}`);
      commit(k, src);
    }
  }
  exp.srcReset();
  push(exp.srcPush, g["main.vl"]);
};

const keysOf = (exp: Exports) => {
  const out: string[] = [];
  for (let i = 0; i < exp.ifaceHashCount(); i++) {
    const k = readStr(exp.ifaceHashKeyLen(i), (j) => exp.ifaceHashKeyAt(i, j));
    out.push(k.slice(k.lastIndexOf("/") + 1));
  }
  return out;
};

const check = (exp: Exports, g: Graph): Result => {
  load(exp, g);
  const rc = exp.checkSrc();
  const keys = keysOf(exp);
  const diags: string[] = [];
  for (let i = 0; i < exp.diagCount(); i++) {
    const msg = readStr(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j));
    const code = readStr(exp.diagCodeLen(i), (j) => exp.diagCodeByte(i, j));
    const data = readStr(exp.diagDataLen(i), (j) => exp.diagDataByte(i, j));
    diags.push(
      `${keys[exp.diagModule(i)] ?? "?"} ${exp.diagLine(i)}:${exp.diagCol(i)}-` +
        `${exp.diagEndLine(i)}:${exp.diagEndCol(i)} [${code}|${data}] ${msg}`,
    );
  }
  return {
    rc,
    diags,
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
export const TAG = "t"
export let flag = false
export let mode = "a"
export let count = 0
`;

const MID = `import { area, Shape } from "./lib"
export function mid(n: i32): i32 { return area(n) + 1 }
export function edge(s: Shape): i32 { return s.w }
`;

const MAIN = `import { area, bump, size, Shape, half } from "./lib"
import { mid, edge } from "./mid"
type Box = { w: i32, h: i32 }
const sh: Shape = { w: 2, h: 3 }
const bx: Box = { w: 4, h: 5 }
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

type Want = "serve" | "decline" | "any";
type Case = {
  name: string;
  want: Want;
  // The reason a decline must give; any decline when absent.
  why?: string;
  at?: string;
  from: string;
  to: string;
  // Added to main's imports and body on both sides, for an edit main must reach.
  uses?: string;
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
    name: "body edit that shifts the lines below it",
    want: "any",
    from: "  return n * 2\n",
    to: "  const k = 2\n  return n * k\n",
  },
  {
    name: "signature edit",
    want: "decline",
    why: "interface",
    from: "area(n: i32)",
    to: "area(n: string)",
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
    why: "interface",
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
    name: "defaulted param body edit",
    want: "decline",
    why: "demand",
    from: "return n }\nexport let",
    to: "return n + 1 }\nexport let",
    uses: `import { dflt } from "./lib"\nprint(dflt())\n`,
  },
  {
    name: "imported binding edit",
    want: "decline",
    why: "demand",
    from: "x: 1, y: 2",
    to: "x: 5, y: 2",
    uses: `import { pt } from "./lib"\nprint(pt.x)\n`,
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
    name: "number binding main widens, lib body edit",
    want: "decline",
    why: "demand",
    from: "n * 2",
    to: "n * 3",
    uses: `import { count } from "./lib"\nconst w: i64 = 5\ncount = w\nprint(count)\n`,
  },
  {
    name: "scalar constant edit",
    want: "decline",
    why: "interface",
    from: "N = 16",
    to: "N = 300",
    uses: `import { N } from "./lib"\nconst u: u8 = N\nprint(u)\n`,
  },
  {
    name: "annotated binding initialiser edit",
    want: "decline",
    why: "interface",
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
    name: "re-export of an edited function",
    want: "decline",
    why: "re-export",
    from: "n * 2",
    to: "n * 3",
    uses: `export { area } from "./lib"\n`,
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
];

const graphs = (c: Case, bad: boolean): [Graph, Graph] => {
  const main = (c.uses ?? "") + MAIN + (bad ? MAIN_BAD : "");
  const g: Graph = { "main.vl": main, "lib.vl": LIB, "mid.vl": MID };
  const at = c.at ?? "lib.vl";
  if (!g[at].includes(c.from)) throw new Error(`${c.name}: no \`${c.from}\` in ${at}`);
  return [g, { ...g, [at]: g[at].replace(c.from, c.to) }];
};

const same = (a: string[], b: string[]) => a.join("\n") === b.join("\n");

// The served check against a fresh one and an unarmed one, as failure lines.
const grade = (c: Case, bad: boolean, drop = 0): { fails: string[]; got: Result } => {
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
  if (plain.rc !== fresh.rc || !same([...plain.diags].sort(), [...fresh.diags].sort())) {
    fails.push(
      `${tag}: armed whole check [${fresh.diags.join(" | ")}], unarmed [${
        plain.diags.join(" | ")
      }]`,
    );
  }
  return { fails, got };
};

Deno.test({
  name: "a served module check gives the whole check's diagnostics and build",
  ignore: !ENABLED,
  fn() {
    const fails: string[] = [];
    const table: string[] = [];
    for (const c of CASES) {
      for (const bad of [false, true]) {
        const { fails: f, got } = grade(c, bad);
        fails.push(...f);
        const why = REASON[got.reason] ?? `${got.reason}`;
        const tag = `${c.name}${bad ? " (main with errors)" : ""}`;
        table.push(`${tag}: ${why}, ${got.served} served, rc ${got.rc}`);
        if (c.want === "serve" && got.served === 0) {
          fails.push(`${tag}: want served, got declined (${why})`);
        }
        if (c.want === "decline" && got.served !== 0) {
          fails.push(`${tag}: want declined, got ${got.served} served`);
        }
        if (c.want === "decline" && c.why && why !== c.why) {
          fails.push(`${tag}: want declined for ${c.why}, got ${why}`);
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
    if (Deno.env.get("VL_CHECK_SKIP_TABLE")) console.log(table.join("\n"));
    if (fails.length > 0) {
      throw new Error(`want every served check sound, got:\n  ${fails.join("\n  ")}`);
    }
  },
});

Deno.test({
  name: "a hash missing an ingredient serves an edit it must not",
  ignore: !ENABLED,
  fn() {
    // `IH_NO_INFERRED_TYPE | IH_NO_MENTIONS` hides a cut return's type, `IH_NO_MENTIONS` what a
    // callee writes.
    const witness: [string, number][] = [
      ["inferred-return change", 64 | 16],
      ["a callee main narrows across starts writing the binding", 16],
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

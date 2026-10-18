// AN UNCHANGED INTERFACE HASH LEAVES EVERY DEPENDENT UNCHANGED (S5's interface hash,
// `compiler/iface_hash.vl`).
//
// Each case is a module graph and one edit to a single module, `lib.vl`. The suite compiles
// both sides on one instance with the hash armed and grades the edit three ways:
//   * SOUND: when lib's hash is unchanged, every other module's diagnostics and wasm functions
//     are the same on both sides (wasm compared up to index assignment, which is S6's: type,
//     global and function indices are named by what they define, and `@file:line` is dropped).
//     When lib's declaration positions are unchanged too, the line numbers diagnostics cite
//     must agree as well. Generic instances and std helpers carry no file tag and are not
//     compared: an instance is emitted from the generic's own body, in the edited module.
//   * CONTROLS: an edit marked `hit` must leave the hash unchanged, and one marked `miss` must
//     change it, so a hash that is always new (sound and useless) cannot pass.
//   * MUTATION: with each ingredient dropped (`ifaceHashDrop`), its witness case turns unsound.
// The hit rate over single-function edits from the compiler's history is printed when
// `VL_IFACE_HASH_RATE=<n>` asks for `n` edits; it checks the whole compiler graph per edit.
//
// GATING: needs the seed and binaryen's wasm-dis.

import { COMPILER as TREE_COMPILER, exists, ROOT } from "./support/tree.ts";
import { WASM_DIS } from "./support/nativeRelease.ts";

const COMPILER = Deno.env.get("VL_IFACE_HASH_COMPILER") ?? TREE_COMPILER;
const ENABLED = exists(COMPILER) && exists(WASM_DIS);
if (!ENABLED) {
  console.warn("[iface-hash] skipped — missing the seed or wasm-dis");
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
  compileSrc(): number;
  setEmitNames(on: number): number;
  rbyteLen(): number;
  rbyteAt(i: number): number;
  diagCount(): number;
  diagLine(i: number): number;
  diagCol(i: number): number;
  diagMsgLen(i: number): number;
  diagMsgAt(i: number, j: number): number;
  diagModule(i: number): number;
  ifaceHashArm(on: number): number;
  ifaceHashDrop(mask: number): number;
  ifaceHashCount(): number;
  ifaceHashKeyLen(i: number): number;
  ifaceHashKeyAt(i: number, j: number): number;
  ifaceHashOf(i: number, which: number): number;
};

const push = (fn: (cp: number) => number, text: string) => {
  for (const b of new TextEncoder().encode(text)) fn(b);
};
const readStr = (len: number, at: (j: number) => number) => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

const instance = (): Exports => {
  const exp = new WebAssembly.Instance(
    new WebAssembly.Module(Deno.readFileSync(COMPILER)),
    {},
  ).exports as unknown as Exports;
  exp.ifaceHashArm(1);
  exp.setEmitNames(1);
  return exp;
};

type Hash = { own: number; deep: number; span: number };
type Result = {
  rc: number;
  hash: Map<string, Hash>;
  // Per module key: its diagnostics, and (emit only) its wasm functions, normalised.
  diags: Map<string, string[]>;
  fns: Map<string, string[]>;
};

// The wasm text of `bytes`, every function keyed by the file its name tags (`@lib.vl:3`), and
// normalised up to index assignment.
const disFunctions = (bytes: Uint8Array): Map<string, string[]> => {
  const tmp = Deno.makeTempFileSync({ suffix: ".wasm" });
  try {
    Deno.writeFileSync(tmp, bytes);
    const out = new Deno.Command(WASM_DIS, { args: [tmp], stdout: "piped" })
      .outputSync();
    if (!out.success) throw new Error("wasm-dis failed");
    return splitFunctions(new TextDecoder().decode(out.stdout));
  } finally {
    Deno.removeSync(tmp);
  }
};

// One top-level `(...)` form per entry of the module text.
const topForms = (text: string): string[] => {
  const forms: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "(") {
      depth++;
      if (depth === 2) start = i;
    } else if (c === ")") {
      if (depth === 2) forms.push(text.slice(start, i + 1));
      depth--;
    }
  }
  return forms;
};

const NAME = /\$[^\s()"]+/g;
const fileOf = (name: string) => name.match(/@([^:@]+):\d+/)?.[1] ?? "";

const splitFunctions = (text: string): Map<string, string[]> => {
  const forms = topForms(text);
  // What each type, global and function index defines, so a reference reads as its target.
  const def = new Map<string, string>();
  const named = forms.flatMap((f) => f.startsWith("(rec") ? topForms(f) : [f]);
  for (const f of named) {
    const m = f.match(/^\((type|global)\s+(\$[^\s()]+)/);
    if (m) def.set(m[2], f.slice(m[0].length));
  }
  const strip = (s: string) => s.replace(/@[^:@\s()]+:\d+/g, "");
  // A local shares the `$<n>` spelling with a type; the word before it says which it is.
  const LOCAL = /(local\.get|local\.set|local\.tee|param|local)\s+$/;
  const resolve = (s: string, seen: Set<string>): string =>
    strip(s).replace(NAME, (n, at: number, all: string) => {
      if (
        /^\$\d+$/.test(n) && LOCAL.test(all.slice(Math.max(0, at - 12), at))
      ) return n;
      const d = def.get(n);
      if (d === undefined || seen.has(n)) return strip(n);
      return `<${resolve(d, new Set([...seen, n]))}>`;
    });
  const out = new Map<string, string[]>();
  for (const f of forms) {
    const m = f.match(/^\(func\s+(\$[^\s()]+)/);
    if (!m) continue;
    const file = fileOf(m[1]);
    if (!out.has(file)) out.set(file, []);
    out.get(file)!.push(resolve(f, new Set()));
  }
  for (const v of out.values()) v.sort();
  return out;
};

type Graph = { entry: string; mods: Record<string, string> };
const KEY = (name: string) => `/proj/${name}`;
const base = (key: string) => key.slice(key.lastIndexOf("/") + 1);

const run = (exp: Exports, g: Graph, emit: boolean): Result =>
  runKeys(exp, KEY("main.vl"), g.entry, (k) => g.mods[base(k)], emit, base);

// Loads the graph rooted at `entryKey` through `dep`, builds it, and keys every table by `name`
// of the module key.
const runKeys = (
  exp: Exports,
  entryKey: string,
  entry: string,
  dep: (key: string) => string | undefined,
  emit: boolean,
  name: (key: string) => string,
): Result => {
  exp.modReset();
  const commit = (key: string, src: string) => {
    push(exp.modKeyPush, key);
    push(exp.modSrcPush, src);
    exp.modCommit(1);
  };
  commit(entryKey, entry);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(readStr(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const k of keys) {
      const src = dep(k);
      if (src === undefined) throw new Error(`no source for ${k}`);
      commit(k, src);
    }
  }
  exp.srcReset();
  push(exp.srcPush, entry);
  const rc = emit ? exp.compileSrc() : exp.checkSrc();
  const hash = new Map<string, Hash>();
  const keyOf: string[] = [];
  for (let i = 0; i < exp.ifaceHashCount(); i++) {
    const k = name(
      readStr(exp.ifaceHashKeyLen(i), (j) => exp.ifaceHashKeyAt(i, j)),
    );
    keyOf.push(k);
    hash.set(k, {
      own: exp.ifaceHashOf(i, 0),
      deep: exp.ifaceHashOf(i, 1),
      span: exp.ifaceHashOf(i, 2),
    });
  }
  const diags = new Map<string, string[]>();
  for (let i = 0; i < exp.diagCount(); i++) {
    const k = keyOf[exp.diagModule(i)] ?? "?";
    if (!diags.has(k)) diags.set(k, []);
    diags.get(k)!.push(
      `${exp.diagLine(i)}:${exp.diagCol(i)} ${
        readStr(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j))
      }`,
    );
  }
  let fns = new Map<string, string[]>();
  if (emit && rc === 0) {
    const b = new Uint8Array(exp.rbyteLen());
    for (let i = 0; i < b.length; i++) b[i] = exp.rbyteAt(i);
    fns = disFunctions(b);
  }
  return { rc, hash, diags, fns };
};

// ── the cases ────────────────────────────────────────────────────────────────

// `hit` when the edited module's hash must stay, `miss` when it must change, `free` when
// either answer is sound.
type Want = "hit" | "miss" | "free";
type Case = {
  name: string;
  want: Want;
  entry: string;
  mods: Record<string, string>;
  // The module edited (default lib.vl) and the one replacement made in it.
  at?: string;
  from: string;
  to: string;
};

const LIB = `export let pt = { x: 1, y: 2 }
export let g: i32 | null = 1
export let counter = 0
export let s = 0
export let mode = "a"
export type Shape = { w: i32, h: i32 }
function sink(v: i64): void { print(1) }
function take(w: { x: i64, y: i64 }): void { print(2) }
function clear(): void { g = null }
function helper<T>(a: T): T { return a }
export function area(n: i32): i32 {
  return n * 2
}
export function bump(): void {
  print(0)
}
export function use(): void {
  sink(5)
  print(s)
}
export function go(): void {
  take({ x: 1, y: 1 })
  print(pt.x)
}
export function head(xs: i32[]): i32 {
  return xs[0]
}
export function half(n: i32) { n / 2 }
export function twice(x) { x * 2 }
export function pick<T>(a: T, b: T): T { return a }
export function size(sh: Shape): i32 { return sh.w * sh.h }
`;

const MAIN =
  `import { area, pt, g, bump, counter, s, use, go, head, half, twice, pick, size, mode } from "./lib"
print(area(pt.x))
if g != null {
  bump()
  print(g + 1)
}
print(counter)
use()
print(s + 1)
go()
const xs = [1, 2]
print(head(xs))
print(xs[0])
print(half(7))
print(twice(3))
print(pick(1, 2))
print(size({ w: 2, h: 3 }))
print(mode == "a")
`;

const lib = (name: string, want: Want, from: string, to: string): Case => ({
  name,
  want,
  entry: MAIN,
  mods: { "lib.vl": LIB },
  from,
  to,
});

// main → mid → lib: only mid reads lib, so main sees lib through mid's deep hash alone.
const MID = `import { area, k } from "./lib"
export function scaled(n: i32): f64 { return area(n) + k }
`;
const CHAIN_LIB = `export let k = 1
export function area(n: i32): i32 {
  return n * 2
}
`;
const chain = (name: string, want: Want, from: string, to: string): Case => ({
  name,
  want,
  entry: 'import { scaled } from "./mid"\nprint(scaled(2))\n',
  mods: { "lib.vl": CHAIN_LIB, "mid.vl": MID },
  from,
  to,
});

// Bodies a dependent's own check reads: an explicit generic is checked at its call's types, and
// an untyped parameter takes its type from the body.
const BODY_LIB = `export function pick<T>(a: T, b: T): T { return a }
export function twice(x): i32 {
  const y = x
  return 2
}
export function half(n: i32) { return n }
`;
const body = (name: string, want: Want, from: string, to: string): Case => ({
  name,
  want,
  entry:
    'import { pick, twice, half } from "./lib"\nprint(pick("x", "y"))\nprint(twice("s"))\n' +
    "print(half(1))\n",
  mods: { "lib.vl": BODY_LIB },
  from,
  to,
});

// main → mid → lib where mid's own hash cannot change: mid re-exports lib's function, and
// mid's signature names lib's record type, whose fields only lib spells.
const RE_LIB = `export type Shape = { w: i32, h: i32 }
export function area(n: i32): i32 {
  return n * 2
}
`;
const RE_MID = `import { Shape } from "./lib"
export { area } from "./lib"
export function mk(): Shape { return { w: 2, h: 3 } }
`;
const reexp = (name: string, want: Want, from: string, to: string): Case => ({
  name,
  want,
  entry: 'import { area, mk } from "./mid"\nprint(area(2))\nprint(mk().w)\n',
  mods: { "lib.vl": RE_LIB, "mid.vl": RE_MID },
  from,
  to,
});

const CASES: Case[] = [
  // Bodies no dependent sees.
  lib(
    "annotated export, body edit",
    "hit",
    "return n * 2",
    "const m = 3\n  return n * m",
  ),
  lib(
    "annotated export, body gains lines",
    "hit",
    "return n * 2",
    "\n\n\n  return n * 2",
  ),
  lib("annotated body adds a string", "hit", "print(0)", 'print("zero")'),
  lib(
    "annotated body adds a lambda",
    "hit",
    "return n * 2",
    "const f = (k: i32): i32 => k + 1\n  return f(n)",
  ),
  lib(
    "annotated body calls a generic",
    "free",
    "return n * 2",
    "return helper(n) * 2",
  ),
  lib("private annotated body edit", "hit", "print(1) }", "print(10) }"),
  // A global read only by `__start__` becomes a local of it, so a read elsewhere is seen.
  lib("annotated body reads a global", "miss", "print(0)", "print(counter)"),
  // What dependents do see.
  lib(
    "annotated signature edit",
    "miss",
    "area(n: i32): i32",
    "area(n: i32): i64",
  ),
  lib("inferred-return body edit", "miss", "{ n / 2 }", "{ n / 2.0 }"),
  lib("generic body edit", "miss", "{ return a }", "{ return b }"),
  lib("untyped-param body edit", "miss", "{ x * 2 }", "{ x * 2 + 1 }"),
  lib("type decl edit", "miss", "h: i32 }", "h: i32, d: i32 }"),
  lib("global initialiser edit", "miss", "let counter = 0", "let counter = 5"),
  lib(
    "annotated body writes a narrowed global",
    "miss",
    "print(0)",
    "g = null",
  ),
  lib("annotated body calls a writer of it", "miss", "print(0)", "clear()"),
  lib(
    "annotated body writes a global",
    "miss",
    "print(0)",
    "counter = counter + 1",
  ),
  lib(
    "annotated body writes through a param",
    "miss",
    "return xs[0]",
    "xs[0] = 9\n  return xs[0]",
  ),
  lib(
    "annotated body delivers a literal let",
    "miss",
    "sink(5)\n  print(s)",
    "sink(s)\n  print(5)",
  ),
  lib(
    "annotated body adopts a record",
    "miss",
    "take({ x: 1, y: 1 })\n  print(pt.x)",
    "take(pt)\n  print(1)",
  ),
  lib(
    "annotated body stores a literal-union let",
    "miss",
    "print(0)",
    'mode = "b"',
  ),
  lib("body edit with a type error", "free", "return n * 2", 'return n * "2"'),
  // The chain.
  chain("chain: lib body edit", "hit", "return n * 2", "return n * 3"),
  chain("chain: lib global type edit", "miss", "let k = 1", "let k = 1.5"),
  chain(
    "chain: lib signature edit",
    "miss",
    "area(n: i32): i32",
    "area(n: i32): f64",
  ),
  // Bodies the dependent's check reads.
  body(
    "generic body edit refused at the call",
    "miss",
    "{ return a }",
    "{ return a - a }",
  ),
  body(
    "untyped-param body edit refused at the call",
    "miss",
    "const y = x",
    "const y = x * 2",
  ),
  body(
    "inferred-return body edit, a new return type",
    "miss",
    "{ return n }",
    "{ return n > 0 }",
  ),
  // Through a module whose own hash stays.
  reexp(
    "re-export: lib signature edit",
    "miss",
    "area(n: i32): i32",
    "area(n: i32): f64",
  ),
  reexp("re-export: lib body edit", "hit", "return n * 2", "return n * 3"),
  reexp(
    "record through mid: field edit",
    "miss",
    "{ w: i32, h: i32 }",
    "{ h: i32, w: i32 }",
  ),
];

const IMPORT = /from\s+"\.\/([A-Za-z_]+)"/g;
const importsOf = (src: string) =>
  [...src.matchAll(IMPORT)].map((m) => `${m[1]}.vl`);

const edited = (c: Case): [Graph, Graph] => {
  const at = c.at ?? "lib.vl";
  const src = c.mods[at];
  if (!src.includes(c.from)) {
    throw new Error(`${c.name}: no \`${c.from}\` in ${at}`);
  }
  return [
    { entry: c.entry, mods: c.mods },
    { entry: c.entry, mods: { ...c.mods, [at]: src.replace(c.from, c.to) } },
  ];
};

const normLines = (ds: string[]) =>
  ds.map((d) => d.replace(/line \d+/g, "line N").replace(/\.vl:\d+/g, ".vl:N"));

// How module `k` differs across the edit, or [] when it does not.
const differs = (k: string, a: Result, b: Result, exact: boolean): string[] => {
  const out: string[] = [];
  const da = a.diags.get(k) ?? [];
  const db = b.diags.get(k) ?? [];
  const sa = exact ? da : normLines(da);
  const sb = exact ? db : normLines(db);
  if (sa.join("\n") !== sb.join("\n")) {
    out.push(`${k} diagnostics: [${da.join(" | ")}] → [${db.join(" | ")}]`);
  }
  if (a.rc === 0 && b.rc === 0) {
    const fa = a.fns.get(k) ?? [];
    const fb = b.fns.get(k) ?? [];
    if (fa.join("\n") !== fb.join("\n")) {
      const i = fa.findIndex((f, j) => f !== fb[j]);
      const la = (fa[i] ?? "").split("\n");
      const lb = (fb[i] ?? "").split("\n");
      const l = la.findIndex((x, j) => x !== lb[j]);
      out.push(
        `${k} wasm function ${i} (${fa.length} → ${fb.length}), line ${l}:\n${
          la.slice(Math.max(0, l - 3), l + 3).join("\n")
        }\n→\n${lb.slice(Math.max(0, l - 3), l + 3).join("\n")}`,
      );
    }
  }
  return out;
};

type Verdict = { hit: boolean; unsound: string[]; compared: number };

// The base side of a fixture is shared by its cases, so it is built once per dropped mask.
const baseRuns = new Map<string, Result>();
const runBase = (exp: Exports, mask: number, g: Graph): Result => {
  const key = `${mask}\0${JSON.stringify(g)}`;
  let r = baseRuns.get(key);
  if (r === undefined) {
    r = run(exp, g, true);
    baseRuns.set(key, r);
  }
  return r;
};

// Every module other than the edited one whose imports all kept their deep hash must come out
// the same; that is the decision a build skipping its re-check would make.
const grade = (exp: Exports, mask: number, c: Case): Verdict => {
  const at = c.at ?? "lib.vl";
  const [g0, g1] = edited(c);
  const a = runBase(exp, mask, g0);
  const b = run(exp, g1, true);
  const ha = a.hash.get(at);
  const hb = b.hash.get(at);
  if (!ha || !hb) {
    throw new Error(`${c.name}: no hash for ${at} (rc ${a.rc}/${b.rc})`);
  }
  const unsound: string[] = [];
  let compared = 0;
  const srcOf = (k: string) => k === "main.vl" ? c.entry : c.mods[k] ?? "";
  for (const k of a.hash.keys()) {
    if (k === at || srcOf(k) === "") continue;
    const deps = importsOf(srcOf(k));
    if (!deps.every((d) => a.hash.get(d)?.deep === b.hash.get(d)?.deep)) {
      continue;
    }
    const exact = deps.every((d) =>
      a.hash.get(d)?.span === b.hash.get(d)?.span
    );
    compared++;
    unsound.push(...differs(k, a, b, exact));
  }
  return { hit: ha.own === hb.own, unsound, compared };
};

const gradeAll = (exp: Exports, mask: number) => {
  exp.ifaceHashDrop(mask);
  try {
    return CASES.map((c) => ({ c, v: grade(exp, mask, c) }));
  } finally {
    exp.ifaceHashDrop(0);
  }
};

Deno.test({
  name:
    "iface-hash: an unchanged interface hash leaves every dependent unchanged",
  ignore: !ENABLED,
  fn: () => {
    const exp = instance();
    const fails: string[] = [];
    const [g0] = edited(CASES[0]);
    const first = runBase(exp, 0, g0);
    if (first.rc !== 0 || (first.fns.get("main.vl") ?? []).length === 0) {
      throw new Error(
        `CONTROL — the base graph must build with main.vl functions / rc ${first.rc}:\n${
          [...first.diags.values()].flat().join("\n")
        }`,
      );
    }
    let hits = 0;
    for (const { c, v } of gradeAll(exp, 0)) {
      if (v.hit) hits++;
      if (v.unsound.length > 0) {
        fails.push(`UNSOUND — ${c.name}:\n  ${v.unsound.join("\n  ")}`);
      }
      if (c.want === "hit" && !v.hit) {
        fails.push(`CONTROL — ${c.name}: want a hit`);
      }
      if (c.want === "miss" && v.hit) {
        fails.push(`CONTROL — ${c.name}: want a miss`);
      }
      if (v.hit && v.compared === 0) {
        fails.push(`CONTROL — ${c.name}: compared nothing`);
      }
    }
    if (fails.length > 0) throw new Error(fails.join("\n"));
    console.log(`[iface-hash] ${CASES.length} edits, ${hits} hits, 0 unsound`);
  },
});

// Each ingredient is load-bearing: dropping it turns its witness case unsound. An inferred
// return is also carried by the checked binding type, so its body is proven on top of
// dropping the types (`over`): the witness must be sound with only `over` dropped.
const INGREDIENTS: {
  what: string;
  mask: number;
  over: number;
  witness: string;
}[] = [
  {
    what: "explicit generic bodies",
    mask: 1,
    over: 0,
    witness: "generic body edit refused at the call",
  },
  {
    what: "untyped-parameter bodies",
    mask: 2,
    over: 0,
    witness: "untyped-param body edit refused at the call",
  },
  {
    what: "inferred-return bodies",
    mask: 4 | 8,
    over: 8,
    witness: "inferred-return body edit, a new return type",
  },
  {
    what: "checked binding types",
    mask: 8,
    over: 0,
    witness: "annotated body delivers a literal let",
  },
  {
    what: "mentions in cut bodies",
    mask: 16,
    over: 0,
    witness: "annotated body writes a global",
  },
  {
    what: "deep hashes",
    mask: 32,
    over: 0,
    witness: "re-export: lib signature edit",
  },
];

const gradeOne = (exp: Exports, mask: number, c: Case): Verdict => {
  exp.ifaceHashDrop(mask);
  try {
    return grade(exp, mask, c);
  } finally {
    exp.ifaceHashDrop(0);
  }
};

Deno.test({
  name:
    "iface-hash: dropping any one ingredient makes its witness edit unsound",
  ignore: !ENABLED,
  fn: () => {
    const exp = instance();
    const fails: string[] = [];
    for (const { what, mask, over, witness } of INGREDIENTS) {
      const c = CASES.find((k) => k.name === witness);
      if (!c) throw new Error(`no case ${witness}`);
      if (gradeOne(exp, over, c).unsound.length > 0) {
        fails.push(`CONTROL — ${witness} is unsound before ${what} is dropped`);
      }
      if (gradeOne(exp, mask, c).unsound.length === 0) {
        fails.push(`MUTANT SURVIVED — without ${what}, ${witness} stays sound`);
      }
    }
    if (fails.length > 0) throw new Error(fails.join("\n"));
  },
});

// ── the hit rate over the compiler's own history ────────────────────────────────────────────
//
// Each edit is one top-level function of `compiler/*.vl` as a first-parent commit changed it,
// applied ALONE to that commit's parent tree; it is a hit when the edited module's hash stays.
// An edit that does not check on its own (it used something its commit added) is left out.

const RATE = Number(Deno.env.get("VL_IFACE_HASH_RATE") ?? "0");
// `VL_IFACE_HASH_RATE_DROP=<mask>` measures the rate with ingredients dropped, as `ifaceHashDrop` takes.
const RATE_DROP = Number(Deno.env.get("VL_IFACE_HASH_RATE_DROP") ?? "0");

const git = (...args: string[]): string => {
  const out = new Deno.Command("git", {
    args,
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  })
    .outputSync();
  if (!out.success) {
    throw new Error(
      `git ${args.join(" ")}: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
  return new TextDecoder().decode(out.stdout);
};

const TOP =
  /^(?:export\s+)?(function|let|const|type)\s+([A-Za-z_][A-Za-z0-9_]*)/;
type Decl = { kind: string; lo: number; hi: number; text: string };

// The lines after a declaration that belong to the next one: blanks and its leading comment.
const isGap = (l: string) => l.trim() === "" || l.trim().startsWith("//");

// A module's top-level declarations by name, each its lines up to the next one's, without the
// next one's leading comment; a name declared twice (an overload) is left out.
const declsOf = (src: string): Map<string, Decl> => {
  const lines = src.split("\n");
  const starts: [string, string, number][] = [];
  lines.forEach((l, i) => {
    const m = l.match(TOP);
    if (m) starts.push([m[1], m[2], i]);
  });
  const out = new Map<string, Decl>();
  const twice = new Set<string>();
  starts.forEach(([kind, name, lo], j) => {
    let hi = j + 1 < starts.length ? starts[j + 1][2] : lines.length;
    while (hi > lo + 1 && isGap(lines[hi - 1])) hi--;
    if (out.has(name)) twice.add(name);
    out.set(name, { kind, lo, hi, text: lines.slice(lo, hi).join("\n") });
  });
  for (const n of twice) out.delete(n);
  return out;
};

// A declaration without its comment lines: an edit to comments alone is not counted.
const codeOf = (text: string) =>
  text.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

// What keeps a changed function's body in the hash, read off its header ("" when nothing).
const headerOf = (text: string) => {
  const end = text.search(/\{\s*(\n|$)/);
  return end < 0 ? text : text.slice(0, end);
};
const visibleWhy = (text: string): string => {
  const h = headerOf(text);
  if (/function\s+\w+\s*</.test(h)) return "generic";
  const open = h.indexOf("(");
  let depth = 0;
  let close = h.length;
  for (let i = open; i < h.length; i++) {
    if ("([{<".includes(h[i])) depth++;
    if (")]}>".includes(h[i])) depth--;
    if (depth === 0) {
      close = i;
      break;
    }
  }
  let piece = "";
  depth = 0;
  for (const ch of h.slice(open + 1, close) + ",") {
    if ("([{<".includes(ch)) depth++;
    if (")]}>".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      if (piece.trim() !== "" && !piece.includes(":")) return "untyped param";
      piece = "";
    } else piece += ch;
  }
  if (!/^\s*:/.test(h.slice(close + 1))) return "inferred return";
  return "";
};

type Edit = { file: string; fn: string; src: string; why: string };

const historyEdits = (n: number): Map<string, Edit[]> => {
  const byRev = new Map<string, Edit[]>();
  let total = 0;
  const revs = git(
    "log",
    "--first-parent",
    "--format=%H",
    "-n",
    "400",
    "origin/master",
    "--",
    "compiler/",
  )
    .trim().split("\n");
  for (const rev of revs) {
    if (total >= n) break;
    const files = git("diff", "--name-only", `${rev}^`, rev, "--", "compiler/")
      .trim().split("\n")
      .filter((f) => /^compiler\/[A-Za-z_]+\.vl$/.test(f));
    for (const file of files) {
      let before: string;
      let after: string;
      try {
        before = git("show", `${rev}^:${file}`);
        after = git("show", `${rev}:${file}`);
      } catch {
        continue;
      }
      const da = declsOf(before);
      const db = declsOf(after);
      const lines = before.split("\n");
      // A name the commit added to the file: an edit that uses one cannot check alone.
      const added = [...db.keys()].filter((k) => !da.has(k));
      for (const [fn, a] of da) {
        const b = db.get(fn);
        if (
          !b || a.kind !== "function" || b.kind !== "function" ||
          codeOf(a.text) === codeOf(b.text) ||
          added.some((k) => new RegExp(`\\b${k}\\b`).test(b.text))
        ) continue;
        if (total >= n) break;
        const src = [...lines.slice(0, a.lo), b.text, ...lines.slice(a.hi)]
          .join("\n");
        const why = headerOf(a.text) !== headerOf(b.text)
          ? "header"
          : visibleWhy(a.text);
        if (!byRev.has(rev)) byRev.set(rev, []);
        byRev.get(rev)!.push({ file, fn, src, why });
        total++;
      }
    }
  }
  return byRev;
};

Deno.test({
  name: "iface-hash: the hit rate over single-function edits to the compiler",
  ignore: !ENABLED || RATE <= 0,
  fn: () => {
    const exp = instance();
    exp.ifaceHashDrop(RATE_DROP);
    const rel = (k: string) =>
      k.startsWith(`${ROOT}/`) ? k.slice(ROOT.length + 1) : k;
    const entryKey = `${ROOT}/compiler/entry.vl`;
    let edits = 0;
    let hits = 0;
    let alone = 0;
    let commits = 0;
    const missWhy = new Map<string, number>();
    const unsound: string[] = [];
    for (const [rev, list] of historyEdits(RATE)) {
      const tree = new Map<string, string | undefined>();
      const at = (k: string) => {
        const f = rel(k);
        if (!tree.has(f)) {
          try {
            tree.set(f, git("show", `${rev}^:${f}`));
          } catch {
            tree.set(f, undefined);
          }
        }
        return tree.get(f);
      };
      const a = runKeys(exp, entryKey, at(entryKey)!, at, false, rel);
      if (a.rc !== 0) continue;
      commits++;
      for (const e of list) {
        const dep = (k: string) => rel(k) === e.file ? e.src : at(k);
        const b = runKeys(exp, entryKey, at(entryKey)!, dep, false, rel);
        if (b.rc !== 0) {
          alone++;
          continue;
        }
        edits++;
        const hit = a.hash.get(e.file)?.own === b.hash.get(e.file)?.own;
        console.log(
          `[iface-hash edit] ${rev.slice(0, 9)} ${e.file} ${e.fn}: ${
            hit ? "hit" : `miss (${e.why || "-"})`
          }`,
        );
        if (!hit) {
          const why = e.why || "a mention or a checked type";
          missWhy.set(why, (missWhy.get(why) ?? 0) + 1);
          continue;
        }
        hits++;
        for (const k of a.hash.keys()) {
          if (k === e.file) continue;
          const deps = importsOf(at(`${ROOT}/${k}`) ?? "").map((d) =>
            `compiler/${d}`
          );
          if (!deps.every((d) => a.hash.get(d)?.deep === b.hash.get(d)?.deep)) {
            continue;
          }
          unsound.push(...differs(k, a, b, false).map((d) => `${e.fn}: ${d}`));
        }
      }
    }
    const pct = edits === 0 ? "0" : (100 * hits / edits).toFixed(1);
    const why = [...missWhy].map(([w, c]) => `${w} ${c}`).join(", ");
    console.log(
      `[iface-hash rate] ${edits} edits from ${commits} commits: ${hits} hits (${pct}%); ` +
        `misses by what kept the body: ${why}; ${alone} that do not check alone left out; ` +
        `${unsound.length} unsound`,
    );
    if (unsound.length > 0) {
      throw new Error(`UNSOUND —\n  ${unsound.join("\n  ")}`);
    }
    if (edits === 0) throw new Error("CONTROL — no edit checked");
  },
});

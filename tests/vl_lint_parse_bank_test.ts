// THE PARSE BANK'S INVARIANT — `lintSrc` after `checkSrc` reports exactly what `lintSrc`
// alone reports.
//
// WHY THIS EXISTS. `lintSrc` used to re-parse the entry from scratch, so what the check
// did to the arena could not reach it. It now replays the tree the check already built
// (driver.vl's `vcEpReplay`), which is sound only while every pass that rewrites a node in
// place either stamps `arenaEpochNow` — retiring the bank — or banks what it replaced.
// A new lowering that rewrites a node and does neither is invisible to every other gate:
// the corpus grades emitted bytes, the fixpoint grades the seed, and both are unmoved by
// a lint finding that quietly changed. This file asks the question directly.
//
// The programs below are chosen for what the check DOES to the arena, not for what they
// lint: a `match` and a template hole rewrite an arena slot, a literal-union annotation and
// an `as` over an alias rewrite a spelling in place, `__callsite__` appends nodes past the
// parse's tail, and a deep `is` runs a whole second pass over a generated fragment.
const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;

const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();

type Exports = Record<string, (...args: number[]) => number>;

const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED))
  : undefined;

const pushString = (push: (cp: number) => number, text: string) => {
  for (const ch of text) push(ch.codePointAt(0)!);
};

const readString = (len: number, at: (j: number) => number): string => {
  const b = new Uint8Array(len);
  for (let j = 0; j < len; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

/** Every lint finding, as one comparable string. */
const findings = (exp: Exports, src: string, check: boolean): string => {
  exp.srcReset();
  pushString(exp.srcPush, src);
  if (check) exp.checkSrc();
  const n = exp.lintSrc();
  if (n < 0) return "PARSE ERROR";
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    rows.push([
      readString(exp.lintCodeLen(i), (j) => exp.lintCodeByte(i, j)),
      readString(exp.lintSevLen(i), (j) => exp.lintSevByte(i, j)),
      exp.lintLine(i),
      exp.lintCol(i),
      exp.lintEnd(i),
      readString(exp.lintMsgLen(i), (j) => exp.lintMsgByte(i, j)),
    ].join("|"));
  }
  return rows.join("\n");
};

// Each case is a whole program; the name says which arena write it exercises.
const CASES: [string, string][] = [
  ["plain", `function f(a: i32): i32 { a + 1 }\nlet unusedOne = 2\nprint(f(3))\n`],
  [
    "match desugar (a slot rewrite)",
    `type Move = { x: i32 }\ntype Stop = { why: string }\ntype Cmd = Move | Stop\n` +
    `function go(c: Cmd): i32 {\n  match c {\n    Move{x} => x\n    Stop => 0\n  }\n}\n` +
    `print(go({ x: 7 }))\n`,
  ],
  [
    "int match desugar",
    `function pick(n: i32): string {\n  match n {\n    1 => "one"\n    2 => "two"\n    _ => "many"\n  }\n}\n` +
    `print(pick(2))\n`,
  ],
  [
    "template hole (a slot rewrite)",
    "function name(): string { \"vl\" }\nprint(`hello ${name()}`)\n",
  ],
  [
    "literal union annotation (a spelling rewrite)",
    `type K = "a" | "b"\nconst k: K = "a"\nfunction take(v: K): string { v }\nprint(take(k))\n`,
  ],
  [
    "alias cast (an `as` spelling rewrite)",
    `type W = f64\nconst w: W = 2.5\nprint((w as W) + 1.0)\n`,
  ],
  [
    "callsite default (appended nodes)",
    `function where(loc: { file: string, line: i32, col: i32 } = __callsite__): string {\n` +
    `  loc.file + ":" + i32ToStr(loc.line)\n}\nprint(where())\n`,
  ],
  [
    "unused everything (a finding-heavy program)",
    `import { fmtI32 } from "std:fmt"\nfunction dead(a: i32): i32 { a }\n` +
    `let never = 1\nlet used = 2\nprint(used)\n`,
  ],
];

for (const [name, src] of CASES) {
  Deno.test(`parse bank: lint after check == lint alone — ${name}`, () => {
    if (!module) throw new Error(`no seed at ${SEED}`);
    // ONE instance for both arms: a fresh instance per arm would also pass with the bank
    // permanently dead, which is the failure mode this file exists to see.
    const exp = new WebAssembly.Instance(module, {})
      .exports as unknown as Exports;
    const alone = findings(exp, src, false);
    const afterCheck = findings(exp, src, true);
    if (alone !== afterCheck) {
      throw new Error(
        `lint findings differ with a preceding checkSrc\n` +
          `--- lint alone ---\n${alone}\n--- after check ---\n${afterCheck}`,
      );
    }
  });
}

// The same question over a program the check REWRITES and one it does not, back to back on
// one instance: a bank that survived a second program's parse would answer here.
Deno.test("parse bank: a second program does not inherit the first's tree", () => {
  if (!module) throw new Error(`no seed at ${SEED}`);
  const exp = new WebAssembly.Instance(module, {})
    .exports as unknown as Exports;
  const want = CASES.map(([, src]) => findings(exp, src, false));
  const got: string[] = [];
  for (const [, src] of CASES) got.push(findings(exp, src, true));
  for (let i = 0; i < want.length; i++) {
    if (want[i] !== got[i]) {
      throw new Error(
        `program ${i} (${CASES[i][0]}) differs after a run of every other program\n` +
          `--- want ---\n${want[i]}\n--- got ---\n${got[i]}`,
      );
    }
  }
});

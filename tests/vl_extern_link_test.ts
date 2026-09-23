// SEPARATELY BUILT UNITS LINK THROUGH `extern` (D1999). Each unit is its own `vl build`; a
// later unit's `extern function f(...)` is satisfied by an earlier unit's `export function f`.
// The engine compares the two functypes by iso-recursive identity, so an export whose type
// sat inside the module's heap-type rec group never equalled the standalone type an import
// declares — every link from a unit with two or more functions was refused.
//
// Two linkers, one expectation each:
//   1. V8 two-instance: unit k is instantiated with `extern` = the exports of units 0..k-1.
//      Always runs under the usual gate (`SELFHOST_NATIVE_ALIGN=1` + binary + seed).
//   2. binaryen `wasm-merge`, folding the units into ONE module, then the release `-O3` flag
//      set over the result. Needs `node_modules/.bin`, which `ci-native` does not install, so it
//      self-ignores there; the `ci-release-shape` job names this file and runs it with npm deps.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";
import { vlHostImports } from "../compiler/vlHostImports.ts";

const STD = `${ROOT}/std`;
const WASM_MERGE = `${ROOT}/node_modules/.bin/wasm-merge`;
const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
// The host's own `BINARYEN_FEATURES` (scripts/vl-host/src/main.rs); `--all-features` would let
// `-O3` write exact heap types, which V8 does not parse by default.
const FEATURES = [
  "--enable-reference-types",
  "--enable-gc",
  "--enable-bulk-memory",
  "--enable-tail-call",
  "--enable-simd",
];

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
const MERGE = ENABLED && exists(WASM_MERGE) && exists(WASM_OPT);
if (GATED && !ENABLED) {
  console.warn("[vl-extern-link] skipped — missing vl binary or seed wasm.");
}

type Unit = { name: string; src: string };

// The D1999 witness: unit A exports TWO functions, which is what put `f` in a rec group.
const WITNESS: Unit[] = [
  {
    name: "a",
    src: "export function f(a: i32): i32 {\n  print(a * 2)\n  return a\n}\n" +
      "export function other(a: i32): i32 { return a + 1 }\n",
  },
  { name: "b", src: "extern function f(a: i32): i32\nf(21)\nf(5)\n" },
];

// A four-unit chain. `a` declares a struct, so its heap-type rec group is non-empty, and
// exports zero to four params over every extern scalar; `b` imports them all and exports
// its own; `c` uses a closure (the env-carrying convention whose exports go through a
// wrapper) and re-exports; `d` imports from `c`.
const CHAIN: Unit[] = [
  {
    name: "a",
    src: `type P = { x: i32, name: string }
export function z0(): i32 { return 7 }
export function a1(a: i32): i64 { return (a as i64) * 1000000000000 }
export function a2(a: i64, b: f32): f32 { return (a as f32) + b }
export function a3(a: f64, b: i32, c: i64): f64 { return a * (b as f64) + (c as f64) }
export function a4(a: f32, b: f64, c: i32, d: i64): i32 {
  const p: P = { x: c, name: "q" }
  return p.x + (a as! i32) + (b as! i32) + (d as! i32)
}
export function b1(a: boolean): boolean { return !a }
export function z1(): f64 { return 2.5 }
`,
  },
  {
    name: "b",
    src: `extern function z0(): i32
extern function a1(a: i32): i64
extern function a2(a: i64, b: f32): f32
extern function a3(a: f64, b: i32, c: i64): f64
extern function a4(a: f32, b: f64, c: i32, d: i64): i32
extern function b1(a: boolean): boolean
extern function z1(): f64
print(z0())
print(a1(3))
print(a2(4 as i64, 0.5 as f32))
print(a3(1.5, 2, 10 as i64))
print(a4(1.0 as f32, 2.0, 3, 4 as i64))
print(b1(false))
print(z1())
export function mid(a: i32): i32 { return z0() + a }
export function mid2(a: f64): f64 { return a * 2.0 }
`,
  },
  {
    name: "c",
    src: `extern function mid(a: i32): i32
extern function mid2(a: f64): f64
extern function a1(a: i32): i64
const k = mid(1)
const xs = [1, 2, 3].map((v) => v + k)
print(xs[2])
print(mid2(1.25))
print(a1(1))
export function last(a: i32): i32 { return a * 3 }
export function last2(a: i32): i32 { return a - 1 }
`,
  },
  {
    name: "d",
    src: "extern function last(a: i32): i32\nextern function last2(a: i32): i32\n" +
      "print(last(10))\nprint(last2(10))\n",
  },
];
const CHAIN_LOGS = "7,3000000000000,4.5,13,10,true,2.5,11,2.5,1000000000000,30,9";

const run = async (cmd: string, args: string[]): Promise<void> => {
  const { code, stderr } = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: STD },
  }).output();
  if (code !== 0) {
    const err = new TextDecoder().decode(stderr);
    throw new Error(`\`${cmd} ${args.join(" ")}\` exited ${code}\n${err}`);
  }
};

/** Build every unit into `dir`, returning the `.wasm` paths in unit order. */
const buildUnits = async (dir: string, units: Unit[]): Promise<string[]> => {
  const out: string[] = [];
  for (const u of units) {
    await Deno.writeTextFile(`${dir}/${u.name}.vl`, u.src);
    const w = `${dir}/${u.name}.wasm`;
    await run(VL, ["build", `${dir}/${u.name}.vl`, "-o", w, "--compiler", COMPILER]);
    out.push(w);
  }
  return out;
};

/** Instantiate each unit against the exports of the ones before it; the logs, in order. */
const linkV8 = async (wasms: string[]): Promise<string> => {
  const logs: string[] = [];
  const { imports } = vlHostImports(logs);
  const ext: WebAssembly.ModuleImports = {};
  for (const w of wasms) {
    const mod = new WebAssembly.Module(await Deno.readFile(w));
    const inst = new WebAssembly.Instance(mod, { imports, extern: ext });
    Object.assign(ext, inst.exports);
  }
  return logs.join(",");
};

/** Fold the units into one module with `wasm-merge` (the merge so far is `extern` for the next). */
const mergeAll = async (dir: string, wasms: string[]): Promise<string> => {
  let acc = wasms[0];
  for (let i = 1; i < wasms.length; i++) {
    const next = `${dir}/merged${i}.wasm`;
    await run(WASM_MERGE, [acc, "extern", wasms[i], `u${i}`, ...FEATURES, "-o", next]);
    acc = next;
  }
  return acc;
};

/** Run one self-contained module; its start functions print, so instantiating is running. */
const runOne = async (w: string): Promise<string> => {
  const logs: string[] = [];
  const { imports } = vlHostImports(logs);
  new WebAssembly.Instance(new WebAssembly.Module(await Deno.readFile(w)), { imports });
  return logs.join(",");
};

const withDir = async (f: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_extern_link_" });
  try {
    await f(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const expectLogs = (what: string, got: string, want: string): void => {
  if (got !== want) throw new Error(`${what}: want logs ${want}, got ${got}`);
};

Deno.test({
  name: "extern link: a two-function unit's export satisfies another unit's import (D1999, V8)",
  ignore: !ENABLED,
  fn: () =>
    withDir(async (dir) => {
      expectLogs("V8 link", await linkV8(await buildUnits(dir, WITNESS)), "42,10");
    }),
});

Deno.test({
  name: "extern link: a four-unit chain over every extern scalar and a closure unit (V8)",
  ignore: !ENABLED,
  fn: () =>
    withDir(async (dir) => {
      expectLogs("V8 link", await linkV8(await buildUnits(dir, CHAIN)), CHAIN_LOGS);
    }),
});

Deno.test({
  name: "extern link: wasm-merge folds the witness and the chain, and -O3 keeps them running",
  ignore: !MERGE,
  fn: () =>
    withDir(async (dir) => {
      for (const [what, units, want] of [
        ["witness", WITNESS, "42,10"],
        ["chain", CHAIN, CHAIN_LOGS],
      ] as const) {
        const sub = `${dir}/${what}`;
        await Deno.mkdir(sub);
        const merged = await mergeAll(sub, await buildUnits(sub, [...units]));
        expectLogs(`${what} merged`, await runOne(merged), want);
        const opt = `${sub}/merged.O3.wasm`;
        await run(WASM_OPT, [merged, ...FEATURES, "-O3", "-o", opt]);
        expectLogs(`${what} merged -O3`, await runOne(opt), want);
      }
    }),
});

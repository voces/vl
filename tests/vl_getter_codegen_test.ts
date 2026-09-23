// A GETTER READ COSTS WHAT THE CALL COSTS — property-access-design.md §A2 and §D3a.
//
// `v.x` on a getter is rewritten into the call `x(v)` before the emitter runs, so the emitter
// never learns the difference. This pins the consequence, per optimisation rung, by building
// the same program spelled three ways and comparing the MODULE BYTES:
//
//   1. a lane getter over a `new v128` brand, against a direct call and a UFCS call to the
//      same body — byte-identical at `-O0`, `-O` and `-O3`, and exactly one
//      `f32x4.extract_lane` in the optimised module;
//   2. a field-read getter over a `new { … }` brand, against the raw field read — identical
//      at `-O` and `-O3` once binaryen has inlined the getter away;
//   3. the flat-row pattern `stack[i].tt` against `stack[i].tt()` — identical at every rung.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_OPT) && exists(WASM_DIS);
if (!ENABLED) console.warn("[getter-codegen] skipped — missing vl, the seed or binaryen");

const LANE_PRE = [
  'import { Buffer } from "std:buffer"',
  "type F4 = new v128",
];
const LANE_BODY = "__extract_lane_f32x4__(self as! v128, 1)";
const LANE_POST = [
  "const b = Buffer(64)",
  "b.storeF32(4, 7.5)",
  "const v = __load_v128__(b.base) as F4",
];

const FIELD_PRE = [
  "type P = new { a: f32, b: f32 }",
  "function mk(k: f32): P { return { a: k, b: k * 2.0 } }",
];

const ROW_PRE = [
  'import { Buffer } from "std:buffer"',
  "flat type TValue = { value: i64, tt: i32, pad: i32 }",
  "type RowAddr = new i32",
  "type Stack = new { base: i32, count: i32 }",
  'function "[]"(self: Stack, i: i32): RowAddr {',
  "  return (self.base + i * TValue.size) as RowAddr",
  "}",
  "function setTt(self: RowAddr, v: i32) { __store_i32__((self as! i32) + TValue.tt, v) }",
];
const ROW_BODY = "__load_i32__((self as! i32) + TValue.tt)";
const rowLoop = (read: string) => [
  "const buf = Buffer(4096)",
  "const st: Stack = { base: buf.base + 64, count: 8 }",
  "let i = 0",
  "while i < 8 {",
  "  st[i].setTt(i * 3)",
  "  i = i + 1",
  "}",
  "let acc = 0",
  "let j = 0",
  "while j < 8 {",
  `  acc = acc + ${read}`,
  "  j = j + 1",
  "}",
  "print(acc)",
];

const PROGRAMS: Record<string, string[]> = {
  laneGetter: [...LANE_PRE, `get y(self: F4): f32 { ${LANE_BODY} }`, ...LANE_POST, "print(v.y)"],
  laneCall: [
    ...LANE_PRE,
    `function y(self: F4): f32 { ${LANE_BODY} }`,
    ...LANE_POST,
    "print(y(v))",
  ],
  laneUfcs: [
    ...LANE_PRE,
    `function y(self: F4): f32 { ${LANE_BODY} }`,
    ...LANE_POST,
    "print(v.y())",
  ],
  fieldGetter: [
    ...FIELD_PRE,
    "get second(self: P): f32 { self.b }",
    "const p = mk(3.0)",
    "print(p.second)",
  ],
  fieldRead: [...FIELD_PRE, "const p = mk(3.0)", "print(p.b)"],
  rowGetter: [...ROW_PRE, `get tt(self: RowAddr): i32 { ${ROW_BODY} }`, ...rowLoop("st[j].tt")],
  rowUfcs: [
    ...ROW_PRE,
    `function tt(self: RowAddr): i32 { ${ROW_BODY} }`,
    ...rowLoop("st[j].tt()"),
  ],
};

type Rung = "-O0" | "-O" | "-O3";

const build = async (dir: string, name: string, rung: Rung): Promise<Uint8Array> => {
  const src = `${dir}/${name}.vl`;
  const out = `${dir}/${name}${rung}.wasm`;
  const args = ["build", src, "-o", out, "--compiler", COMPILER];
  if (rung !== "-O0") args.push(rung);
  const p = await new Deno.Command(VL, {
    args,
    env: nativeEnv({ VL_WASM_OPT: WASM_OPT, VL_WASM_DIS: WASM_DIS }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!p.success) {
    throw new Error(`vl build ${name} ${rung} failed: ${new TextDecoder().decode(p.stderr)}`);
  }
  return Deno.readFileSync(out);
};

const wat = async (bytes: Uint8Array, dir: string): Promise<string> => {
  const f = `${dir}/dis.wasm`;
  Deno.writeFileSync(f, bytes);
  const p = await new Deno.Command(WASM_DIS, { args: [f], stdout: "piped" }).output();
  return new TextDecoder().decode(p.stdout);
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const count = (s: string, needle: string): number => s.split(needle).length - 1;

Deno.test({
  name: "getter codegen: a getter read is the call it is rewritten to",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-getter-cg-" });
    try {
      for (const [name, lines] of Object.entries(PROGRAMS)) {
        Deno.writeTextFileSync(`${dir}/${name}.vl`, lines.join("\n") + "\n");
      }
      const mods: Record<string, Uint8Array> = {};
      for (const name of Object.keys(PROGRAMS)) {
        for (const rung of ["-O0", "-O", "-O3"] as Rung[]) {
          mods[name + rung] = await build(dir, name, rung);
        }
      }
      const pairs: [string, string, Rung[]][] = [
        ["laneGetter", "laneCall", ["-O0", "-O", "-O3"]],
        ["laneGetter", "laneUfcs", ["-O0", "-O", "-O3"]],
        ["fieldGetter", "fieldRead", ["-O", "-O3"]],
        ["rowGetter", "rowUfcs", ["-O0", "-O", "-O3"]],
      ];
      for (const [a, b, rungs] of pairs) {
        for (const rung of rungs) {
          if (!sameBytes(mods[a + rung], mods[b + rung])) {
            throw new Error(`${a} and ${b} differ at ${rung}; want byte-identical modules`);
          }
        }
      }
      for (const rung of ["-O", "-O3"] as Rung[]) {
        const lanes = count(await wat(mods["laneGetter" + rung], dir), "f32x4.extract_lane");
        if (lanes !== 1) {
          throw new Error(`laneGetter ${rung}: want 1 f32x4.extract_lane, got ${lanes}`);
        }
      }
      const fieldO = await wat(mods["fieldGetter-O"], dir);
      if (count(fieldO, "struct.get") !== 1 || count(fieldO, "(call ") !== 1) {
        throw new Error(
          `fieldGetter -O: want one struct.get and no call but the print, got\n${fieldO}`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

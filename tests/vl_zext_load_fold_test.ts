// THE ZERO-EXTENDING LOAD FOLD reaches the instructions — plumb PL-048.
//
// `(__load_i32__(p, off) as% i64) & 4294967295` is emitted as one `i64.load32_u`, and an unsigned
// narrow load widened to i64 (masked or not) as one `i64.load8_u`/`i64.load16_u`. Binaryen folds
// the widening but keeps the mask, so the emitter does (`zextLoadOf` in compiler/wasmEmit.vl).
// tests/cases/memory/load-zero-extend-fold-values.vl grades the VALUES; this reads the
// disassembly, at no rung and at `-O`, since a value cannot tell the folded form from the other.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_OPT) && exists(WASM_DIS);
if (!ENABLED) console.warn("[zext-load-fold] skipped — missing vl, the seed or binaryen");

// name → [an exported function f, substrings that must appear in f (whitespace collapsed), and
// substrings f must not contain]
const CASES: Record<string, [string, string[], string[]]> = {
  // plumb's guest load, exactly.
  plumbLoad: [
    "export function f(p: i32): i64 { (__load_i32__(p, 8) as% i64) & 4294967295 }",
    ["(i64.load32_u offset=8 (local.get $0) )"],
    ["i64.and", "extend", "load32_s"],
  ],
  // plumb's generated chunks mask twice; the mask names an i64 const in its runtime.
  twiceByConst: [
    "const M32: i64 = 4294967295\n" +
    "export function f(p: i32): i64 { (((__load_i32__(p, 12) as% i64) & M32)) & M32 }",
    ["(i64.load32_u offset=12 (local.get $0) )"],
    ["i64.and", "extend"],
  ],
  // The plain cast and the mask on the left.
  propLeft: [
    "export function f(p: i32): i64 { 0xffff_ffff & (__load_i32__(p) as i64) }",
    ["(i64.load32_u (local.get $0) )"],
    ["i64.and", "extend"],
  ],
  // An unsigned narrow load under a mask that covers its width.
  u8Masked: [
    "export function f(p: i32): i64 { ((__load_u8__(p, 3) as% i64)) & 4294967295 }",
    ["(i64.load8_u offset=3 (local.get $0) )"],
    ["i64.and", "extend"],
  ],
  u16Masked: [
    "export function f(p: i32): i64 { (__load_u16__(p, 6) as% i64) & 65535 }",
    ["(i64.load16_u offset=6 (local.get $0) )"],
    ["i64.and", "extend"],
  ],
  // An unsigned narrow load widened with no mask at all.
  u16Bare: [
    "export function f(p: i32): i64 { __load_u16__(p) as i64 }",
    ["(i64.load16_u (local.get $0) )"],
    ["extend"],
  ],
  // The intrinsics, spelled directly.
  intrinsics: [
    "export function f(p: i32): i64 { __load_u32_i64__(p) + __load_u16_i64__(p, 2) + __load_u8_i64__(p, 3) }",
    ["i64.load32_u", "i64.load16_u offset=2", "i64.load8_u offset=3"],
    ["extend", "i64.and"],
  ],
  // DECLINES. A mask that drops a bit is not a zero-extend.
  dropBitStays: [
    "export function f(p: i32): i64 { (__load_i32__(p) as% i64) & 4294967294 }",
    ["i64.and", "(i64.const 4294967294)"],
    ["load32_u"],
  ],
  // A mask narrower than the load keeps its `and`; the widening under it still folds.
  narrowMaskStays: [
    "export function f(p: i32): i64 { (__load_u16__(p) as% i64) & 255 }",
    ["(i64.and (i64.load16_u (local.get $0) ) (i64.const 255) )"],
    [],
  ],
  // A sign-extended i32 load with no mask stays signed.
  signedStays: [
    "export function f(p: i32): i64 { __load_i32__(p) as i64 }",
    [],
    ["load32_u"],
  ],
};

const count = (s: string, needle: string): number => s.split(needle).length - 1;

// The disassembled body of the module's function `f`, whitespace collapsed.
const fBody = (wat: string): string => {
  const flat = wat.replace(/\s+/g, " ");
  const at = flat.search(/\(func \$f(@\d+)? \(/);
  if (at < 0) throw new Error(`no function $f in\n${wat}`);
  const next = flat.indexOf(" (func ", at + 1);
  return next < 0 ? flat.slice(at) : flat.slice(at, next);
};

const dis = async (dir: string, name: string, rung: string[]): Promise<string> => {
  const out = `${dir}/${name}${rung.join("")}.wasm`;
  const b = await new Deno.Command(VL, {
    args: ["build", `${dir}/${name}.vl`, "-o", out, "--compiler", COMPILER, "--names", ...rung],
    env: nativeEnv({ VL_WASM_OPT: WASM_OPT, VL_WASM_DIS: WASM_DIS }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!b.success) {
    throw new Error(`vl build ${name} ${rung} failed: ${new TextDecoder().decode(b.stderr)}`);
  }
  const d = await new Deno.Command(WASM_DIS, {
    args: ["--enable-simd", "--enable-threads", out],
    stdout: "piped",
  }).output();
  return new TextDecoder().decode(d.stdout);
};

Deno.test({
  name: "zero-extending load fold: the folded load is what the emitter writes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-zext-load-fold-" });
    try {
      for (const [name, [fn, want, notWant]] of Object.entries(CASES)) {
        Deno.writeTextFileSync(`${dir}/${name}.vl`, `${fn}\n`);
        for (const rung of [[], ["-O"]]) {
          const body = fBody(await dis(dir, name, rung));
          for (const w of want) {
            if (count(body, w) < 1) throw new Error(`${name} ${rung}: want \`${w}\`, got\n${body}`);
          }
          for (const w of notWant) {
            if (count(body, w) > 0) throw new Error(`${name} ${rung}: want no \`${w}\`, got\n${body}`);
          }
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

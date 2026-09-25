// THE SHIFT/MASK STRENGTH REDUCTION reaches the instructions — plumb PL-037 item 2.
//
// `((x >>> k) & m) << j` (or `* 2^j`) is emitted as one shift and one mask, and an i64 shift that
// only feeds the low word of an `as% i32` is narrowed to i32. Binaryen folds neither, so the
// emitter does (`emitShiftMaskFold` in compiler/wasmEmit.vl). tests/cases/bitwise/shift-mask-fold.vl
// grades the VALUES at the boundaries; this reads the disassembly, at no rung and at `-O`, since a
// value cannot tell the reduced form from the unreduced one.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_OPT) && exists(WASM_DIS);
if (!ENABLED) console.warn("[shift-mask-fold] skipped — missing vl, the seed or binaryen");

// name → [an exported function f, instruction sequences that must appear in f (whitespace
// collapsed), and substrings f must not contain]
const CASES: Record<string, [string, string[], string[]]> = {
  // plumb's `mix` index: LLVM's `wrap(a) & 8184`, exactly.
  mixIndex: [
    "export function f(a: i64) { ((a >>> 3) as% i32 & 1023) * 8 }",
    ["(i32.and (i32.wrap_i64 (local.get $0) ) (i32.const 8184) )"],
    ["i64.shr_u", "i32.shl", "i32.mul", "i32.shr_u"],
  ],
  // j < k: one right shift by k - j, the mask moved up by j.
  shiftDown: [
    "export function f(x: i32) { ((x >>> 5) & 255) << 2 }",
    ["(i32.and (i32.shr_u (local.get $0) (i32.const 3) ) (i32.const 1020) )"],
    ["i32.shl"],
  ],
  // j > k: one left shift by j - k.
  shiftUp: [
    "export function f(x: i32) { ((x >>> 2) & 255) << 5 }",
    ["(i32.and (i32.shl (local.get $0) (i32.const 3) ) (i32.const 8160) )"],
    ["i32.shr_u"],
  ],
  // The same at i64, the multiplier on the left.
  wide: [
    "export function f(a: i64) { 8 * ((a >>> 3) & 1023) }",
    ["(i64.and (local.get $0) (i64.const 8184) )"],
    ["i64.shr_u", "i64.shl", "i64.mul"],
  ],
  // A narrowing alone: the i64 shift becomes an i32 one.
  narrow: [
    "export function f(a: i64) { (a >>> 3) as% i32 & 1023 }",
    ["(i32.and (i32.shr_u (i32.wrap_i64 (local.get $0) ) (i32.const 3) ) (i32.const 1023) )"],
    ["i64.shr_u"],
  ],
  // The mask inside the cast narrows the same way.
  wrappedMask: [
    "export function f(a: i64) { ((a >>> 3) & 1023) as% i32 }",
    ["(i32.and (i32.shr_u (i32.wrap_i64 (local.get $0) ) (i32.const 3) ) (i32.const 1023) )"],
    ["i64.shr_u", "i64.and"],
  ],
  // DECLINES. `>>` whose mask reaches the sign fill (bit 31 of `x >> 3` is a copy of bit 31):
  // the arithmetic shift has to stay.
  signFillStays: [
    "export function f(x: i32) { ((x >> 3) & 0x7fffffff) << 3 }",
    ["i32.shr_s"],
    [],
  ],
  // A mask reaching bit 32 - k of the wrapped word reads bits of the i64 above the low word.
  narrowPastLowWordStays: [
    "export function f(a: i64) { (a >>> 3) as% i32 & 0x7fffffff }",
    ["i64.shr_u"],
    [],
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
  name: "shift/mask fold: the reduced shape is what the emitter writes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-shift-mask-fold-" });
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

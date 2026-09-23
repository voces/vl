// A LITERAL LANE INDEX IS ONE LANE INSTRUCTION — property-access-design.md §A7 and §E3.
//
// `std:simd`'s `lane(i)` / `withLane(i, x)` take `i: Lane` (`0 | 1 | 2 | 3`) and branch over it,
// each arm passing a LITERAL to the lane intrinsic. At `-O` and `-O3` a literal argument must
// fold that ladder to exactly one `f32x4.extract_lane N` / `f32x4.replace_lane N` with the right
// immediate, and the `.x`–`.w` getters to one `extract_lane` each. A `Lane` known only at run
// time keeps all four arms. The vector is loaded from a `Buf` so nothing constant-folds away.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_OPT) && exists(WASM_DIS);
if (!ENABLED) console.warn("[simd-lane-codegen] skipped — missing vl, the seed or binaryen");

const PRE = [
  'import { Buffer } from "std:buffer"',
  'import { Lane, loadF32x4, storeF32x4 } from "std:simd"',
  "const b = Buffer(64)",
  "b.storeF32(8, 7.5)",
  "const v = b.loadF32x4(0)",
];

const PICK = [
  "function pick(n: i32): Lane {",
  "  if n == 0 { return 0 }",
  "  if n == 1 { return 1 }",
  "  if n == 2 { return 2 }",
  "  return 3",
  "}",
];

// name → [program tail, want extract_lane, want replace_lane, the one immediate wanted]
const CASES: Record<string, [string[], number, number, string | null]> = {
  laneLiteral: [["print(v.lane(2))"], 1, 0, "f32x4.extract_lane 2"],
  withLaneLiteral: [["b.storeF32x4(16, v.withLane(1, 2.5))"], 0, 1, "f32x4.replace_lane 1"],
  getterY: [["print(v.y)"], 1, 0, "f32x4.extract_lane 1"],
  getterW: [["print(v.w)"], 1, 0, "f32x4.extract_lane 3"],
  laneRuntime: [[...PICK, "print(v.lane(pick(b.loadI32(32) + 2)))"], 4, 0, null],
};

const count = (s: string, needle: string): number => s.split(needle).length - 1;

const dis = async (dir: string, name: string, rung: string): Promise<string> => {
  const out = `${dir}/${name}${rung}.wasm`;
  const b = await new Deno.Command(VL, {
    args: ["build", `${dir}/${name}.vl`, "-o", out, "--compiler", COMPILER, rung],
    env: nativeEnv({ VL_WASM_OPT: WASM_OPT, VL_WASM_DIS: WASM_DIS }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!b.success) {
    throw new Error(`vl build ${name} ${rung} failed: ${new TextDecoder().decode(b.stderr)}`);
  }
  const d = await new Deno.Command(WASM_DIS, { args: [out], stdout: "piped" }).output();
  return new TextDecoder().decode(d.stdout);
};

Deno.test({
  name: "simd lane codegen: a literal lane index folds to one lane instruction",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-simd-lane-cg-" });
    try {
      for (const [name, [tail, wantE, wantR, imm]] of Object.entries(CASES)) {
        Deno.writeTextFileSync(`${dir}/${name}.vl`, [...PRE, ...tail].join("\n") + "\n");
        for (const rung of ["-O", "-O3"]) {
          const wat = await dis(dir, name, rung);
          const e = count(wat, "f32x4.extract_lane");
          const r = count(wat, "f32x4.replace_lane");
          if (e !== wantE || r !== wantR) {
            throw new Error(
              `${name} ${rung}: want ${wantE} extract_lane / ${wantR} replace_lane, ` +
                `got ${e} / ${r}\n${wat}`,
            );
          }
          if (imm !== null && count(wat, imm) !== 1) {
            throw new Error(`${name} ${rung}: want one \`${imm}\`, got\n${wat}`);
          }
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

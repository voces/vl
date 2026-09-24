// THE MEMARG OFFSET reaches the instruction — simd-design.md §G1 "Offsets".
//
// A memory intrinsic's offset form (`__load_i64__(p, 16)`) writes its offset into the access's
// memarg, and the compiler moves a constant part of an ordinary address there itself only where
// the i32 add provably cannot wrap. The fixtures under tests/cases/intrinsics/memarg-offset-*
// grade the VALUES; this reads the disassembly, at no rung and at `-O`, since a value cannot
// tell `offset=16` from an `i32.add` of 16.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_OPT) && exists(WASM_DIS);
if (!ENABLED) console.warn("[memarg-offset] skipped — missing vl, the seed or binaryen");

const PRE = ["const D = 0x0c000000"];

// name → [program, instructions that must appear, instructions that must not]
const CASES: Record<string, [string[], string[], string[]]> = {
  explicitLoad: [
    ["function f(p: i32) { __load_i64__(p, 16) }", "print(f(__load_i32__(0)))"],
    ["i64.load offset=16"],
    [],
  ],
  explicitStore: [
    ["function f(p: i32, v: i32) { __store_i32__(p, 8, v) }", "f(__load_i32__(0), 1)"],
    ["i32.store offset=8"],
    [],
  ],
  constOffset: [
    ["function f(p: i32) { __load_f64__(p, D + 8) }", "print(f(__load_i32__(0)))"],
    ["f64.load offset=201326600"],
    [],
  ],
  largest: [
    ["function f(p: i32) { __load_u8__(p, 4294967295) }", "print(f(__load_i32__(0)))"],
    ["i32.load8_u offset=4294967295"],
    [],
  ],
  vector: [
    ["function f(p: i32) { __store_v128__(p, 32, __load_v128__(p, 16)) }", "f(__load_i32__(0))"],
    ["v128.load offset=16", "v128.store offset=32"],
    [],
  ],
  atomic: [
    ["function f(p: i32) { __atomic_rmw_cmpxchg_i64__(p, 24, 0 as i64, 1 as i64) }", "print(f(__load_i32__(0)))"],
    ["i64.atomic.rmw.cmpxchg offset=24"],
    [],
  ],
  // `(x & 1023) * 8` is at most 8184, so `D + (x & 1023) * 8` never wraps and D moves.
  provedFold: [
    ["function f(x: i32) { __load_i64__(D + (x & 1023) * 8) }", "print(f(__load_i32__(0)))"],
    ["i64.load offset=201326592"],
    [],
  ],
  // `x * 8` is unbounded, so the add can wrap and must stay an add.
  unprovedStays: [
    ["function f(x: i32) { __load_i64__(D + x * 8) }", "print(f(__load_i32__(0)))"],
    ["i64.load\n"],
    ["offset="],
  ],
};

const count = (s: string, needle: string): number => s.split(needle).length - 1;

const dis = async (dir: string, name: string, rung: string[]): Promise<string> => {
  const out = `${dir}/${name}${rung.join("")}.wasm`;
  const b = await new Deno.Command(VL, {
    args: ["build", `${dir}/${name}.vl`, "-o", out, "--compiler", COMPILER, ...rung],
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
  name: "memarg offset: the offset form and the proved fold write the memarg",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-offset-" });
    try {
      for (const [name, [prog, want, notWant]] of Object.entries(CASES)) {
        Deno.writeTextFileSync(`${dir}/${name}.vl`, [...PRE, ...prog].join("\n") + "\n");
        for (const rung of [[], ["-O"]]) {
          const wat = await dis(dir, name, rung);
          for (const w of want) {
            if (count(wat, w) < 1) {
              throw new Error(`${name} ${rung}: want \`${w.trim()}\`, got\n${wat}`);
            }
          }
          for (const w of notWant) {
            if (count(wat, w) > 0) {
              throw new Error(`${name} ${rung}: want no \`${w}\`, got\n${wat}`);
            }
          }
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// `--low-memory-unused` is opt-in: with it, `-O` folds `p + 16` (an add that may wrap, so the
// compiler leaves it) into the offset; without it, the add stays. Alone it is a usage error.
Deno.test({
  name: "memarg offset: --low-memory-unused folds a small added constant at -O only when asked",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-" });
    try {
      Deno.writeTextFileSync(
        `${dir}/lmu.vl`,
        "function f(p: i32) { __load_i32__(p + 16) }\nprint(f(__load_i32__(0)))\n",
      );
      const off = await dis(dir, "lmu", ["-O"]);
      if (count(off, "offset=16") !== 0) throw new Error(`-O alone folded the add:\n${off}`);
      const on = await dis(dir, "lmu", ["-O", "--low-memory-unused"]);
      if (count(on, "i32.load offset=16") !== 1) {
        throw new Error(`-O --low-memory-unused did not fold:\n${on}`);
      }
      const bare = await new Deno.Command(VL, {
        args: ["build", `${dir}/lmu.vl`, "-o", `${dir}/x.wasm`, "--compiler", COMPILER, "--low-memory-unused"],
        env: nativeEnv({ VL_WASM_OPT: WASM_OPT }),
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (bare.code !== 2) throw new Error(`want exit 2 without -O, got ${bare.code}`);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

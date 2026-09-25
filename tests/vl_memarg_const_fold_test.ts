// THE DECLARATION-TIME ADDRESS FOLD (D2368/D2369) — `vl_memarg_offset_test.ts`'s fold sees
// only the expression written inside the load/store call, so `const p = D + (x & 1023) * 8;
// __load_i64__(p)` (the vs-rust `mix` kernel's own shape) kept the `i32.add` — the compiler
// now tees the bounded part into `p`'s own extra scratch local at its declaration, so a later
// `emitMemAddr` reads THAT local with offset D instead of `p` with offset 0. This reads the
// disassembly, since a value cannot tell `offset=D` from an `i32.add` of D; the fixtures under
// tests/cases/intrinsics/memarg-const-fold-*.vl grade the VALUES.
//
// `p`'s own (unfolded) local still computes `K + bounded` for whatever else might read it, so
// the `i32.add` survives at the NO-RUNG build even where every address use folded — it is dead
// code, gone only once `-O` runs its DCE. `notAtOpt` is checked at `-O` only for that reason.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (!ENABLED) console.warn("[memarg-const-fold] skipped — missing vl, the seed or binaryen");

// `bench/vs-rust/k.vl`'s own constant, so `D2368OFF` below is the mix kernel's real offset.
const PRE = ["const D = 0x0c000000"];
const D2368OFF = "offset=201326592";

type Case = {
  prog: string[];
  wantAlways: string[];
  notWantAlways: string[];
  notAtOpt: string[];
};

const CASES: Record<string, Case> = {
  // The mix kernel's own shape: one address bound once, read once. `-O` strength-reduces
  // `(x & 1023) * 8` to a shift+mask (PL-037 item 2) regardless of this fold, and its DCE
  // drops `p`'s own now-dead `K + bounded` local entirely.
  mixShape: {
    prog: [
      "function f(x: i32) { const p = D + (x & 1023) * 8; print(__load_i64__(p) as% i32) }",
      "f(__load_i32__(0))",
    ],
    wantAlways: [`i64.load ${D2368OFF}`],
    notWantAlways: [],
    notAtOpt: ["i32.add"],
  },
  // Used twice (load then store), the mix kernel's real pattern: both fold, from the SAME
  // scratch local.
  usedTwice: {
    prog: [
      "function f(x: i32) {",
      "  const p = D + (x & 1023) * 8",
      "  const v = __load_i64__(p)",
      "  __store_i64__(p, v + 1)",
      "}",
      "f(__load_i32__(0))",
    ],
    wantAlways: [`i64.load ${D2368OFF}`, `i64.store ${D2368OFF}`],
    notWantAlways: [],
    notAtOpt: ["i32.add"],
  },
  // `p` used as BOTH an address and a plain value: the address use still folds, and the
  // plain use still reads `p`'s own (unfolded, and here NOT dead) local — so the add survives
  // at every rung, `-O` included.
  mixedUse: {
    prog: [
      "function f(x: i32) {",
      "  const p = D + (x & 1023) * 8",
      "  __store_i64__(p, 0 as i64)",
      "  print(p)",
      "}",
      "f(__load_i32__(0))",
    ],
    wantAlways: [`i64.store ${D2368OFF}`, "i32.add"],
    notWantAlways: [],
    notAtOpt: [],
  },
  // A `let` matches the same shape but can be reassigned, so it must not fold — the add stays
  // and the address is `p`'s own full (unfolded) value at offset 0.
  letNotFolded: {
    prog: [
      "function f(x: i32) { let p = D + (x & 1023) * 8; print(__load_i64__(p) as% i32) }",
      "f(__load_i32__(0))",
    ],
    wantAlways: ["i32.add"],
    notWantAlways: [D2368OFF],
    notAtOpt: [],
  },
  // An unbounded bounded-part (no mask) still declines, exactly as the inline fold does.
  unboundedNotFolded: {
    prog: [
      "function f(x: i32) { const p = D + x * 8; print(__load_i64__(p) as% i32) }",
      "f(__load_i32__(0))",
    ],
    wantAlways: ["i32.add"],
    notWantAlways: [D2368OFF],
    notAtOpt: [],
  },
};

const count = (s: string, needle: string): number => s.split(needle).length - 1;

const dis = async (dir: string, name: string, rung: string[]): Promise<string> => {
  const out = `${dir}/${name}${rung.join("")}.wasm`;
  const b = await new Deno.Command(VL, {
    args: ["build", `${dir}/${name}.vl`, "-o", out, "--compiler", COMPILER, ...rung],
    env: nativeEnv({}),
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
  name: "memarg const fold: a local const address folds at its declaration",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-const-fold-" });
    try {
      for (const [name, c] of Object.entries(CASES)) {
        Deno.writeTextFileSync(`${dir}/${name}.vl`, [...PRE, ...c.prog].join("\n") + "\n");
        for (const rung of [[], ["-O"]]) {
          const wat = await dis(dir, name, rung);
          for (const w of c.wantAlways) {
            if (count(wat, w) < 1) {
              throw new Error(`${name} ${rung}: want \`${w.trim()}\`, got\n${wat}`);
            }
          }
          for (const w of c.notWantAlways) {
            if (count(wat, w) > 0) {
              throw new Error(`${name} ${rung}: want no \`${w}\`, got\n${wat}`);
            }
          }
          if (rung.includes("-O")) {
            for (const w of c.notAtOpt) {
              if (count(wat, w) > 0) {
                throw new Error(`${name} -O: want no \`${w}\`, got\n${wat}`);
              }
            }
          }
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

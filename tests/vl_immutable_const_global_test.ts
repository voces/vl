// A MODULE `const` WITH A CONSTANT INITIALIZER IS NEVER RE-LOADED.
//
// A `const` whose initializer is one scalar literal (or a negated one), or an integer constant
// expression over literals and other such consts (plumb PL-069), is read as that literal: every
// read is an `i32.const`/`i64.const`/`f32.const`/`f64.const` immediate, bit-exact, and the cell
// is dropped unless an export names it, in which case it stays an immutable global. A constant
// list or record keeps an immutable cell; a `let`, and a `const` whose initializer runs in the
// start function, stay mutable.
//
// GATING: needs the built binary, the seed and `wasm-dis` (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (!ENABLED) console.warn("[immutable-const-global] skipped — missing vl, the seed or wasm-dis");

// Every binding is read inside a function, so each keeps a cell rather than being promoted to
// a start-function local.
const PROGRAM = [
  "const A = 7",
  "const B = -1",
  "const C: i64 = -2147483648",
  "const D: f64 = -2",
  "const E: f32 = -1.5",
  "const F = [1, 2, 3]",
  "const G = A + 1",
  "const S = F[0] + 1",
  "const W: i64 = (G as i64) << 40",
  "let H = -4",
  "const Z = -0.0",
  "const M32 = -2147483648",
  "const M64: i64 = -9223372036854775808",
  "export const P = 9",
  "function use() {",
  "  H = H - 1",
  // `F[1]` first: `A + B` alone is a tree of constants, which folds into one immediate.
  "  print(F[1] + A + B + G + H + S)",
  "  print(C)",
  "  print(W)",
  "  print(D)",
  "  print(E)",
  "  print(1.0 / Z)",
  "  print(M32)",
  "  print(M64)",
  "  print(P)",
  // D2176: a function-body delivery of a hex literal to a wide slot keeps its value.
  "  const h: i64 = -0xFFFFFFFF",
  "  let qp: f64 = 0xFFFFFFFF",
  "  print(h)",
  "  print(qp)",
  "}",
  "use()",
].join("\n");

// The global section in declaration order: only the bindings that still need a cell.
const WANT_GLOBALS = [
  "(ref $", // F: an immutable ref built by a constant expression
  "(mut i32) (i32.const 0)", // S: its initializer runs in the start function
  "(mut i32) (i32.const -4)", // H: a `let` is mutable
  "i32 (i32.const 9)", // P: exported, so its immutable cell stays
];

// The immediates `use` reads its folded consts as, in source order; the sign of -0 and both
// minimum integers survive the copy.
const WANT_IMMEDIATES = [
  "(i32.const 7)",
  "(i32.const -1)",
  "(i32.const 8)", // G = A + 1, folded
  "(i64.const -2147483648)",
  "(i64.const 8796093022208)", // W = (G as i64) << 40, folded
  "(f64.const -2)",
  "(f32.const -1.5)",
  "(f64.const -0)",
  "(i32.const -2147483648)",
  "(i64.const -9223372036854775808)",
  "(i32.const 9)",
];
// `use` still loads F, H (twice) and S: the cells nothing folds.
const WANT_USE_GLOBAL_GETS = 4;

Deno.test({
  name: "immutable const global: a scalar-literal module const is read as its immediate",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir();
    try {
      Deno.writeTextFileSync(`${dir}/m.vl`, PROGRAM);
      const out = `${dir}/m.wasm`;
      const b = await new Deno.Command(VL, {
        args: ["build", `${dir}/m.vl`, "-o", out, "--compiler", COMPILER],
        env: nativeEnv({}),
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!b.success) {
        throw new Error(`vl build failed: ${new TextDecoder().decode(b.stderr)}`);
      }
      const d = await new Deno.Command(WASM_DIS, { args: [out], stdout: "piped" }).output();
      const wat = new TextDecoder().decode(d.stdout);
      const got = wat.split("\n")
        .filter((l) => l.startsWith(" (global $"))
        .map((l) => l.replace(/^ \(global \$\S+ /, ""));
      if (got.length !== WANT_GLOBALS.length) {
        throw new Error(`want ${WANT_GLOBALS.length} globals, got ${got.length}:\n${got.join("\n")}`);
      }
      for (let i = 0; i < got.length; i++) {
        if (!got[i].startsWith(WANT_GLOBALS[i])) {
          throw new Error(`global ${i}: want \`${WANT_GLOBALS[i]}…\`, got \`${got[i]}\``);
        }
      }
      const useStart = wat.indexOf(" (func $0");
      const useEnd = wat.indexOf(" (func ", useStart + 1);
      if (useStart < 0 || useEnd < 0) throw new Error(`no \`use\` body in:\n${wat}`);
      const use = wat.slice(useStart, useEnd);
      let at = 0;
      for (const imm of WANT_IMMEDIATES) {
        const k = use.indexOf(imm, at);
        if (k < 0) throw new Error(`\`use\` reads no \`${imm}\` after offset ${at}:\n${use}`);
        at = k + imm.length;
      }
      const gets = use.split("global.get").length - 1;
      if (gets !== WANT_USE_GLOBAL_GETS) {
        throw new Error(`\`use\`: want ${WANT_USE_GLOBAL_GETS} global.get, got ${gets}:\n${use}`);
      }
      const r = await new Deno.Command(VL, {
        args: ["run", `${dir}/m.vl`, "--compiler", COMPILER],
        env: nativeEnv({}),
        stdout: "piped",
        stderr: "piped",
      }).output();
      const stdout = new TextDecoder().decode(r.stdout);
      const want = "13\n-2147483648\n8796093022208\n-2\n-1.5\n-Infinity\n-2147483648\n" +
        "-9223372036854775808\n9\n-4294967295\n4294967295\n";
      if (!r.success || stdout !== want) {
        throw new Error(`vl run: want ${JSON.stringify(want)}, got ${JSON.stringify(stdout)}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

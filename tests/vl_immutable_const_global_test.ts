// A MODULE `const` WITH A CONSTANT INITIALIZER IS AN IMMUTABLE WASM GLOBAL.
//
// Engines can fold or hoist a read of an immutable global and must re-load a mutable one, so
// a `const` whose initializer is a constant expression (a literal, a negated numeric literal,
// a constant list or record) is declared without `mut`, and nothing stores to it. A `let` stays
// mutable, and so does a `const` whose initializer runs in the start function.
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
  "let H = -4",
  "function use() {",
  "  H = H - 1",
  "  print(A + B + F[1] + G + H)",
  "  print(C)",
  "  print(D)",
  "  print(E)",
  "}",
  "use()",
].join("\n");

// The global section in declaration order, one `(global …)` header per binding.
const WANT_GLOBALS = [
  "i32 (i32.const 7)",
  "i32 (i32.const -1)",
  "i64 (i64.const -2147483648)",
  "f64 (f64.const -2)",
  "f32 (f32.const -1.5)",
  "(ref $", // F: an immutable ref built by a constant expression
  "(mut i32) (i32.const 0)", // G: its initializer runs in the start function
  "(mut i32) (i32.const -4)", // H: a `let` is mutable
];

Deno.test({
  name: "immutable const global: a constant-initialized module const drops `mut`",
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
      const r = await new Deno.Command(VL, {
        args: ["run", `${dir}/m.vl`, "--compiler", COMPILER],
        env: nativeEnv({}),
        stdout: "piped",
        stderr: "piped",
      }).output();
      const stdout = new TextDecoder().decode(r.stdout);
      const want = "11\n-2147483648\n-2\n-1.5\n";
      if (!r.success || stdout !== want) {
        throw new Error(`vl run: want ${JSON.stringify(want)}, got ${JSON.stringify(stdout)}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

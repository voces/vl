// A HOST PRINT IMPORT IS DECLARED ONLY FOR THE PRINTS THAT CAN CALL IT.
//
// A plain build links every function of an imported module, so a trap reason in an unused
// `std:buffer` function reserves the four-import print family. The three wide-scalar imports
// (`__print_i64__`, `__print_f64__`, `__print_f32__`) are called only by `print`, so a module
// that never calls `print` declares none of them, however many wide types it spells.
//
// Gated like the other native suites (binary + seed).
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) console.warn("[print-imports] skipped — missing vl binary or seed wasm");

const FAMILY = ["__print_i32__", "__print_bool__", "__print_char__", "__print_str_flush__"];

const CASES: [string, string, string[]][] = [
  [
    "no print, a std module with a trap reason and wide types: the family only",
    'import { Buf } from "std:buffer"\nexport function f(n: i32): i32 { return n + 1 }\n',
    FAMILY,
  ],
  [
    "a print of each wide type: the family and all three",
    "const x: f64 = 1.5\nprint(x)\nprint(3 as i64)\nprint(2.5 as f32)\n",
    [...FAMILY, "__print_i64__", "__print_f64__", "__print_f32__"],
  ],
  [
    "no print and no std: none",
    "export function f(a: f64): f64 { return a * 2.0 }\n",
    [],
  ],
];

for (const [name, src, want] of CASES) {
  Deno.test({
    name: `print imports: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const dir = await Deno.makeTempDir();
      try {
        Deno.writeTextFileSync(`${dir}/m.vl`, src);
        const r = await new Deno.Command(VL, {
          args: ["build", `${dir}/m.vl`, "-o", `${dir}/m.wasm`, "--compiler", COMPILER],
          env: nativeEnv(),
          stdout: "piped",
          stderr: "piped",
        }).output();
        if (!r.success) {
          throw new Error(`vl build: want exit 0, got ${r.code}\n${new TextDecoder().decode(r.stderr)}`);
        }
        const mod = new WebAssembly.Module(Deno.readFileSync(`${dir}/m.wasm`) as BufferSource);
        const got = WebAssembly.Module.imports(mod)
          .filter((i) => i.name.startsWith("__print_"))
          .map((i) => i.name);
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          throw new Error(`print imports\n  want: ${JSON.stringify(want)}\n  got:  ${JSON.stringify(got)}`);
        }
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    },
  });
}

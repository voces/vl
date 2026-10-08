// NATIVE — a module the engine refuses for a heap-type mismatch names the two types, on all
// three channels (`vl run`, `vl build`, `vl check --codegen`), and names the function as the
// source spells it (lane DG, sunpa diagnostics C).
//
// The validator prints every concrete reference as `(ref $type)`, so the sentence was
// `expected (ref $type), found (ref null $type)` and named nothing. The host re-validates the
// module, reads the two types off the failing operator, and writes each module type index with
// its VL name (asked of the compiler that emitted the module) and its struct or array shape.
//
// THE WITNESSES MUST STILL BE INVALID: D3820 (single-file spelling), D3816 and D3817 are
// check-clean invalid wasm on the seed this lands on. When one is fixed its case goes red at the
// "still check-clean" or exit-code assertion; replace it with any other such program.
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` plus the built binary and seed.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-invalid-module-types] skipped — missing vl binary or seed wasm.");
}

const EXIT_COMPILER_BUG = 70;

const run = async (args: string[], cwd: string): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std`, VL_FAULT_INJECT: "" },
  }).output();
  return { code, out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr) };
};

const withDir = async (
  files: Record<string, string>,
  body: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-invalid-module-types-" });
  try {
    for (const [name, src] of Object.entries(files)) {
      Deno.writeTextFileSync(`${dir}/${name}`, src);
    }
    await body(dir);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

type Case = {
  name: string;
  files: Record<string, string>;
  entry: string;
  // Each text must appear on every channel.
  want: string[];
  // Text no channel may print.
  never: string[];
};

const CASES: Case[] = [
  {
    name: "D3820: a record expected where an i32 arrives names the record",
    files: {
      "h.vl": "type A = { x: i32 }\n" +
        'function d(self: A): string { "RA" }\n' +
        "function h<T>(x: T): string { x.d() }\n" +
        "const a: A = { x: 1 }\n" +
        "print([a].map((x) => h(x))[0])\n",
    },
    entry: "h.vl",
    want: [
      "failed to validate inside `h`",
      "type mismatch: expected (ref $0), found i32; $0 is `A`, struct {mut i32}",
    ],
    never: ["$type"],
  },
  {
    name: "D3816: a nullable string where a string is wanted names `string` and its shape",
    files: {
      "f.vl": 'function describe(self: string): string { "string " + self }\n' +
        'function f(n: string | null): string { n?.describe() ?? "none" }\n' +
        'print(f("nn"))\n',
    },
    entry: "f.vl",
    want: [
      "failed to validate inside `f`",
      "type mismatch: expected (ref $2), found (ref null $2); $2 is `string`, struct {(ref $1), i32, i32, mut i32}",
    ],
    never: ["$type"],
  },
  {
    name: "D3817: a canonical type id is a module index, and a merged function its source name",
    files: {
      "s.vl": 'export function describe(self: string): string { "string " + self }\n',
      "main.vl": 'import { describe } from "./s"\nexport function d(x) { x.describe() }\nprint(1)\n',
    },
    entry: "main.vl",
    want: [
      "failed to validate inside `d`",
      "callee returns [(ref $2)]; $2 is `string`, struct {(ref $1), i32, i32, mut i32}",
    ],
    never: ["(id ", "d$m0"],
  },
];

for (const c of CASES) {
  Deno.test({
    name: `vl-invalid-module-types: ${c.name}`,
    ignore: !ENABLED,
    fn: async () => {
      await withDir(c.files, async (dir) => {
        const chk = await run(["check", c.entry], dir);
        if (chk.code !== 0) {
          throw new Error(`the witness no longer check-cleans (fixed?) — replace it:\n${chk.out}`);
        }
        const channels: [string, string[]][] = [
          ["run", ["run", c.entry]],
          ["build", ["build", c.entry, "-o", `${dir}/out.wasm`]],
          ["check --codegen", ["check", "--codegen", c.entry]],
        ];
        for (const [what, args] of channels) {
          const r = await run(args, dir);
          if (r.code !== EXIT_COMPILER_BUG) {
            throw new Error(`${what}: want exit ${EXIT_COMPILER_BUG}, got ${r.code}\n${r.out}`);
          }
          for (const w of c.want) {
            if (!r.out.includes(w)) throw new Error(`${what}: want \`${w}\`, got:\n${r.out}`);
          }
          for (const n of c.never) {
            if (r.out.includes(n)) throw new Error(`${what}: must not print \`${n}\`:\n${r.out}`);
          }
        }
      });
    },
  });
}
